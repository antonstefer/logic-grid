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

/**
 * Validate AI-generated theme output against structural and semantic rules.
 *
 * Returns an array of error messages. Empty array means the result is valid.
 * Used internally by generateTheme to decide whether to retry.
 */
export function validateThemeResult(
  result: ThemeResult,
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

  for (const cat of result.categories) {
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
    if (cat.values.length !== expectedSize) {
      errors.push(
        `Category "${name}" has ${cat.values.length} values, expected ${expectedSize}.`,
      );
    }

    // Value checks
    for (const val of cat.values) {
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

  // Position noun validation
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

  // Position preposition validation
  if (
    typeof result.positionPreposition !== "string" ||
    result.positionPreposition.trim() === ""
  ) {
    errors.push("positionPreposition must be a non-empty string.");
  }

  // No category name/value matches position noun
  if (Array.isArray(result.positionNoun) && result.positionNoun.length === 2) {
    const nounLower = result.positionNoun[0].toLowerCase();
    const nounPluralLower = result.positionNoun[1].toLowerCase();
    for (const cat of result.categories) {
      const catName = cat.name ?? "";
      const catNameLower = catName.toLowerCase();
      if (catNameLower === nounLower || catNameLower === nounPluralLower) {
        errors.push(
          `Category name "${catName}" matches the position noun "${result.positionNoun[0]}".`,
        );
      }
      for (const val of cat.values) {
        const valLower = val.toLowerCase();
        if (valLower === nounLower || valLower === nounPluralLower) {
          errors.push(
            `Value "${val}" in category "${catName}" matches the position noun "${result.positionNoun[0]}".`,
          );
        }
      }
    }
  }

  return errors;
}
