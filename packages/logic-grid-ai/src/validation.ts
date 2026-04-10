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

/**
 * Validate AI-generated theme output against structural and semantic rules.
 *
 * Returns an array of error messages. Empty array means the result is valid.
 * Used internally by generateTheme to decide whether to retry.
 */
/**
 * The input shape is intentionally loose (`categories: Record<string, unknown>[]`)
 * because this function validates untrusted AI JSON output. The caller
 * (generateTheme) casts to ThemeResult only after validation passes.
 */
export function validateThemeResult(
  result: { categories: readonly unknown[] },
  expectedSize: number,
  expectedCategories: number,
): string[] {
  const errors: string[] = [];

  if (result.categories.length !== expectedCategories) {
    errors.push(
      `Expected ${expectedCategories} categories, got ${result.categories.length}.`,
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
      errors.push("A category has an empty name.");
    } else if (name.length > 30) {
      errors.push(
        `Category name "${name}" is too long (${name.length} chars, max 30).`,
      );
    }
    const nameLower = name.toLowerCase();
    if (seenNames.has(nameLower)) {
      errors.push(`Duplicate category name "${name}".`);
    }
    seenNames.add(nameLower);

    // Value count
    const values = cat.values ?? [];
    if (values.length !== expectedSize) {
      errors.push(
        `Category "${name}" has ${values.length} values, expected ${expectedSize}.`,
      );
    }

    // Value checks
    for (const val of values) {
      if (val.trim() === "") {
        errors.push(`Category "${name}" has an empty value.`);
      } else if (val.length > 30) {
        errors.push(
          `Category "${name}" value "${val}" is too long (${val.length} chars, max 30).`,
        );
      }
      const valLower = val.toLowerCase();
      const existing = seenValues.get(valLower);
      if (existing !== undefined) {
        errors.push(
          `Duplicate value "${val}" (also in category with value "${existing}").`,
        );
      } else {
        seenValues.set(valLower, val);
      }
      if (POSITIONAL_WORDS.has(valLower)) {
        errors.push(
          `Category "${name}" value "${val}" collides with a positional word.`,
        );
      }
    }

    // Noun checks
    if (cat.noun === "" || cat.noun === undefined) {
      personCount++;
    } else if (cat.noun.trim() === "") {
      errors.push(
        `Category "${name}" has a whitespace-only noun. Use a meaningful noun or "" for person categories.`,
      );
    } else {
      const nounLower = cat.noun.toLowerCase();
      if (seenNouns.has(nounLower)) {
        errors.push(`Duplicate noun "${cat.noun}" in category "${name}".`);
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
          `Category "${cat.name}" has invalid verb. Must be [positive, negative] string pair.`,
        );
      } else if (cat.verb[0].trim() === "" || cat.verb[1].trim() === "") {
        errors.push(`Category "${cat.name}" has empty verb strings.`);
      }
    } else if (cat.noun !== "" && cat.noun !== undefined) {
      // Every non-person category must have a verb so same_position renders cleanly.
      errors.push(
        `Category "${cat.name}" requires a verb. Only the person category (noun: "") may omit it.`,
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
          `Category "${name}" numericValues must have exactly ${expectedSize} numbers.`,
        );
      } else if (
        cat.numericValues.some((v: unknown) => typeof v !== "number")
      ) {
        errors.push(`Category "${name}" numericValues must all be numbers.`);
      } else if (cat.numericValues.some((v, i, a) => i > 0 && v <= a[i - 1])) {
        errors.push(
          `Category "${name}" numericValues must be in strictly ascending order.`,
        );
      }
    }
    if (
      cat.orderingPhrases !== undefined &&
      (cat.orderingPhrases === null || typeof cat.orderingPhrases !== "object")
    ) {
      errors.push(`Category "${name}" orderingPhrases must be an object.`);
    }
    // Symmetric comparators must be single strings, not [forward, reverse].
    // NOTE: duplicated in logic-grid/src/generator.ts (validateGrid). The AI
    // package can't depend on the core package, so we keep a parallel copy.
    // Keep both lists in sync.
    const symmetric = new Set([
      "next_to",
      "not_next_to",
      "between",
      "not_between",
      "exact_distance",
    ]);
    const comps = cat.orderingPhrases?.comparators;
    if (comps && typeof comps === "object") {
      for (const [type, value] of Object.entries(comps)) {
        if (Array.isArray(value) && symmetric.has(type)) {
          errors.push(
            `Category "${name}" comparator "${type}" is symmetric and must be a single string, not [forward, reverse].`,
          );
        }
      }
    }

    // valueSuffix / positionAdjective
    if (cat.valueSuffix !== undefined && typeof cat.valueSuffix !== "string") {
      errors.push(`Category "${name}" valueSuffix must be a string.`);
    }
    if (cat.positionAdjective !== undefined) {
      if (
        !Array.isArray(cat.positionAdjective) ||
        cat.positionAdjective.length !== 2 ||
        typeof cat.positionAdjective[0] !== "string" ||
        typeof cat.positionAdjective[1] !== "string"
      ) {
        errors.push(
          `Category "${name}" positionAdjective must be a [positive, negative] string pair.`,
        );
      }
      if (cat.valueSuffix === undefined) {
        errors.push(
          `Category "${name}" has positionAdjective but no valueSuffix. They must be set together.`,
        );
      }
    }

    // subjectPriority
    if (
      cat.subjectPriority !== undefined &&
      typeof cat.subjectPriority !== "number"
    ) {
      errors.push(`Category "${name}" subjectPriority must be a number.`);
    }
  }

  if (personCount === 0) {
    errors.push(
      'No person category found. Exactly one category must have noun: "".',
    );
  } else if (personCount > 1) {
    errors.push(
      'Multiple person categories found. Exactly one must have noun: "".',
    );
  }

  if (orderedCount === 0) {
    errors.push(
      "No ordered category found. At least one category must have ordered: true.",
    );
  }

  return errors;
}
