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

  it("allows undefined verb (uses defaults)", () => {
    const r = validResult();
    delete r.categories[1].verb;
    expect(validateThemeResult(r, 3, 3)).toEqual([]);
  });

  it("reports multiple errors at once", () => {
    const r = validResult();
    r.categories[0].values[0] = "";
    r.positionPreposition = "";
    const errors = validateThemeResult(r, 3, 3);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});
