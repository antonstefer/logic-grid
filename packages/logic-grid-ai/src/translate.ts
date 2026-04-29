import type {
  TranslateOptions,
  AIClient,
  JSONSchema,
  TranslationValidationError,
} from "./types";
import type { Clue } from "logic-grid";
import { createAnthropicClient } from "./client";
import {
  checkTranslationStructure,
  validateTranslation,
} from "./translate-validation";

const MAX_RETRIES = 3;

/**
 * Thrown by {@link translate} when AI output fails validation on every retry.
 * `errors` contains the structured validation errors from the final attempt.
 */
export class TranslationError extends Error {
  readonly errors: TranslationValidationError[];

  constructor(message: string, errors: TranslationValidationError[]) {
    super(message);
    this.name = "TranslationError";
    this.errors = errors;
  }
}

interface TranslateRawResult {
  clues: string[];
}

function buildSchema(clueCount: number): JSONSchema {
  return {
    type: "object",
    properties: {
      clues: {
        type: "array",
        items: { type: "string", minLength: 1 },
        minItems: clueCount,
        maxItems: clueCount,
        description:
          "Translated clue texts, one per source clue, in the same order",
      },
    },
    required: ["clues"],
  };
}

function buildPrompt(
  options: TranslateOptions,
  previousErrors?: string[],
): string {
  const { clues, locale } = options;

  let prompt = `You are translating logic-puzzle clues from English to ${locale}.

GROUND TRUTH: For each clue, the JSON constraint defines the meaning. The
English text is a stylistic reference — if it disagrees with the constraint,
follow the constraint.

## Translation rules

1. Preserve the EXACT semantic relationship for each clue:
   - "next_to" / "right next to" means strict rank-adjacency. Use the
     adjacency word in ${locale}, not a "near" or "close to" word.
   - "left_of" means immediately preceding. Distinct from "before".
   - "before" means somewhere earlier in order. Distinct from "left_of".
   - "exactly N apart" preserves the numeric value and unit exactly.
   - Negative constraints (\`not_*\`) MUST preserve the negation.
2. Preserve directional asymmetry. For \`before\` and \`left_of\`, the
   subject is \`a\` and the object is \`b\` — do not swap them.
3. Preserve all proper nouns and category-value names verbatim
   (Alice stays Alice; "Black River fund" stays "Black River fund").
4. Preserve numeric values and units exactly.
5. Output one clue per source clue, in the same order.

## Source clues`;

  for (let i = 0; i < clues.length; i++) {
    prompt += `\n\n${i + 1}. Original: "${clues[i].text}"\n   Constraint: ${JSON.stringify(clues[i].constraint)}`;
  }

  if (previousErrors && previousErrors.length > 0) {
    prompt += `\n\n## Previous attempt had errors — please fix:\n${previousErrors.map((e) => `- ${e}`).join("\n")}`;
  }

  return prompt;
}

/**
 * Translate puzzle clues to a target locale using AI.
 *
 * The package engine is English-only by design. This function is a
 * post-processing layer for ahead-of-time (AOT) puzzle pipelines that need
 * localized output: generate puzzles in English, then translate the rendered
 * clues here. The underlying constraints are passed through verbatim — only
 * the surface text changes.
 *
 * Two-stage AI flow:
 *  1. The translator produces a localized clue per source clue, in one
 *     batched call. The constraint JSON is shown alongside each English
 *     clue as ground truth.
 *  2. A validator (separately configurable client) round-trips each
 *     translation back to a constraint type and checks polarity, direction,
 *     numerics, and proper-noun preservation.
 *
 * Validation failures are fed back to the translator on retry, mirroring
 * {@link rewriteClues} and {@link generateTheme}. Up to 3 attempts.
 *
 * Single-model validation has correlated blind spots — for best rigor pass
 * a `validator` client backed by a different model than `client`.
 *
 * Note: the package retries on *semantic* failures only. Transport-level
 * retries (429s, 5xx, network errors) are handled inside the Anthropic SDK
 * with exponential backoff and don't consume one of the 3 attempts.
 *
 * @throws {TranslationError} If translation fails validation after all
 *   retry attempts. Inspect `error.errors` for the structured failures.
 * @throws {Error} If `locale` is empty.
 */
export async function translate(options: TranslateOptions): Promise<Clue[]> {
  const { clues, locale } = options;

  if (!locale || locale.trim() === "") {
    throw new Error("locale must be a non-empty string");
  }

  if (clues.length === 0) return [];

  const translator: AIClient = options.client ?? createAnthropicClient();
  const validator: AIClient =
    options.validator ??
    options.client ??
    createAnthropicClient(undefined, { temperature: 0 });

  const schema = buildSchema(clues.length);

  let lastErrors: TranslationValidationError[] | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const prompt = buildPrompt(
      options,
      lastErrors?.map((e) => e.message),
    );
    const raw = await translator.completeJSON<TranslateRawResult>(
      prompt,
      schema,
    );

    const structural = checkTranslationStructure(raw, clues.length);
    if (structural.length > 0) {
      lastErrors = structural;
      continue;
    }

    const semantic = await validateTranslation(
      clues,
      raw.clues,
      locale,
      validator,
    );
    if (semantic.length === 0) {
      return raw.clues.map((text, i) => ({
        constraint: clues[i].constraint,
        text,
      }));
    }

    lastErrors = semantic;
  }

  throw new TranslationError(
    `Translation to ${locale} failed after ${MAX_RETRIES} attempts. Last errors:\n${lastErrors!
      .map((e) => e.message)
      .join("\n")}`,
    lastErrors!,
  );
}
