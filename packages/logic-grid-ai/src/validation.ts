import type { ThemeValidationCode, ThemeValidationError } from "./types";

/** Loose shape for untrusted AI category output. All fields optional. */
interface RawCategory {
  name?: string;
  values?: string[];
  noun?: string;
  verb?: [string, string];
  subjectPriority?: number;
  valueSuffix?: string;
  positionAdjective?: [string, string];
  ordered?: boolean;
  numericValues?: number[];
  orderingPhrases?: {
    unit?: [string, string];
    comparators?: Record<string, unknown>;
  };
}

const POSITIONAL_WORDS = new Set([
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
]);

const SYMMETRIC_COMPARATORS = new Set([
  "next_to",
  "not_next_to",
  "between",
  "not_between",
  "exact_distance",
]);

function err(
  code: ThemeValidationCode,
  message: string,
  category?: string,
): ThemeValidationError {
  return category !== undefined
    ? { code, message, category }
    : { code, message };
}

/**
 * Validate AI-generated theme output against structural and semantic rules.
 *
 * Returns an array of structured errors. Empty array means the result is valid.
 * Each error has a stable `code` (machine-readable) and `message` (human-readable).
 * Used internally by generateTheme to decide whether to retry; exported for
 * custom pipelines that bring their own client.
 *
 * The input shape is intentionally loose because this function validates
 * untrusted AI JSON output. The caller (generateTheme) casts to ThemeResult
 * only after validation passes.
 */
