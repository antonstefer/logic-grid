import { describe, it, expect } from "vitest";
import { renderClue } from "./templates";
import type { Grid } from "../types";

const grid: Grid = {
  size: 3,
  categories: [
    { name: "Name", values: ["Alice", "Bob", "Carol"] },
    { name: "Color", values: ["Red", "Blue", "Green"] },
    { name: "Pet", values: ["Cat", "Dog", "Fish"] },
    { name: "Drink", values: ["Tea", "Coffee", "Water"] },
  ],
};

describe("renderClue", () => {
  it("same_house: color + pet", () => {
    const clue = renderClue({ type: "same_house", a: "Red", b: "Cat" }, grid);
    expect(clue.text).toBe("The cat lives in the red house.");
  });

  it("same_house: name + color", () => {
    const clue = renderClue(
      { type: "same_house", a: "Alice", b: "Blue" },
      grid,
    );
    expect(clue.text).toBe("Alice lives in the blue house.");
  });

  it("same_house: name + pet", () => {
    const clue = renderClue({ type: "same_house", a: "Bob", b: "Dog" }, grid);
    expect(clue.text).toBe("Bob owns the dog.");
  });

  it("same_house: name + drink", () => {
    const clue = renderClue({ type: "same_house", a: "Carol", b: "Tea" }, grid);
    expect(clue.text).toBe("Carol drinks tea.");
  });

  it("same_house: pet + drink", () => {
    const clue = renderClue(
      { type: "same_house", a: "Cat", b: "Coffee" },
      grid,
    );
    expect(clue.text).toBe("The cat owner drinks coffee.");
  });

  it("not_same_house: name + pet", () => {
    const clue = renderClue(
      { type: "not_same_house", a: "Alice", b: "Dog" },
      grid,
    );
    expect(clue.text).toBe("Alice does not own the dog.");
  });

  it("not_same_house: name + color", () => {
    const clue = renderClue(
      { type: "not_same_house", a: "Bob", b: "Red" },
      grid,
    );
    expect(clue.text).toBe("Bob does not live in the red house.");
  });

  it("not_same_house: color + pet", () => {
    const clue = renderClue(
      { type: "not_same_house", a: "Red", b: "Cat" },
      grid,
    );
    expect(clue.text).toBe("No cat lives in the red house.");
  });

  it("not_same_house: name + drink", () => {
    const clue = renderClue(
      { type: "not_same_house", a: "Alice", b: "Tea" },
      grid,
    );
    expect(clue.text).toBe("Alice does not drink tea.");
  });

  it("not_same_house: color + drink", () => {
    const clue = renderClue(
      { type: "not_same_house", a: "Blue", b: "Coffee" },
      grid,
    );
    expect(clue.text).toBe("The blue house's resident does not drink coffee.");
  });

  it("not_same_house: pet + drink", () => {
    const clue = renderClue(
      { type: "not_same_house", a: "Dog", b: "Water" },
      grid,
    );
    expect(clue.text).toBe("The dog owner does not drink water.");
  });

  it("next_to", () => {
    const clue = renderClue({ type: "next_to", a: "Blue", b: "Cat" }, grid);
    expect(clue.text).toBe("The blue house is next to the cat.");
  });

  it("not_next_to", () => {
    const clue = renderClue({ type: "not_next_to", a: "Tea", b: "Dog" }, grid);
    expect(clue.text).toBe("The tea drinker does not live next to the dog.");
  });

  it("not_next_to: house noun uses 'is not'", () => {
    const clue = renderClue({ type: "not_next_to", a: "Red", b: "Cat" }, grid);
    expect(clue.text).toBe("The red house is not next to the cat.");
  });

  it("left_of renders as left or right", () => {
    const clue = renderClue({ type: "left_of", a: "Blue", b: "Green" }, grid);
    // Deterministic per constraint — could be either phrasing
    expect(
      clue.text === "The blue house is directly left of the green house." ||
        clue.text === "The green house is directly right of the blue house.",
    ).toBe(true);
  });

  it("between", () => {
    const clue = renderClue(
      { type: "between", outer1: "Red", middle: "Cat", outer2: "Blue" },
      grid,
    );
    expect(clue.text).toBe(
      "The cat lives somewhere between the red house and the blue house.",
    );
  });

  it("at_position", () => {
    const clue = renderClue(
      { type: "at_position", value: "Tea", position: 0 },
      grid,
    );
    expect(clue.text).toBe("The tea drinker lives in the first house.");
  });

  it("not_at_position", () => {
    const clue = renderClue(
      { type: "not_at_position", value: "Red", position: 2 },
      grid,
    );
    expect(clue.text).toBe("The third house is not red.");
  });

  it("not_between", () => {
    const clue = renderClue(
      {
        type: "not_between",
        outer1: "Red",
        middle: "Cat",
        outer2: "Blue",
      },
      grid,
    );
    expect(clue.text).toBe(
      "The cat does not live somewhere between the red house and the blue house.",
    );
  });

  it("not_between: house noun as middle uses 'is not'", () => {
    const clue = renderClue(
      { type: "not_between", outer1: "Alice", middle: "Red", outer2: "Cat" },
      grid,
    );
    expect(clue.text).toBe(
      "The red house is not somewhere between Alice and the cat.",
    );
  });

  it("before", () => {
    const clue = renderClue({ type: "before", a: "Alice", b: "Cat" }, grid);
    expect(clue.text).toMatch(/somewhere (left|right) of/);
  });

  it("exact_distance", () => {
    const clue = renderClue(
      { type: "exact_distance", a: "Alice", b: "Cat", distance: 2 },
      grid,
    );
    expect(clue.text).toBe("Alice lives exactly two houses from the cat.");
  });

  it("exact_distance singular", () => {
    const clue = renderClue(
      { type: "exact_distance", a: "Alice", b: "Cat", distance: 1 },
      grid,
    );
    expect(clue.text).toBe("Alice lives exactly one house from the cat.");
  });

  it("throws on unknown value", () => {
    expect(() =>
      renderClue({ type: "same_house", a: "Unknown", b: "Cat" }, grid),
    ).toThrow("Unknown value: Unknown");
  });

  it("swaps subject/object when b has higher priority", () => {
    // Cat (owner, priority 0) as a, Alice (person, priority 2) as b
    // Should swap so Alice becomes the subject
    const clue = renderClue({ type: "same_house", a: "Cat", b: "Alice" }, grid);
    expect(clue.text).toBe("Alice owns the cat.");
  });

  it("preserves constraint in returned clue", () => {
    const constraint = { type: "same_house" as const, a: "Red", b: "Cat" };
    const clue = renderClue(constraint, grid);
    expect(clue.constraint).toBe(constraint);
  });
});

