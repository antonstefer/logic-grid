import type { ThemeResult } from "./types";

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

/** Validate a ThemeResult and return an array of error messages. Empty = valid. */
export function validateThemeResult(
  result: ThemeResult,
  expectedSize: number,
  expectedCategories: number,
): string[] {
  const errors: string[] = [];

  // 1. Category count
  if (result.categories.length !== expectedCategories) {
    errors.push(
      `Expected ${expectedCategories} categories, got ${result.categories.length}.`,
    );
  }

  // 2. Value counts
  for (const cat of result.categories) {
    if (cat.values.length !== expectedSize) {
      errors.push(
        `Category "${cat.name}" has ${cat.values.length} values, expected ${expectedSize}.`,
      );
    }
  }

  // 3. Global value uniqueness (case-insensitive)
  const seen = new Map<string, string>();
  for (const cat of result.categories) {
    for (const val of cat.values) {
      const lower = val.toLowerCase();
      const existing = seen.get(lower);
      if (existing !== undefined) {
        errors.push(
          `Duplicate value "${val}" (also in category with value "${existing}").`,
        );
      } else {
        seen.set(lower, val);
      }
    }
  }

  // 4. Exactly one person category (noun: "")
  const personCategories = result.categories.filter(
    (c) => c.noun === "" || c.noun === undefined,
  );
  if (personCategories.length === 0) {
    errors.push(
      'No person category found. Exactly one category must have noun: "".',
    );
  } else if (personCategories.length > 1) {
    errors.push(
      `Multiple person categories found (${personCategories.map((c) => c.name).join(", ")}). Exactly one must have noun: "".`,
    );
  }

  // 5. Non-person categories must have non-empty noun
  for (const cat of result.categories) {
    if (cat.noun !== "" && cat.noun !== undefined && cat.noun.trim() === "") {
      errors.push(
        `Category "${cat.name}" has a whitespace-only noun. Use a meaningful noun or "" for person categories.`,
      );
    }
  }

  // 6. Verb arrays must be [string, string] if present
  for (const cat of result.categories) {
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
    }
  }

  // 7. Values must not be empty or too long
  for (const cat of result.categories) {
    for (const val of cat.values) {
      if (val.trim() === "") {
        errors.push(`Category "${cat.name}" has an empty value.`);
      }
      if (val.length > 30) {
        errors.push(
          `Category "${cat.name}" value "${val}" is too long (${val.length} chars, max 30).`,
        );
      }
    }
  }

  // 8. Values must not collide with positional words
  for (const cat of result.categories) {
    for (const val of cat.values) {
      if (POSITIONAL_WORDS.has(val.toLowerCase())) {
        errors.push(
          `Category "${cat.name}" value "${val}" collides with a positional word.`,
        );
      }
    }
  }

  // 9. Position noun validation
  if (
    !Array.isArray(result.positionNoun) ||
    result.positionNoun.length !== 2 ||
    typeof result.positionNoun[0] !== "string" ||
    typeof result.positionNoun[1] !== "string"
  ) {
    errors.push("positionNoun must be [singular, plural] string pair.");
  } else {
    if (
      result.positionNoun[0].trim() === "" ||
      result.positionNoun[1].trim() === ""
    ) {
      errors.push("positionNoun strings must not be empty.");
    }
  }

  // 10. Position preposition validation
  if (
    typeof result.positionPreposition !== "string" ||
    result.positionPreposition.trim() === ""
  ) {
    errors.push("positionPreposition must be a non-empty string.");
  }

  // 11. No category name/value matches position noun
  if (Array.isArray(result.positionNoun) && result.positionNoun.length === 2) {
    const nounLower = result.positionNoun[0].toLowerCase();
    const nounPluralLower = result.positionNoun[1].toLowerCase();
    for (const cat of result.categories) {
      const catNameLower = cat.name.toLowerCase();
      if (catNameLower === nounLower || catNameLower === nounPluralLower) {
        errors.push(
          `Category name "${cat.name}" matches the position noun "${result.positionNoun[0]}".`,
        );
      }
      for (const val of cat.values) {
        const valLower = val.toLowerCase();
        if (valLower === nounLower || valLower === nounPluralLower) {
          errors.push(
            `Value "${val}" in category "${cat.name}" matches the position noun "${result.positionNoun[0]}".`,
          );
        }
      }
    }
  }

  return errors;
}
