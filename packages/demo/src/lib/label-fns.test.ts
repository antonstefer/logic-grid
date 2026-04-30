import { describe, it, expect } from "vitest";
import type { Category } from "logic-grid";
import { categoryLabel, valueLabel } from "./label-fns";
import type { PuzzleLocalization } from "./puzzle-state.svelte";

const HOUSE: Category = {
  name: "House",
  values: ["1", "2", "3"],
  noun: "house",
  verb: ["lives in the", "does not live in the"],
  ordered: true,
  displayLabels: ["1st", "2nd", "3rd"],
  orderingPhrases: {
    unit: ["house", "houses"],
    comparators: {
      before: ["lives left of", "lives right of"],
      left_of: ["lives directly left of", "lives directly right of"],
      next_to: "lives next to",
      not_next_to: "does not live next to",
      between: "lives between",
      not_between: "does not live between",
      exact_distance: "lives exactly",
    },
  },
};

const COLOR: Category = {
  name: "Color",
  values: ["Red", "Blue", "Green"],
  noun: "house",
  valueSuffix: "house",
  lowercase: true,
  positionAdjective: ["is", "is not"],
};

const LOCALIZATION: PuzzleLocalization = {
  categoryNames: { House: "Haus", Color: "Farbe" },
  valueLabels: {
    "1": "1",
    "2": "2",
    "3": "3",
    Red: "Rot",
    Blue: "Blau",
    Green: "Grün",
  },
};

describe("categoryLabel", () => {
  it("returns the canonical name when localization is null", () => {
    expect(categoryLabel("House", null)).toBe("House");
    expect(categoryLabel("Color", null)).toBe("Color");
  });

  it("returns the localized name when localization is set", () => {
    expect(categoryLabel("House", LOCALIZATION)).toBe("Haus");
    expect(categoryLabel("Color", LOCALIZATION)).toBe("Farbe");
  });

  it("throws when localization is set but a key is missing", () => {
    const partial: PuzzleLocalization = {
      categoryNames: { House: "Haus" }, // Color missing
      valueLabels: LOCALIZATION.valueLabels,
    };
    expect(() => categoryLabel("Color", partial)).toThrow(
      /missing categoryNames entry for "Color"/,
    );
  });
});

describe("valueLabel", () => {
  it("prefers displayLabels over localization on ordered categories", () => {
    // displayLabels is "1st/2nd/3rd"; localization maps "1" → "1" but the
    // displayLabels form wins because it's the consumer's chosen visual.
    expect(valueLabel(HOUSE, 0, LOCALIZATION)).toBe("1st");
    expect(valueLabel(HOUSE, 1, LOCALIZATION)).toBe("2nd");
  });

  it("uses displayLabels even when localization is null", () => {
    expect(valueLabel(HOUSE, 0, null)).toBe("1st");
  });

  it("returns canonical value when localization is null and no displayLabels", () => {
    expect(valueLabel(COLOR, 0, null)).toBe("Red");
  });

  it("returns localized label when localization is set and no displayLabels", () => {
    expect(valueLabel(COLOR, 0, LOCALIZATION)).toBe("Rot");
    expect(valueLabel(COLOR, 1, LOCALIZATION)).toBe("Blau");
  });

  it("throws when localization is set but a value key is missing", () => {
    const partial: PuzzleLocalization = {
      categoryNames: LOCALIZATION.categoryNames,
      valueLabels: { Red: "Rot" }, // Blue, Green missing
    };
    expect(() => valueLabel(COLOR, 1, partial)).toThrow(
      /missing valueLabels entry for "Blue"/,
    );
  });

  it("throws when displayLabels is shorter than values", () => {
    const sparse: Category = {
      ...HOUSE,
      ordered: true,
      displayLabels: ["1st", "2nd"], // missing index 2
      orderingPhrases:
        HOUSE.ordered === true ? HOUSE.orderingPhrases : undefined!,
    };
    expect(() => valueLabel(sparse, 2, null)).toThrow(
      /displayLabels of length 2 but values has 3 entries .*index 2 out of range/,
    );
  });

  it("throws on displayLabels length mismatch even on the English path", () => {
    // Reviewer explicitly flagged this: the throw applies regardless of
    // whether localization is set. This is a deliberate behaviour change
    // from the previous silent `?? cat.values[valIdx]` fallback.
    const sparse: Category = {
      ...HOUSE,
      ordered: true,
      displayLabels: ["1st", "2nd"],
      orderingPhrases:
        HOUSE.ordered === true ? HOUSE.orderingPhrases : undefined!,
    };
    expect(() => valueLabel(sparse, 2, LOCALIZATION)).toThrow();
    expect(() => valueLabel(sparse, 2, null)).toThrow();
  });
});