describe("custom category noun/verb", () => {
  const customGrid: Grid = {
    size: 3,
    categories: [
      { name: "Name", values: ["Alice", "Bob", "Carol"] },
      {
        name: "Vehicle",
        values: ["Toyota", "BMW", "Honda"],
        noun: "driver",
        verb: ["drives the", "does not drive the"],
      },
      {
        name: "Fruit",
        values: ["Apple", "Banana", "Cherry"],
        noun: "lover",
      },
    ],
  };

  it("same_house with custom verb", () => {
    const clue = renderClue(
      { type: "same_house", a: "Alice", b: "Toyota" },
      customGrid,
    );
    expect(clue.text).toBe("Alice drives the toyota.");
  });

  it("not_same_house with custom verb", () => {
    const clue = renderClue(
      { type: "not_same_house", a: "Alice", b: "BMW" },
      customGrid,
    );
    expect(clue.text).toBe("Alice does not drive the bmw.");
  });

  it("custom noun in label", () => {
    const clue = renderClue(
      { type: "next_to", a: "Toyota", b: "Apple" },
      customGrid,
    );
    expect(clue.text).toBe("The toyota driver lives next to the apple lover.");
  });

  it("custom noun falls back to built-in verb when no custom verb", () => {
    const clue = renderClue(
      { type: "same_house", a: "Alice", b: "Apple" },
      customGrid,
    );
    // "lover" maps to NOUN_VERB["lover"] = ["eats", "does not eat"]
    expect(clue.text).toBe("Alice eats apple.");
  });

  it("empty-string noun renders bare value", () => {
    const bareGrid: Grid = {
      size: 3,
      categories: [
        {
          name: "Player",
          values: ["Alice", "Bob", "Carol"],
          noun: "",
        },
        { name: "Color", values: ["Red", "Blue", "Green"] },
      ],
    };
    const clue = renderClue(
      { type: "same_house", a: "Alice", b: "Red" },
      bareGrid,
    );
    expect(clue.text).toBe("Alice lives in the red house.");
  });

  it("falls back to defaults when no custom noun/verb", () => {
    // Standard grid with no custom fields — should work as before
    const clue = renderClue({ type: "same_house", a: "Alice", b: "Red" }, grid);
    expect(clue.text).toBe("Alice lives in the red house.");
  });
});

