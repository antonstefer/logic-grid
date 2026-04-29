import type { Clue, ConstraintType } from "logic-grid";
import type {
  AIClient,
  JSONSchema,
  TranslationValidationCode,
  TranslationValidationError,
} from "./types";

/**
 * AI-driven semantic validator for translated clues.
 *
 * NOT exported from the package. Internal to the {@link translate} retry loop.
 *
 * The validator round-trips each translation back to a constraint type and
 * checks four properties per clue:
 *  1. Constraint type round-trip (with polarity baked in: `not_between` is a
 *     distinct value from `between`).
 *  2. Direction (only for `before` / `left_of`): does the translation's
 *     subject/object order match the source constraint's `a`/`b` fields?
 *  3. Numeric and unit preservation.
 *  4. Proper-noun preservation.
 *
 * All checks are evaluated by a single AI call against a structured schema —
 * the verdicts are typed booleans + an enum, not free-text reasoning. Failures
 * are mapped to {@link TranslationValidationError} with stable codes.
 *
 * Caller is responsible for picking a validator client distinct from the
 * translator (or accepting correlated blind spots if the same client is used).
 */

const CONSTRAINT_TYPES: ConstraintType[] = [
  "same_position",
  "not_same_position",
  "next_to",
  "not_next_to",
  "left_of",
  "before",
  "between",
  "not_between",
  "exact_distance",
];

const ASYMMETRIC: Set<ConstraintType> = new Set(["before", "left_of"]);

interface ClueVerdict {
  index: number;
  constraintType: string;
  directionOk: boolean;
  numericOk: boolean;
  properNounsOk: boolean;
}

interface ValidatorResult {
  clues: ClueVerdict[];
}

function err(
  code: TranslationValidationCode,
  message: string,
  clueIndex?: number,
): TranslationValidationError {
  return clueIndex !== undefined
    ? { code, message, clueIndex }
    : { code, message };
}

/**
 * Cheap, deterministic structural check on the raw translator output.
 * Run before the AI validator to reject obvious failures without burning
 * an LLM call. Mirrors {@link validateRewrittenClues}'s shape.
 */
export function checkTranslationStructure(
  result: { clues: unknown[] },
  expectedCount: number,
): TranslationValidationError[] {
  const errors: TranslationValidationError[] = [];

  if (result.clues.length !== expectedCount) {
    errors.push(
      err(
        "wrong_clue_count",
        `Expected ${expectedCount} clues, got ${result.clues.length}.`,
      ),
    );
  }

  const seen = new Set<string>();

  for (let i = 0; i < result.clues.length; i++) {
    const text = result.clues[i];
    const pos = i + 1;

    if (typeof text !== "string") {
      errors.push(err("non_string_clue", `Clue ${pos} is not a string.`, pos));
      continue;
    }

    if (!text || text.trim() === "") {
      errors.push(err("empty_translation", `Clue ${pos} is empty.`, pos));
      continue;
    }

    if (text.length > 500) {
      errors.push(
        err(
          "long_translation",
          `Clue ${pos} is too long (${text.length} chars, max 500).`,
          pos,
        ),
      );
    }

    const lower = text.toLowerCase();
    if (seen.has(lower)) {
      errors.push(
        err(
          "duplicate_translation",
          `Clue ${pos} is a duplicate of an earlier clue.`,
          pos,
        ),
      );
    }
    seen.add(lower);
  }

  return errors;
}

