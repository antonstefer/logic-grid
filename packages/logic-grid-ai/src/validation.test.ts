import { describe, it, expect } from "vitest";
import { validateThemeResult } from "./validation";
import type { ThemeValidationCode } from "./types";

function validResult() {
  return {
    categories: [
      {
        name: "Chef",
        values: ["Gordon", "Julia", "Marco"],
        noun: "",
      },
      {
        name: "Dish",
        values: ["Risotto", "Soufflé", "Ramen"],
        noun: "chef",
        verb: ["prepares the", "does not prepare the"] as [string, string],
        ordered: true,
        orderingPhrases: {
          comparators: {
            before: "is before",
            left_of: "is right before",
            next_to: "is right next to",
            not_next_to: "is not right next to",
            between: "is between",
            not_between: "is not between",
            exact_distance: "is exactly",
          },
        },
      },
      {
        name: "Tool",
        values: ["Wok", "Blowtorch", "Cleaver"],
        noun: "user",
        verb: ["wields the", "does not wield the"] as [string, string],
      },
    ],
  };
}

function hasCode(
  errors: { code: string }[],
  code: ThemeValidationCode,
): boolean {
  return errors.some((e) => e.code === code);
}

describe("validateThemeResult", () => {
  it("accepts a valid result", () => {
    expect(validateThemeResult(validResult(), 3, 3)).toEqual([]);
  });

  it("rejects wrong category count", () => {
    const r = validResult();
    r.categories.pop();
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "wrong_category_count")).toBe(true);
    expect(
      errors.find((e) => e.code === "wrong_category_count")?.message,
    ).toContain("Expected 3 categories, got 2");
  });

  it("rejects wrong value count", () => {
    const r = validResult();
    r.categories[1].values.push("Extra");
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "wrong_value_count")).toBe(true);
    expect(errors.find((e) => e.code === "wrong_value_count")?.category).toBe(
      "Dish",
    );
  });

  it("rejects duplicate values (case-insensitive)", () => {
    const r = validResult();
    r.categories[2].values[0] = "gordon";
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "duplicate_value")).toBe(true);
  });

  it("rejects missing person category", () => {
    const r = validResult();
    r.categories[0].noun = "chef";
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "no_person_category")).toBe(true);
  });

  it("rejects multiple person categories", () => {
    const r = validResult();
    r.categories[1].noun = "";
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "multiple_person_categories")).toBe(true);
  });

  it("rejects invalid verb type", () => {
    const r = validResult();
    r.categories[1].verb = ["only one"] as unknown as [string, string];
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "invalid_verb")).toBe(true);
  });

  it("rejects empty category name", () => {
    const r = validResult();
    (r.categories[0] as Record<string, unknown>).name = null;
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "empty_category_name")).toBe(true);
  });

  it("rejects whitespace-only category name", () => {
    const r = validResult();
    (r.categories[0] as Record<string, unknown>).name = "   ";
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "empty_category_name")).toBe(true);
  });

  it("rejects duplicate category names", () => {
    const r = validResult();
    r.categories[2].name = "Dish";
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "duplicate_category_name")).toBe(true);
  });

  it("rejects category with no values", () => {
    const r = validResult();
    delete (r.categories[0] as Record<string, unknown>).values;
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "wrong_value_count")).toBe(true);
  });

  it("rejects long category name", () => {
    const r = validResult();
    r.categories[0].name = "A".repeat(31);
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "long_category_name")).toBe(true);
  });

  it("rejects long value", () => {
    const r = validResult();
    r.categories[0].values[0] = "X".repeat(31);
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "long_value")).toBe(true);
  });

  it("rejects empty value", () => {
    const r = validResult();
    r.categories[0].values[0] = "";
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "empty_value")).toBe(true);
  });

  it("rejects empty verb strings", () => {
    const r = validResult();
    r.categories[1].verb = ["", "does not"] as [string, string];
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "empty_verb")).toBe(true);
  });

  it("rejects whitespace-only noun", () => {
    const r = validResult();
    r.categories[1].noun = "  ";
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "whitespace_noun")).toBe(true);
  });

  it("rejects duplicate noun", () => {
    const r = validResult();
    r.categories[2].noun = "chef";
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "duplicate_noun")).toBe(true);
  });

  it("rejects values that collide with positional words", () => {
    const r = validResult();
    r.categories[0].values[0] = "First";
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "positional_word_value")).toBe(true);
  });

  it("rejects non-person category without verb", () => {
    const r = validResult();
    delete r.categories[1].verb;
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "missing_verb")).toBe(true);
  });

  it("reports multiple errors at once", () => {
    const r = validResult();
    r.categories[0].values[0] = "";
    r.categories[0].values[1] = "";
    const errors = validateThemeResult(r, 3, 3);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it("accepts an ordered category with numericValues and orderingPhrases", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).numericValues = [1, 2, 3];
    (r.categories[1] as Record<string, unknown>).orderingPhrases = {
      unit: ["point", "points"],
      comparators: { before: "scores higher than" },
    };
    expect(validateThemeResult(r, 3, 3)).toEqual([]);
  });

  it("rejects when no category is ordered", () => {
    const r = validResult();
    delete (r.categories[1] as Record<string, unknown>).ordered;
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "no_ordered_category")).toBe(true);
  });

  it("accepts multiple ordered categories", () => {
    const r = validResult();
    (r.categories[2] as Record<string, unknown>).ordered = true;
    expect(validateThemeResult(r, 3, 3)).toEqual([]);
  });

  it("rejects numericValues with wrong count", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).numericValues = [1, 2];
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "invalid_numeric_values")).toBe(true);
    expect(
      errors.find((e) => e.code === "invalid_numeric_values")?.message,
    ).toContain("must have exactly 3 numbers");
  });

  it("rejects non-numeric numericValues", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).numericValues = [1, "two", 3];
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "invalid_numeric_values")).toBe(true);
    expect(
      errors.find((e) => e.code === "invalid_numeric_values")?.message,
    ).toContain("must all be numbers");
  });

  it("rejects numericValues that are not an array", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).numericValues = "not an array";
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "invalid_numeric_values")).toBe(true);
  });

  it("accepts orderingPhrases with unit on ordered category", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).orderingPhrases = {
      unit: ["point", "points"],
    };
    expect(validateThemeResult(r, 3, 3)).toEqual([]);
  });

  it("rejects null orderingPhrases", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).orderingPhrases = null;
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "invalid_ordering_phrases")).toBe(true);
  });

  it("rejects non-object orderingPhrases", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).orderingPhrases =
      "not an object";
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "invalid_ordering_phrases")).toBe(true);
  });

  it("rejects non-string valueSuffix", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).valueSuffix = 42;
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "invalid_value_suffix")).toBe(true);
  });

  it("rejects positionAdjective without valueSuffix", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).positionAdjective = [
      "is",
      "is not",
    ];
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "missing_value_suffix")).toBe(true);
  });

  it("rejects invalid positionAdjective type", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).valueSuffix = "house";
    (r.categories[1] as Record<string, unknown>).positionAdjective = [
      "only one",
    ];
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "invalid_position_adjective")).toBe(true);
  });

  it("rejects non-ascending numericValues", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).numericValues = [3, 1, 2];
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "non_ascending_numeric_values")).toBe(true);
  });

  it("rejects equal adjacent numericValues", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).numericValues = [1, 1, 2];
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "non_ascending_numeric_values")).toBe(true);
  });

  it("rejects symmetric comparator as tuple", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).orderingPhrases = {
      comparators: { next_to: ["fwd", "rev"] },
    };
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "symmetric_comparator_tuple")).toBe(true);
  });

  it("accepts directional comparator as tuple", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).orderingPhrases = {
      comparators: { before: ["has a lower X than", "has a higher X than"] },
    };
    expect(validateThemeResult(r, 3, 3)).toEqual([]);
  });

  it("rejects non-number subjectPriority", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).subjectPriority = "high";
    const errors = validateThemeResult(r, 3, 3);
    expect(hasCode(errors, "invalid_subject_priority")).toBe(true);
  });

  it("attaches the offending category name to scoped errors", () => {
    const r = validResult();
    r.categories[1].values.push("Extra");
    const errors = validateThemeResult(r, 3, 3);
    const e = errors.find((x) => x.code === "wrong_value_count");
    expect(e?.category).toBe("Dish");
  });

  it("omits category on errors that aren't scoped to one", () => {
    const r = validResult();
    r.categories.pop();
    const errors = validateThemeResult(r, 3, 3);
    const e = errors.find((x) => x.code === "wrong_category_count");
    expect(e).toBeDefined();
    expect("category" in (e as object)).toBe(false);
  });
});