describe("custom positionNoun / positionPreposition", () => {
  const seatGrid: Grid = {
    size: 3,
    categories: [
      { name: "Name", values: ["Alice", "Bob", "Carol"] },
      { name: "Color", values: ["Red", "Blue", "Green"] },
      { name: "Pet", values: ["Cat", "Dog", "Fish"] },
      { name: "Drink", values: ["Tea", "Coffee", "Water"] },
    ],
    positionNoun: ["seat", "seats"],
    positionPreposition: "at",
  };

  it("at_position uses custom noun and preposition", () => {
    const clue = renderClue(
      { type: "at_position", value: "Tea", position: 0 },
      seatGrid,
    );
    expect(clue.text).toBe("The tea drinker lives at the first seat.");
  });

  it("at_position with color uses custom noun", () => {
    const clue = renderClue(
      { type: "at_position", value: "Red", position: 2 },
      seatGrid,
    );
    expect(clue.text).toBe("The third seat is red.");
  });

  it("not_at_position uses custom noun and preposition", () => {
    const clue = renderClue(
      { type: "not_at_position", value: "Alice", position: 1 },
      seatGrid,
    );
    expect(clue.text).toBe("Alice does not live at the second seat.");
  });

  it("not_at_position with color uses custom noun", () => {
    const clue = renderClue(
      { type: "not_at_position", value: "Red", position: 2 },
      seatGrid,
    );
    expect(clue.text).toBe("The third seat is not red.");
  });

  it("exact_distance singular uses custom noun", () => {
    const clue = renderClue(
      { type: "exact_distance", a: "Alice", b: "Cat", distance: 1 },
      seatGrid,
    );
    expect(clue.text).toBe("Alice lives exactly one seat from the cat.");
  });

  it("exact_distance plural uses custom noun", () => {
    const clue = renderClue(
      { type: "exact_distance", a: "Alice", b: "Cat", distance: 2 },
      seatGrid,
    );
    expect(clue.text).toBe("Alice lives exactly two seats from the cat.");
  });

  it("same_house color + pet uses custom noun and preposition", () => {
    const clue = renderClue(
      { type: "same_house", a: "Red", b: "Cat" },
      seatGrid,
    );
    expect(clue.text).toBe("The cat lives at the red seat.");
  });

  it("same_house name + color uses custom noun and preposition", () => {
    const clue = renderClue(
      { type: "same_house", a: "Alice", b: "Blue" },
      seatGrid,
    );
    expect(clue.text).toBe("Alice lives at the blue seat.");
  });

  it("not_same_house color + pet uses custom noun and preposition", () => {
    const clue = renderClue(
      { type: "not_same_house", a: "Red", b: "Cat" },
      seatGrid,
    );
    expect(clue.text).toBe("No cat lives at the red seat.");
  });

  it("not_same_house color + drink uses custom noun", () => {
    const clue = renderClue(
      { type: "not_same_house", a: "Blue", b: "Coffee" },
      seatGrid,
    );
    expect(clue.text).toBe("The blue seat's resident does not drink coffee.");
  });

  it("same_house fallback uses custom noun and preposition", () => {
    const minGrid: Grid = {
      size: 3,
      categories: [
        { name: "Shape", values: ["Circle", "Square", "Triangle"] },
        { name: "Size", values: ["Small", "Medium", "Large"] },
      ],
      positionNoun: ["slot", "slots"],
      positionPreposition: "at",
    };
    const clue = renderClue(
      { type: "same_house", a: "Circle", b: "Small" },
      minGrid,
    );
    expect(clue.text).toBe(
      "The circle shape and the small size are at the same slot.",
    );
  });

  it("not_same_house fallback (negative branch)", () => {
    const minGrid: Grid = {
      size: 3,
      categories: [
        { name: "Shape", values: ["Circle", "Square", "Triangle"] },
        { name: "Size", values: ["Small", "Medium", "Large"] },
      ],
    };
    const clue = renderClue(
      { type: "not_same_house", a: "Circle", b: "Small" },
      minGrid,
    );
    expect(clue.text).toBe(
      "The circle shape and the small size are not in the same house.",
    );
  });

  it("throws on empty positionNoun singular", () => {
    const badGrid: Grid = {
      size: 3,
      categories: [{ name: "Name", values: ["Alice", "Bob", "Carol"] }],
      positionNoun: ["", "seats"],
    };
    expect(() =>
      renderClue({ type: "at_position", value: "Alice", position: 0 }, badGrid),
    ).toThrow(RangeError);
  });

  it("throws on empty positionNoun plural", () => {
    const badGrid: Grid = {
      size: 3,
      categories: [{ name: "Name", values: ["Alice", "Bob", "Carol"] }],
      positionNoun: ["seat", ""],
    };
    expect(() =>
      renderClue(
        { type: "exact_distance", a: "Alice", b: "Bob", distance: 2 },
        badGrid,
      ),
    ).toThrow(RangeError);
  });

  it("throws on empty positionPreposition", () => {
    const badGrid: Grid = {
      size: 3,
      categories: [{ name: "Name", values: ["Alice", "Bob", "Carol"] }],
      positionPreposition: "",
    };
    expect(() =>
      renderClue({ type: "at_position", value: "Alice", position: 0 }, badGrid),
    ).toThrow(RangeError);
  });
});

