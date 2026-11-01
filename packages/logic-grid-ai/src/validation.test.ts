import { describe, it, expect } from "vitest";
import { validateThemeResult } from "./validation";
import { hasCode } from "./test-helpers";

/** All 7 comparators, in the shapes logic-grid renders. */
function comparators() {
  return {
    before: ["is before", "is after"],
    left_of: ["is right before", "is right after"],
    next_to: "is right next to",
    not_next_to: "is not right next to",
    between: "is between",
    not_between: "is not between",
    exact_distance: "is exactly",
  };
}

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
        orderingPhrases: { comparators: comparators() },
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

  it("does not double-report two empty names as duplicates", () => {
    const r = validResult();
    (r.categories[0] as Record<string, unknown>).name = "";
    (r.categories[1] as Record<string, unknown>).name = "";
    const errors = validateThemeResult(r, 3, 3);
    // Both empty names should each trigger empty_category_name; the second
    // should NOT also trigger duplicate_category_name (the empty name is the
    // problem, not its duplication of another empty name).
    expect(errors.filter((e) => e.code === "empty_category_name")).toHaveLength(
      2,
    );
    expect(hasCode(errors, "duplicate_category_name")).toBe(false);
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
      comparators: comparators(),
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
    (r.categories[2] as Record<string, unknown>).orderingPhrases = {
      comparators: comparators(),
    };
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
      comparators: comparators(),
    };
    expect(validateThemeResult(r, 3, 3)).toEqual([]);
  });

  it("requires comparators on every ordered category", () => {
    const r = validResult();
    delete (r.categories[1] as Record<string, unknown>).orderingPhrases;
    const errors = validateThemeResult(r, 3, 3);
    expect(errors.map((e) => e.message)).toEqual([
      'Category "Dish" is ordered, so orderingPhrases.comparators must set all 7 comparators.',
    ]);
  });

  it("rejects a directional comparator that isn't a pair of phrases", () => {
    for (const before of ["is before", ["is before"], ["is before", " "]]) {
      const r = validResult();
      (r.categories[1] as Record<string, unknown>).orderingPhrases = {
        comparators: { ...comparators(), before },
      };
      const errors = validateThemeResult(r, 3, 3);
      expect(errors.map((e) => e.message)).toEqual([
        'Category "Dish" comparator "before" must be a [forward, reverse] pair of non-empty strings.',
      ]);
    }
  });

  it("rejects a missing or empty symmetric comparator", () => {
    const r = validResult();
    const { between: _between, ...rest } = comparators();
    void _between;
    (r.categories[1] as Record<string, unknown>).orderingPhrases = {
      comparators: { ...rest, exact_distance: " " },
    };
    const errors = validateThemeResult(r, 3, 3);
    expect(errors.map((e) => e.message)).toEqual([
      'Category "Dish" comparator "between" must be a non-empty string.',
      'Category "Dish" comparator "exact_distance" must be a non-empty string.',
    ]);
  });

  it("rejects a unit that isn't a pair of phrases", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).orderingPhrases = {
      unit: ["point"],
      comparators: comparators(),
    };
    const errors = validateThemeResult(r, 3, 3);
    expect(errors.map((e) => e.message)).toEqual([
      'Category "Dish" orderingPhrases.unit must be a [singular, plural] pair of non-empty strings.',
    ]);
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
      comparators: { ...comparators(), next_to: ["fwd", "rev"] },
    };
    const errors = validateThemeResult(r, 3, 3);
    // Reported once, as a tuple, not again as a missing string.
    expect(errors.map((e) => e.code)).toEqual(["symmetric_comparator_tuple"]);
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
