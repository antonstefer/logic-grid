import type {
  RewriteCluesOptions,
  RewriteCluesResult,
  AIClient,
  JSONSchema,
  RewriteCluesValidationError,
} from "./types";
import type { Clue } from "logic-grid";
import { createAnthropicClient } from "./client";
import { validateRewrittenClues } from "./clue-validation";

const MAX_RETRIES = 3;

/**
 * Thrown by {@link rewriteClues} when AI output fails validation on every retry.
 * `errors` contains the structured validation errors from the final attempt.
 */
export class RewriteCluesError extends Error {
  readonly errors: RewriteCluesValidationError[];

  constructor(message: string, errors: RewriteCluesValidationError[]) {
    super(message);
    this.name = "RewriteCluesError";
    this.errors = errors;
  }
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
          "Rewritten clue texts, one per original clue, in the same order",
      },
    },
    required: ["clues"],
  };
}

function buildPrompt(
  options: RewriteCluesOptions,
  previousErrors?: string[],
): string {
  const { clues, style } = options;

  let prompt = `You are rewriting clues for a logic grid puzzle (like Einstein's riddle).

## Rules
- Rewrite each clue so it sounds natural and engaging, avoiding repetitive sentence structures.
- PRESERVE the exact logical meaning of each clue. The constraint JSON shows the ground truth — use it.
- Synonyms for value names are fine as long as there is no ambiguity (the solver must still be able to identify which value is meant).
- Each clue must be a single sentence ending with a period.
- Do not add information beyond what the constraint states.
- Do not combine or split clues. Return exactly one rewritten text per input clue, in the same order.`;

  if (style) {
    prompt += `\n\n## Style\nWrite in a ${style} style.`;
  }

  prompt += "\n\n## Clues to rewrite\n";

  for (let i = 0; i < clues.length; i++) {
    prompt += `\n${i + 1}. Original: "${clues[i].text}"\n   Constraint: ${JSON.stringify(clues[i].constraint)}`;
  }

  if (previousErrors && previousErrors.length > 0) {
    prompt += `\n\n## Previous attempt had errors — please fix:\n${previousErrors.map((e) => `- ${e}`).join("\n")}`;
  }

  return prompt;
}

/**
 * Rewrite puzzle clues using AI to produce varied, natural English.
 *
 * Sends all clues in a single batched AI call. Each clue is accompanied
 * by its constraint JSON so the AI has ground truth semantics.
 *
 * Note: this retries on *semantic* failures (the AI returned invalid output).
 * Transport-level retries (429s, 5xx, network errors) are already handled
 * inside the Anthropic SDK with built-in exponential backoff — they do not
 * consume one of our 3 attempts.
 *
 * @throws {RewriteCluesError} If rewriting fails after all retry attempts.
 *   Inspect `error.errors` for the structured validation failures.
 */
export async function rewriteClues(
  options: RewriteCluesOptions,
): Promise<Clue[]> {
  const { clues } = options;

  if (clues.length === 0) return [];

  const client: AIClient = options.client ?? createAnthropicClient();
  const schema = buildSchema(clues.length);

  let lastErrors: RewriteCluesValidationError[] | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const prompt = buildPrompt(
      options,
      lastErrors?.map((e) => e.message),
    );
    const result = await client.completeJSON<RewriteCluesResult>(
      prompt,
      schema,
    );

    const errors = validateRewrittenClues(result, clues.length);
    if (errors.length === 0) {
      return result.clues.map((text, i) => ({
        constraint: clues[i].constraint,
        text,
      }));
    }

    lastErrors = errors;
  }

  throw new RewriteCluesError(
    `Clue rewriting failed after ${MAX_RETRIES} attempts. Last errors:\n${lastErrors!
      .map((e) => e.message)
      .join("\n")}`,
    lastErrors!,
  );
}