describe("position category", () => {
  const posGrid: Grid = {
    size: 3,
    categories: [
      { name: "Manager", values: ["Alice", "Bob", "Carol"], noun: "" },
      {
        name: "Return",
        values: ["6%", "7%", "8%"],
        noun: "fund",
        isPosition: true,
        numericValues: [6, 7, 8],
        orderingPhrases: {
          unit: ["percentage point", "percentage points"],
          comparators: {
            before: "has a larger return than",
            left_of: "has a return exactly one percentage point less than",
          },
        },
      },
      {
        name: "Strategy",
        values: ["Long/Short", "Macro", "Quant"],
        noun: "strategist",
      },
    ],
    positionNoun: ["fund", "funds"],
    positionPreposition: "at",
  };

  it("at_position uses position category label", () => {
    const clue = renderClue(
      { type: "at_position", value: "Alice", position: 0 },
      posGrid,
    );
    expect(clue.text).toBe("Alice is at 6%.");
  });

  it("not_at_position uses position category label", () => {
    const clue = renderClue(
      { type: "not_at_position", value: "Alice", position: 2 },
      posGrid,
    );
    expect(clue.text).toBe("Alice is not at 8%.");
  });

  it("before uses custom comparator", () => {
    const clue = renderClue({ type: "before", a: "Alice", b: "Bob" }, posGrid);
    expect(clue.text).toBe("Alice is has a larger return than Bob.");
  });

  it("left_of uses custom comparator", () => {
    const clue = renderClue({ type: "left_of", a: "Alice", b: "Bob" }, posGrid);
    expect(clue.text).toBe(
      "Alice is has a return exactly one percentage point less than Bob.",
    );
  });

  it("exact_distance uses unit from position category", () => {
    const clue = renderClue(
      { type: "exact_distance", a: "Alice", b: "Bob", distance: 2 },
      posGrid,
    );
    expect(clue.text).toBe("Alice is exactly 2 percentage points from Bob.");
  });

  it("exact_distance singular unit", () => {
    const clue = renderClue(
      { type: "exact_distance", a: "Alice", b: "Bob", distance: 1 },
      posGrid,
    );
    expect(clue.text).toBe("Alice is exactly 1 percentage point from Bob.");
  });

  it("next_to falls back to default when no comparator", () => {
    const clue = renderClue({ type: "next_to", a: "Alice", b: "Bob" }, posGrid);
    expect(clue.text).toBe("Alice lives next to Bob.");
  });
});

describe("ordering phrases on non-position category", () => {
  const orderedGrid: Grid = {
    size: 3,
    categories: [
      { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
      {
        name: "Duration",
        values: ["2h", "4h", "6h"],
        noun: "flight",
        numericValues: [2, 4, 6],
        orderingPhrases: {
          unit: ["hour", "hours"],
          comparators: {
            before: "has a shorter flight than",
          },
        },
      },
      { name: "Color", values: ["Red", "Blue", "Green"] },
    ],
  };

  it("before uses comparator from shared category", () => {
    const clue = renderClue({ type: "before", a: "2h", b: "6h" }, orderedGrid);
    expect(clue.text).toBe(
      "The 2h flight is has a shorter flight than the 6h flight.",
    );
  });

  it("before falls back to default for cross-category values", () => {
    const clue = renderClue(
      { type: "before", a: "Alice", b: "Red" },
      orderedGrid,
    );
    expect(clue.text).toMatch(/somewhere (left|right) of/);
  });

  it("exact_distance uses unit from shared category", () => {
    const clue = renderClue(
      { type: "exact_distance", a: "2h", b: "6h", distance: 2 },
      orderedGrid,
    );
    expect(clue.text).toBe(
      "The 2h flight is exactly 2 hours from the 6h flight.",
    );
  });

  it("exact_distance falls back to houses for cross-category values", () => {
    const clue = renderClue(
      { type: "exact_distance", a: "Alice", b: "Red", distance: 2 },
      orderedGrid,
    );
    expect(clue.text).toBe(
      "Alice lives exactly two houses from the red house.",
    );
  });
});
