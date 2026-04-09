import { describe, it, expect } from "vitest";
import { validateThemeResult } from "./validation";
import type { ThemeResult } from "./types";

function validResult(): ThemeResult {
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
        verb: ["prepares the", "does not prepare the"],
      },
      {
        name: "Tool",
        values: ["Wok", "Blowtorch", "Cleaver"],
        noun: "user",
        verb: ["wields the", "does not wield the"],
      },
    ],
    positionNoun: ["station", "stations"],
    positionPreposition: "at",
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
    r.categories[2].values[0] = "gordon"; // same as Chef's "Gordon"
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

  it("rejects whitespace-only noun", () => {
    const r = validResult();
    r.categories[1].noun = "  ";
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("whitespace-only noun"),
    );
  });

  it("rejects invalid verb pair", () => {
    const r = validResult();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    r.categories[1].verb = ["only one"] as any;
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(expect.stringContaining("invalid verb"));
  });

  it("rejects empty verb strings", () => {
    const r = validResult();
    r.categories[1].verb = ["prepares the", ""];
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("empty verb strings"),
    );
  });

  it("rejects null/undefined category name", () => {
    const r = validResult();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    r.categories[0].name = null as any;
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("A category has an empty name"),
    );
  });

  it("rejects whitespace-only category name", () => {
    const r = validResult();
    r.categories[0].name = "   ";
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("A category has an empty name"),
    );
  });

  it("rejects empty values", () => {
    const r = validResult();
    r.categories[0].values[0] = "";
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(expect.stringContaining("empty value"));
  });

  it("rejects values longer than 30 chars", () => {
    const r = validResult();
    r.categories[0].values[0] = "A".repeat(31);
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(expect.stringContaining("too long"));
  });

  it("rejects category name longer than 30 chars", () => {
    const r = validResult();
    r.categories[0].name = "A".repeat(31);
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(expect.stringContaining("too long"));
  });

  it("rejects duplicate category names (case-insensitive)", () => {
    const r = validResult();
    r.categories[2].name = "dish";
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("Duplicate category name"),
    );
  });

  it("rejects invalid positionNoun type", () => {
    const r = validResult();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    r.positionNoun = "station" as any;
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("positionNoun must be [singular, plural]"),
    );
  });

  it("rejects values that collide with positional words", () => {
    const r = validResult();
    r.categories[0].values[0] = "First";
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("collides with a positional word"),
    );
  });

  it("rejects empty positionNoun", () => {
    const r = validResult();
    r.positionNoun = ["", "stations"];
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("positionNoun strings must not be empty"),
    );
  });

  it("rejects empty positionPreposition", () => {
    const r = validResult();
    r.positionPreposition = "";
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("positionPreposition must be a non-empty string"),
    );
  });

  it("rejects category name matching position noun", () => {
    const r = validResult();
    r.positionNoun = ["chef", "chefs"];
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining('Category name "Chef" matches the position noun'),
    );
  });

  it("rejects category value matching position noun", () => {
    const r = validResult();
    r.positionNoun = ["wok", "woks"];
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining('Value "Wok" in category "Tool" matches'),
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
    r.positionPreposition = "";
    const errors = validateThemeResult(r, 3, 3);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it("accepts a valid position category", () => {
    const r = validResult();
    r.categories[1].isPosition = true;
    r.categories[1].numericValues = [1, 2, 3];
    r.categories[1].orderingPhrases = {
      unit: ["point", "points"],
      comparators: { before: "scores higher than" },
    };
    expect(validateThemeResult(r, 3, 3)).toEqual([]);
  });

  it("rejects multiple position categories", () => {
    const r = validResult();
    r.categories[1].isPosition = true;
    r.categories[2].isPosition = true;
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("Multiple position categories"),
    );
  });

  it("rejects numericValues with wrong count", () => {
    const r = validResult();
    r.categories[1].numericValues = [1, 2];
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("numericValues must have exactly 3 numbers"),
    );
  });

  it("rejects non-numeric numericValues", () => {
    const r = validResult();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    r.categories[1].numericValues = [1, "two", 3] as any;
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("numericValues must all be numbers"),
    );
  });

  it("accepts numericValues on non-position category", () => {
    const r = validResult();
    r.categories[1].numericValues = [10, 20, 30];
    expect(validateThemeResult(r, 3, 3)).toEqual([]);
  });

  it("accepts orderingPhrases on non-position category", () => {
    const r = validResult();
    r.categories[1].orderingPhrases = {
      unit: ["point", "points"],
    };
    expect(validateThemeResult(r, 3, 3)).toEqual([]);
  });

  it("rejects null orderingPhrases", () => {
    const r = validResult();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    r.categories[1].orderingPhrases = null as any;
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("orderingPhrases must be an object"),
    );
  });

  it("accepts valid valueSuffix", () => {
    const r = validResult();
    r.categories[1].valueSuffix = "strategy";
    expect(validateThemeResult(r, 3, 3)).toEqual([]);
  });

  it("rejects non-string valueSuffix", () => {
    const r = validResult();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    r.categories[1].valueSuffix = 42 as any;
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("valueSuffix must be a string"),
    );
  });

  it("accepts valid positionAdjective with valueSuffix", () => {
    const r = validResult();
    r.categories[1].valueSuffix = "house";
    r.categories[1].positionAdjective = ["is", "is not"];
    expect(validateThemeResult(r, 3, 3)).toEqual([]);
  });

  it("rejects positionAdjective without valueSuffix", () => {
    const r = validResult();
    r.categories[1].positionAdjective = ["is", "is not"];
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("positionAdjective but no valueSuffix"),
    );
  });

  it("rejects malformed positionAdjective", () => {
    const r = validResult();
    r.categories[1].valueSuffix = "house";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    r.categories[1].positionAdjective = ["only one"] as any;
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining(
        "positionAdjective must be a [positive, negative]",
      ),
    );
  });

  it("accepts valid subjectPriority", () => {
    const r = validResult();
    r.categories[1].subjectPriority = -1;
    expect(validateThemeResult(r, 3, 3)).toEqual([]);
  });

  it("rejects non-ascending numericValues", () => {
    const r = validResult();
    r.categories[1].numericValues = [3, 1, 2];
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("strictly ascending"),
    );
  });

  it("rejects equal adjacent numericValues", () => {
    const r = validResult();
    r.categories[1].numericValues = [1, 1, 2];
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("strictly ascending"),
    );
  });

  it("rejects symmetric comparator as tuple", () => {
    const r = validResult();
    r.categories[1].orderingPhrases = {
      comparators: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        next_to: ["fwd", "rev"] as any,
      },
    };
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining('comparator "next_to" is symmetric'),
    );
  });

  it("accepts directional comparator as tuple", () => {
    const r = validResult();
    r.categories[1].orderingPhrases = {
      comparators: {
        before: ["has a lower X than", "has a higher X than"],
      },
    };
    expect(validateThemeResult(r, 3, 3)).toEqual([]);
  });

  it("rejects positionAdjective with isPosition", () => {
    const r = validResult();
    r.categories[1].isPosition = true;
    r.categories[1].valueSuffix = "house";
    r.categories[1].positionAdjective = ["is", "is not"];
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining(
        "cannot be both isPosition and positionAdjective",
      ),
    );
  });

  it("rejects non-number subjectPriority", () => {
    const r = validResult();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    r.categories[1].subjectPriority = "high" as any;
    const errors = validateThemeResult(r, 3, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("subjectPriority must be a number"),
    );
  });
});
