import type {
  TranslateOptions,
  TranslatedPuzzle,
  AIClient,
  JSONSchema,
  TranslationValidationCode,
  TranslationValidationError,
} from "./types";
import { createAnthropicClient } from "./client";
import {
  checkTranslationStructure,
  validateTranslation,
} from "./translate-validation";

const MAX_RETRIES = 3;

/**
 * Stable header that opens every translator prompt. Exported so tests
 * (and consumers wiring multiple AI clients in front of `translate`) can
 * dispatch translator vs validator calls without depending on the rest
 * of the prompt copy, which may evolve.
 */
export const TRANSLATOR_PROMPT_HEADER =
  "You are translating a logic-grid puzzle";

/** Validator-side feedback codes that the translator can't act on; we
 *  filter these out of the retry-feedback list so we don't waste tokens
 *  feeding them into a prompt that has no influence over them. */
const VALIDATOR_ONLY_CODES = new Set<TranslationValidationCode>([
  "verdict_index_mismatch",
]);

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
  categoryNames: Record<string, string>;
  valueLabels: Record<string, string>;
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
          "Translated clue texts, one per source clue, in the same order.",
      },
      // categoryNames / valueLabels are typed as bare objects rather than
      // schemas with explicit `properties`, because the required keys vary
      // per puzzle (the source's category and value names) and JSON Schema
      // can't be parameterized over a runtime key set without code-genning
      // a schema per call. Key presence and shape are enforced by
      // `checkTranslationStructure` on the returned output instead.
      categoryNames: {
        type: "object",
        description:
          "Map from each canonical category name (English) to its localized display name. Every category from the source puzzle must appear as a key.",
      },
      valueLabels: {
        type: "object",
        description:
          "Map from each canonical category value (English) to its localized label. Every value from every category must appear as a key. Proper nouns (people, places, brands) map to themselves verbatim. Numeric/literal values (like '1972' or '8%') stay as the literal string.",
      },
    },
    required: ["clues", "categoryNames", "valueLabels"],
  };
}

