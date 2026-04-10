import { describe, it, expect } from "vitest";
import { validateThemeResult } from "./validation";

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

describe("validateThemeResult", () => {
  it("accepts a valid result", () => {
    expect(validateThemeResult(validResult(), 3, 3)).toEqual([]);
  });

  it("rejects wrong category count", () => {
    const r = validResult();
    r.categories.pop();
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("Expected 3 categories, got 2"),
    );
  });

  it("rejects wrong value count", () => {
    const r = validResult();
    r.categories[1].values.push("Extra");
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining('Category "Dish" has 4 values'),
    );
  });

  it("rejects duplicate values (case-insensitive)", () => {
    const r = validResult();
    r.categories[2].values[0] = "gordon";
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining('Duplicate value "gordon"'),
    );
  });

  it("rejects missing person category", () => {
    const r = validResult();
    r.categories[0].noun = "chef";
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("No person category found"),
    );
  });

  it("rejects multiple person categories", () => {
    const r = validResult();
    r.categories[1].noun = "";
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("Multiple person categories"),
    );
  });

  it("rejects invalid verb type", () => {
    const r = validResult();
    r.categories[1].verb = ["only one"] as unknown as [string, string];
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(expect.stringContaining("invalid verb"));
  });

  it("rejects empty category name", () => {
    const r = validResult();
    (r.categories[0] as Record<string, unknown>).name = null;
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("A category has an empty name"),
    );
  });

  it("rejects duplicate category names", () => {
    const r = validResult();
    r.categories[2].name = "Dish";
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("Duplicate category name"),
    );
  });

  it("rejects category with no values", () => {
    const r = validResult();
    delete (r.categories[0] as Record<string, unknown>).values;
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(expect.stringContaining("has 0 values"));
  });

  it("rejects long category name", () => {
    const r = validResult();
    r.categories[0].name = "A".repeat(31);
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(expect.stringContaining("too long"));
  });

  it("rejects long value", () => {
    const r = validResult();
    r.categories[0].values[0] = "X".repeat(31);
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(expect.stringContaining("too long"));
  });

  it("rejects empty verb strings", () => {
    const r = validResult();
    r.categories[1].verb = ["", "does not"] as [string, string];
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(expect.stringContaining("empty verb"));
  });

  it("rejects whitespace-only noun", () => {
    const r = validResult();
    r.categories[1].noun = "  ";
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("whitespace-only noun"),
    );
  });

  it("rejects duplicate noun", () => {
    const r = validResult();
    r.categories[2].noun = "chef";
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(expect.stringContaining("Duplicate noun"));
  });

  it("rejects values that collide with positional words", () => {
    const r = validResult();
    r.categories[0].values[0] = "First";
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("collides with a positional word"),
    );
  });

  it("rejects non-person category without verb", () => {
    const r = validResult();
    delete r.categories[1].verb;
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(expect.stringContaining("requires a verb"));
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
    expect(errors).toContainEqual(
      expect.stringContaining("No ordered category found"),
    );
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
    expect(errors).toContainEqual(
      expect.stringContaining("numericValues must have exactly 3 numbers"),
    );
  });

  it("rejects non-numeric numericValues", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).numericValues = [1, "two", 3];
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("numericValues must all be numbers"),
    );
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
    expect(errors).toContainEqual(
      expect.stringContaining("orderingPhrases must be an object"),
    );
  });

  it("rejects non-string valueSuffix", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).valueSuffix = 42;
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("valueSuffix must be a string"),
    );
  });

  it("rejects positionAdjective without valueSuffix", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).positionAdjective = [
      "is",
      "is not",
    ];
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("has positionAdjective but no valueSuffix"),
    );
  });

  it("rejects invalid positionAdjective type", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).valueSuffix = "house";
    (r.categories[1] as Record<string, unknown>).positionAdjective = [
      "only one",
    ];
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining(
        "positionAdjective must be a [positive, negative]",
      ),
    );
  });

  it("rejects non-ascending numericValues", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).numericValues = [3, 1, 2];
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("strictly ascending"),
    );
  });

  it("rejects equal adjacent numericValues", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).numericValues = [1, 1, 2];
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("strictly ascending"),
    );
  });

  it("rejects symmetric comparator as tuple", () => {
    const r = validResult();
    (r.categories[1] as Record<string, unknown>).orderingPhrases = {
      comparators: { next_to: ["fwd", "rev"] },
    };
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining('comparator "next_to" is symmetric'),
    );
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
    expect(errors).toContainEqual(
      expect.stringContaining("subjectPriority must be a number"),
    );
  });
});
