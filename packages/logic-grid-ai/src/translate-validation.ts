import type { Clue, ConstraintType, Puzzle } from "logic-grid";
import type {
  AIClient,
  JSONSchema,
  TranslationValidationCode,
  TranslationValidationError,
} from "./types";

/**
 * AI-driven semantic validator for translated puzzles, plus a sync
 * structural pre-check.
 *
 * NOT exported from the package. Internal to the {@link translate} retry loop.
 *
 * The semantic validator round-trips each translated clue back to a
 * constraint type and checks four properties per clue:
 *  1. Constraint type round-trip (with polarity baked in: `not_between` is a
 *     distinct value from `between`).
 *  2. Direction (only for `before` / `left_of`): does the translation's
 *     subject/object order match the source constraint's `a`/`b` fields?
 *  3. Numeric and unit preservation in the clue text.
 *  4. Proper-noun preservation in the clue text.
 *
 * The structural pre-check covers clue counts, empties, duplicates, and
 * the completeness of `categoryNames` / `valueLabels` (every canonical key
 * from the source puzzle must appear with a non-empty translation).
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

/** Per-clue length budget for translated clue text. */
const MAX_CLUE_LENGTH = 500;

/**
 * Stable header that opens every validator prompt. Exported so tests
 * (and consumers wiring multiple AI clients in front of `translate`) can
 * dispatch translator vs validator calls without depending on the rest
 * of the prompt copy, which may evolve.
 */
export const VALIDATOR_PROMPT_HEADER = "You are reviewing translated clues";

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

interface RawTranslation {
  clues: unknown[];
  categoryNames: Record<string, unknown>;
  valueLabels: Record<string, unknown>;
}

function err(
  code: TranslationValidationCode,
  message: string,
  opts: { clueIndex?: number; key?: string } = {},
): TranslationValidationError {
  const e: TranslationValidationError = { code, message };
  if (opts.clueIndex !== undefined) e.clueIndex = opts.clueIndex;
  if (opts.key !== undefined) e.key = opts.key;
  return e;
}

/**
 * Cheap, deterministic structural check on the raw translator output.
 * Run before the AI validator to reject obvious failures without burning
 * an LLM call.
 */