function buildPrompt(
  options: TranslateOptions,
  previousErrors?: string[],
): string {
  const { puzzle, locale } = options;
  const { grid, clues } = puzzle;

  const categoryList = grid.categories
    .map(
      (c) =>
        `- ${c.name}: [${c.values.map((v) => `"${v}"`).join(", ")}]${
          c.noun !== undefined && c.noun !== ""
            ? ` (noun phrase in clues: "${c.noun}")`
            : ""
        }`,
    )
    .join("\n");

  let prompt = `${TRANSLATOR_PROMPT_HEADER} from English to ${locale}.

GROUND TRUTH: For each clue, the JSON constraint defines the meaning. The
English clue text is a stylistic reference — if it disagrees with the
constraint, follow the constraint.

You must produce three things:

A. Localized clue text, one per source clue, in order.
B. \`categoryNames\`: a map from each canonical category name to its localized
   display name. ALL category names listed below must appear as keys.
C. \`valueLabels\`: a map from each canonical category value to its localized
   label. ALL values listed below must appear as keys.

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
3. **Proper nouns and literal values stay verbatim** in BOTH the clue text
   AND \`valueLabels\`:
   - People names (Alice, Bob, Carol).
   - Place names, brand names, ship names, fund names.
   - Numeric or unit literals like "1972", "8%", "7am".
   In \`valueLabels\`, these map to themselves: \`{ "Alice": "Alice" }\`.
4. **Descriptive words and adjectives translate** in both surfaces. Color
   names, animal names, common-noun categories. Inflections in clue text
   are expected (e.g. "yellow" → "gelb" in the bare label, "gelben" /
   "gelbe" in the inflected clue text — both correct).
5. Category names ARE descriptive — translate them too unless they're
   already a proper noun.

## Categories

${categoryList}

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
 * Translate a logic-grid puzzle to a target locale using AI.
 *
 * The package engine is English-only by design. This function is a
 * post-processing layer for ahead-of-time (AOT) puzzle pipelines that need
 * localized output: generate puzzles in English, then translate the visible
 * surfaces — clue text, category names, and value labels — here. The
 * underlying constraints and the canonical `puzzle.grid` are passed through
 * verbatim; only the rendered text changes.
 *
 * Two-stage AI flow:
 *  1. The translator produces localized clues + category-name map + value-
 *     label map in one batched call. The constraint JSON is shown alongside
 *     each English clue as ground truth.
 *  2. A validator (separately configurable client) round-trips each
 *     translated clue back to a constraint type and checks polarity,
 *     direction, numerics, and proper-noun preservation across all three
 *     output surfaces.
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
/**
 * Locale string format. The locale is interpolated verbatim into both
 * the translator and validator prompts, so the package — not just any
 * HTTP layer that wraps it — has to reject anything that could break out
 * of prompt context. Allows plain language names ("German", "Japanese"),
 * BCP-47 codes ("de-DE", "zh-Hans"), and short multi-word forms; rejects
 * newlines, quotes, brackets, and punctuation. Cap of 50 chars (real
 * locales never exceed ~30).
 */
const LOCALE_RE = /^[A-Za-z][A-Za-z0-9\-_ ]{0,49}$/;

/** ... see top-level JSDoc on `translate` ... */
/**
 * @throws {TranslationError} If translation fails validation after all
 *   retry attempts. Inspect `error.errors` for the structured failures.
 * @throws {Error} If `locale` is empty or contains characters that aren't
 *   safe to interpolate into the AI prompt.
 */
export async function translate(
  options: TranslateOptions,
): Promise<TranslatedPuzzle> {
  const { puzzle, locale } = options;

  if (typeof locale !== "string" || locale.trim() === "") {
    throw new Error("locale must be a non-empty string");
  }
  const cleanLocale = locale.trim();
  if (!LOCALE_RE.test(cleanLocale)) {
    throw new Error(
      "locale must contain only letters, digits, hyphens, underscores, and spaces (max 50 chars). The string is interpolated into the AI prompt, so punctuation that could break prompt context is rejected.",
    );
  }

  // Sanitized form is what flows into prompts and validator calls; the
  // user's original `options.locale` is left untouched.
  const sanitizedOptions: TranslateOptions = {
    ...options,
    locale: cleanLocale,
  };

  const translator: AIClient = options.client ?? createAnthropicClient();
  const validator: AIClient =
    options.validator ??
    options.client ??
    createAnthropicClient(undefined, { temperature: 0 });

  const schema = buildSchema(puzzle.clues.length);

  let lastErrors: TranslationValidationError[] | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Only feed back errors the translator can actually act on. Validator-
    // ordering issues (verdict_index_mismatch) are noise to the translator.
    const translatorFeedback = lastErrors
      ?.filter((e) => !VALIDATOR_ONLY_CODES.has(e.code))
      .map((e) => e.message);
    const prompt = buildPrompt(
      sanitizedOptions,
      translatorFeedback && translatorFeedback.length > 0
        ? translatorFeedback
        : undefined,
    );
    const raw = await translator.completeJSON<TranslateRawResult>(
      prompt,
      schema,
    );

    const structural = checkTranslationStructure(raw, puzzle);
    if (structural.length > 0) {
      lastErrors = structural;
      continue;
    }

    const semantic = await validateTranslation(
      puzzle,
      raw,
      cleanLocale,
      validator,
    );
    if (semantic.length === 0) {
      return {
        clues: raw.clues.map((text, i) => ({
          constraint: puzzle.clues[i].constraint,
          text,
        })),
        categoryNames: raw.categoryNames,
        valueLabels: raw.valueLabels,
      };
    }

    lastErrors = semantic;
  }

  throw new TranslationError(
    `Translation to ${cleanLocale} failed after ${MAX_RETRIES} attempts. Last errors:\n${lastErrors!
      .map((e) => e.message)
      .join("\n")}`,
    lastErrors!,
  );
}