function buildSchema(clueCount: number): JSONSchema {
  return {
    type: "object",
    properties: {
      clues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "1-indexed clue position",
            },
            constraintType: {
              type: "string",
              enum: CONSTRAINT_TYPES,
              description:
                "The constraint type the translated sentence expresses. Polarity is part of the type — return 'not_between' (not 'between') when the translation expresses negation.",
            },
            directionOk: {
              type: "boolean",
              description:
                "For `before` and `left_of`: is the translation's subject the same as the source constraint's `a` field? For symmetric constraints, always true.",
            },
            numericOk: {
              type: "boolean",
              description:
                "All numbers and units from the source constraint are preserved exactly in the translated text.",
            },
            properNounsOk: {
              type: "boolean",
              description:
                "All proper nouns and category-value names from the source are preserved verbatim.",
            },
          },
          required: [
            "index",
            "constraintType",
            "directionOk",
            "numericOk",
            "properNounsOk",
          ],
        },
        minItems: clueCount,
        maxItems: clueCount,
      },
    },
    required: ["clues"],
  };
}

function buildPrompt(
  sourceClues: Clue[],
  translated: string[],
  locale: string,
): string {
  let prompt = `You are reviewing a translation of logic-puzzle clues from English to ${locale}.

For each clue, parse the ${locale} sentence back to a constraint and verify:

1. constraintType: which of these does the ${locale} sentence express?
   ${CONSTRAINT_TYPES.join(" | ")}
   Polarity is part of the type — \`not_between\` is distinct from \`between\`,
   \`not_next_to\` is distinct from \`next_to\`, \`not_same_position\` is
   distinct from \`same_position\`. If the negation is dropped, return the
   POSITIVE type so the mismatch is visible.

2. directionOk (only meaningful for \`before\` and \`left_of\`): is the subject
   of the ${locale} sentence the same entity as the source constraint's \`a\`
   field? If the translation says "B is before A" when the source says
   \`before(a=A, b=B)\`, that's a flip — return false. For symmetric
   constraints (same_position, not_same_position, next_to, not_next_to,
   between, not_between, exact_distance), always return true.

3. numericOk: are all numbers and units from the source constraint preserved
   exactly in the ${locale} text?

4. properNounsOk: are all proper nouns and category-value names from the
   source preserved verbatim (Alice stays Alice; "Black River fund" stays
   "Black River fund")?

Be calibrated — accept fluent translations that preserve meaning even if
phrased differently. Only flag GENUINE semantic drift, not stylistic
variation.

## Source / translation pairs`;

  for (let i = 0; i < sourceClues.length; i++) {
    prompt += `\n\n${i + 1}. EN: "${sourceClues[i].text}"\n   Constraint: ${JSON.stringify(sourceClues[i].constraint)}\n   ${locale}: "${translated[i]}"`;
  }

  return prompt;
}

export async function validateTranslation(
  sourceClues: Clue[],
  translated: string[],
  locale: string,
  validator: AIClient,
): Promise<TranslationValidationError[]> {
  if (sourceClues.length === 0) return [];

  const schema = buildSchema(sourceClues.length);
  const prompt = buildPrompt(sourceClues, translated, locale);
  const result = await validator.completeJSON<ValidatorResult>(prompt, schema);

  const errors: TranslationValidationError[] = [];

  for (let i = 0; i < sourceClues.length; i++) {
    const verdict = result.clues[i];
    const source = sourceClues[i];
    const pos = i + 1;

    if (verdict.constraintType !== source.constraint.type) {
      errors.push(
        err(
          "constraint_type_mismatch",
          `Clue ${pos}: translation expresses '${verdict.constraintType}' but source constraint is '${source.constraint.type}'.`,
          pos,
        ),
      );
    }

    if (ASYMMETRIC.has(source.constraint.type) && !verdict.directionOk) {
      errors.push(
        err(
          "direction_flip",
          `Clue ${pos}: subject/object order is reversed for ${source.constraint.type}.`,
          pos,
        ),
      );
    }

    if (!verdict.numericOk) {
      errors.push(
        err(
          "numeric_changed",
          `Clue ${pos}: numbers or units differ from the source constraint.`,
          pos,
        ),
      );
    }

    if (!verdict.properNounsOk) {
      errors.push(
        err(
          "proper_noun_dropped",
          `Clue ${pos}: a proper noun or value name was changed.`,
          pos,
        ),
      );
    }
  }

  return errors;
}