export function validateThemeResult(
  result: { categories: readonly unknown[] },
  expectedSize: number,
  expectedCategories: number,
): ThemeValidationError[] {
  const errors: ThemeValidationError[] = [];

  if (result.categories.length !== expectedCategories) {
    errors.push(
      err(
        "wrong_category_count",
        `Expected ${expectedCategories} categories, got ${result.categories.length}.`,
      ),
    );
  }

  const seenNames = new Set<string>();
  const seenValues = new Map<string, string>();
  const seenNouns = new Set<string>();
  let personCount = 0;
  let orderedCount = 0;

  for (const raw of result.categories) {
    const cat = raw as RawCategory;
    const name = cat.name ?? "";

    // Category name checks
    if (!name || name.trim() === "") {
      errors.push(err("empty_category_name", "A category has an empty name."));
    } else if (name.length > 30) {
      errors.push(
        err(
          "long_category_name",
          `Category name "${name}" is too long (${name.length} chars, max 30).`,
          name,
        ),
      );
    }
    const nameLower = name.toLowerCase();
    if (seenNames.has(nameLower)) {
      errors.push(
        err(
          "duplicate_category_name",
          `Duplicate category name "${name}".`,
          name,
        ),
      );
    }
    seenNames.add(nameLower);

    // Value count
    const values = cat.values ?? [];
    if (values.length !== expectedSize) {
      errors.push(
        err(
          "wrong_value_count",
          `Category "${name}" has ${values.length} values, expected ${expectedSize}.`,
          name,
        ),
      );
    }

    // Value checks
    for (const val of values) {
      if (val.trim() === "") {
        errors.push(
          err("empty_value", `Category "${name}" has an empty value.`, name),
        );
      } else if (val.length > 30) {
        errors.push(
          err(
            "long_value",
            `Category "${name}" value "${val}" is too long (${val.length} chars, max 30).`,
            name,
          ),
        );
      }
      const valLower = val.toLowerCase();
      const existing = seenValues.get(valLower);
      if (existing !== undefined) {
        errors.push(
          err(
            "duplicate_value",
            `Duplicate value "${val}" (also in category with value "${existing}").`,
            name,
          ),
        );
      } else {
        seenValues.set(valLower, val);
      }
      if (POSITIONAL_WORDS.has(valLower)) {
        errors.push(
          err(
            "positional_word_value",
            `Category "${name}" value "${val}" collides with a positional word.`,
            name,
          ),
        );
      }
    }

    // Noun checks
    if (cat.noun === "" || cat.noun === undefined) {
      personCount++;
    } else if (cat.noun.trim() === "") {
      errors.push(
        err(
          "whitespace_noun",
          `Category "${name}" has a whitespace-only noun. Use a meaningful noun or "" for person categories.`,
          name,
        ),
      );
    } else {
      const nounLower = cat.noun.toLowerCase();
      if (seenNouns.has(nounLower)) {
        errors.push(
          err(
            "duplicate_noun",
            `Duplicate noun "${cat.noun}" in category "${name}".`,
            name,
          ),
        );
      }
      seenNouns.add(nounLower);
    }

    // Verb checks
    if (cat.verb !== undefined) {
      if (
        !Array.isArray(cat.verb) ||
        cat.verb.length !== 2 ||
        typeof cat.verb[0] !== "string" ||
        typeof cat.verb[1] !== "string"
      ) {
        errors.push(
          err(
            "invalid_verb",
            `Category "${name}" has invalid verb. Must be [positive, negative] string pair.`,
            name,
          ),
        );
      } else if (cat.verb[0].trim() === "" || cat.verb[1].trim() === "") {
        errors.push(
          err("empty_verb", `Category "${name}" has empty verb strings.`, name),
        );
      }
    } else if (cat.noun !== "" && cat.noun !== undefined) {
      // Every non-person category must have a verb so same_position renders cleanly.
      errors.push(
        err(
          "missing_verb",
          `Category "${name}" requires a verb. Only the person category (noun: "") may omit it.`,
          name,
        ),
      );
    }

    // Ordered category check
    if (cat.ordered === true) {
      orderedCount++;
    }

    // numericValues / orderingPhrases (valid on any category)
    if (cat.numericValues !== undefined) {
      if (
        !Array.isArray(cat.numericValues) ||
        cat.numericValues.length !== expectedSize
      ) {
        errors.push(
          err(
            "invalid_numeric_values",
            `Category "${name}" numericValues must have exactly ${expectedSize} numbers.`,
            name,
          ),
        );
      } else if (
        cat.numericValues.some((v: unknown) => typeof v !== "number")
      ) {
        errors.push(
          err(
            "invalid_numeric_values",
            `Category "${name}" numericValues must all be numbers.`,
            name,
          ),
        );
      } else if (cat.numericValues.some((v, i, a) => i > 0 && v <= a[i - 1])) {
        errors.push(
          err(
            "non_ascending_numeric_values",
            `Category "${name}" numericValues must be in strictly ascending order.`,
            name,
          ),
        );
      }
    }
    if (
      cat.orderingPhrases !== undefined &&
      (cat.orderingPhrases === null || typeof cat.orderingPhrases !== "object")
    ) {
      errors.push(
        err(
          "invalid_ordering_phrases",
          `Category "${name}" orderingPhrases must be an object.`,
          name,
        ),
      );
    }
    // Symmetric comparators must be single strings, not [forward, reverse].
    // NOTE: duplicated in logic-grid/src/generator.ts (validateGrid). The AI
    // package can't depend on the core package, so we keep a parallel copy.
    // Keep both lists in sync.
    const comps = cat.orderingPhrases?.comparators;
    if (comps && typeof comps === "object") {
      for (const [type, value] of Object.entries(comps)) {
        if (Array.isArray(value) && SYMMETRIC_COMPARATORS.has(type)) {
          errors.push(
            err(
              "symmetric_comparator_tuple",
              `Category "${name}" comparator "${type}" is symmetric and must be a single string, not [forward, reverse].`,
              name,
            ),
          );
        }
      }
    }

    // valueSuffix / positionAdjective
    if (cat.valueSuffix !== undefined && typeof cat.valueSuffix !== "string") {
      errors.push(
        err(
          "invalid_value_suffix",
          `Category "${name}" valueSuffix must be a string.`,
          name,
        ),
      );
    }
    if (cat.positionAdjective !== undefined) {
      if (
        !Array.isArray(cat.positionAdjective) ||
        cat.positionAdjective.length !== 2 ||
        typeof cat.positionAdjective[0] !== "string" ||
        typeof cat.positionAdjective[1] !== "string"
      ) {
        errors.push(
          err(
            "invalid_position_adjective",
            `Category "${name}" positionAdjective must be a [positive, negative] string pair.`,
            name,
          ),
        );
      }
      if (cat.valueSuffix === undefined) {
        errors.push(
          err(
            "missing_value_suffix",
            `Category "${name}" has positionAdjective but no valueSuffix. They must be set together.`,
            name,
          ),
        );
      }
    }

    // subjectPriority
    if (
      cat.subjectPriority !== undefined &&
      typeof cat.subjectPriority !== "number"
    ) {
      errors.push(
        err(
          "invalid_subject_priority",
          `Category "${name}" subjectPriority must be a number.`,
          name,
        ),
      );
    }
  }

  if (personCount === 0) {
    errors.push(
      err(
        "no_person_category",
        'No person category found. Exactly one category must have noun: "".',
      ),
    );
  } else if (personCount > 1) {
    errors.push(
      err(
        "multiple_person_categories",
        'Multiple person categories found. Exactly one must have noun: "".',
      ),
    );
  }

  if (orderedCount === 0) {
    errors.push(
      err(
        "no_ordered_category",
        "No ordered category found. At least one category must have ordered: true.",
      ),
    );
  }

  return errors;
}