export function checkTranslationStructure(
  raw: RawTranslation,
  puzzle: Puzzle,
): TranslationValidationError[] {
  const errors: TranslationValidationError[] = [];
  const expectedClueCount = puzzle.clues.length;

  // --- Clues ---
  if (raw.clues.length !== expectedClueCount) {
    errors.push(
      err(
        "wrong_clue_count",
        `Expected ${expectedClueCount} clues, got ${raw.clues.length}.`,
      ),
    );
  }

  const seen = new Set<string>();

  for (let i = 0; i < raw.clues.length; i++) {
    const text = raw.clues[i];
    const pos = i + 1;

    if (typeof text !== "string") {
      errors.push(
        err("non_string_clue", `Clue ${pos} is not a string.`, {
          clueIndex: pos,
        }),
      );
      continue;
    }

    if (!text || text.trim() === "") {
      errors.push(
        err("empty_translation", `Clue ${pos} is empty.`, { clueIndex: pos }),
      );
      continue;
    }

    if (text.length > MAX_CLUE_LENGTH) {
      errors.push(
        err(
          "long_translation",
          `Clue ${pos} is too long (${text.length} chars, max ${MAX_CLUE_LENGTH}).`,
          { clueIndex: pos },
        ),
      );
    }

    const lower = text.toLowerCase();
    if (seen.has(lower)) {
      errors.push(
        err(
          "duplicate_translation",
          `Clue ${pos} is a duplicate of an earlier clue.`,
          { clueIndex: pos },
        ),
      );
    }
    seen.add(lower);
  }

  // --- Category names ---
  // Track localized→canonical to detect collisions: two distinct categories
  // mapping to the same display string would render as identical headers.
  const seenCategoryLabels = new Map<string, string>();
  for (const cat of puzzle.grid.categories) {
    const localized = raw.categoryNames[cat.name];
    if (localized === undefined) {
      errors.push(
        err(
          "missing_category_name",
          `Category "${cat.name}" has no localized name in categoryNames.`,
          { key: cat.name },
        ),
      );
      continue;
    }
    if (typeof localized !== "string" || localized.trim() === "") {
      errors.push(
        err(
          "empty_category_name",
          `Localized name for category "${cat.name}" is empty.`,
          { key: cat.name },
        ),
      );
      continue;
    }
    const lower = localized.trim().toLowerCase();
    const earlier = seenCategoryLabels.get(lower);
    if (earlier !== undefined) {
      errors.push(
        err(
          "duplicate_category_name",
          `Localized category name "${localized}" is shared by canonical names "${earlier}" and "${cat.name}".`,
          { key: cat.name },
        ),
      );
    } else {
      seenCategoryLabels.set(lower, cat.name);
    }
  }

  // --- Value labels ---
  // Same collision check across all categories. Values are globally unique
  // by logic-grid contract, so we walk every value in one pass.
  const seenValueLabels = new Map<string, string>();
  for (const cat of puzzle.grid.categories) {
    for (const value of cat.values) {
      const localized = raw.valueLabels[value];
      if (localized === undefined) {
        errors.push(
          err(
            "missing_value_label",
            `Value "${value}" has no localized label in valueLabels.`,
            { key: value },
          ),
        );
        continue;
      }
      if (typeof localized !== "string" || localized.trim() === "") {
        errors.push(
          err(
            "empty_value_label",
            `Localized label for value "${value}" is empty.`,
            { key: value },
          ),
        );
        continue;
      }
      const lower = localized.trim().toLowerCase();
      const earlier = seenValueLabels.get(lower);
      if (earlier !== undefined) {
        errors.push(
          err(
            "duplicate_value_label",
            `Localized label "${localized}" is shared by canonical values "${earlier}" and "${value}".`,
            { key: value },
          ),
        );
      } else {
        seenValueLabels.set(lower, value);
      }
    }
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
                "All proper nouns and category-value names from the source are preserved verbatim in the clue text (inflection of descriptive words is fine).",
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
  let prompt = `${VALIDATOR_PROMPT_HEADER} for a logic-grid puzzle (English → ${locale}).

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

4. properNounsOk: are all proper nouns from the source preserved verbatim
   in the ${locale} clue text? Names of people, places, brands, ships, and
   numeric/literal values must NOT be translated. Inflection of descriptive
   words (colors, animals, common nouns) is FINE — that's not a violation.

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
  puzzle: Puzzle,
  raw: { clues: string[] },
  locale: string,
  validator: AIClient,
): Promise<TranslationValidationError[]> {
  const sourceClues = puzzle.clues;
  if (sourceClues.length === 0) return [];

  const schema = buildSchema(sourceClues.length);
  const prompt = buildPrompt(sourceClues, raw.clues, locale);
  const result = await validator.completeJSON<ValidatorResult>(prompt, schema);

  // Verify verdict order matches source clue order before we trust the
  // per-clue judgements. The schema guarantees count and item shape but
  // not that verdicts arrive in source order — a misordered batch would
  // silently misalign every check below. Bail early so the retry loop
  // gets fresh verdicts; partial per-clue results from a broken batch
  // would just confuse the feedback prompt.
  for (let i = 0; i < sourceClues.length; i++) {
    const verdict = result.clues[i];
    if (verdict.index !== i + 1) {
      return [
        {
          code: "verdict_index_mismatch",
          message: `Validator returned verdict with index ${verdict.index} at array position ${i + 1}; verdicts must align with source clue order.`,
          clueIndex: i + 1,
        },
      ];
    }
  }

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
          { clueIndex: pos },
        ),
      );
    }

    if (ASYMMETRIC.has(source.constraint.type) && !verdict.directionOk) {
      errors.push(
        err(
          "direction_flip",
          `Clue ${pos}: subject/object order is reversed for ${source.constraint.type}.`,
          { clueIndex: pos },
        ),
      );
    }

    if (!verdict.numericOk) {
      errors.push(
        err(
          "numeric_changed",
          `Clue ${pos}: numbers or units differ from the source constraint.`,
          { clueIndex: pos },
        ),
      );
    }

    if (!verdict.properNounsOk) {
      errors.push(
        err(
          "proper_noun_dropped",
          `Clue ${pos}: a proper noun or value name was changed.`,
          { clueIndex: pos },
        ),
      );
    }
  }

  return errors;
}
