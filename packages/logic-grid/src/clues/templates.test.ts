import { describe, it, expect } from "vitest";
import { renderClue } from "./templates";
import { DEFAULT_SPATIAL_WORDS } from "../default-config";
import { makeGrid } from "../test-helpers";
import type { Grid, SpatialWords } from "../types";

const grid = makeGrid({
  size: 3,
  categories: [
    {
      name: "Name",
      values: ["Alice", "Bob", "Carol"],
      noun: "",
      subjectPriority: 2,
    },
    {
      name: "Color",
      values: ["Red", "Blue", "Green"],
      noun: "house",
      verb: ["lives in the", "does not live in the"],
      subjectPriority: -1,
      valueSuffix: "house",
      positionAdjective: ["is", "is not"],
    },
    {
      name: "Pet",
      values: ["Cat", "Dog", "Fish"],
      noun: "owner",
      verb: ["owns the", "does not own the"],
      subjectPriority: 1,
    },
    {
      name: "Drink",
      values: ["Tea", "Coffee", "Water"],
      noun: "drinker",
      verb: ["drinks", "does not drink"],
      subjectPriority: 1,
    },
  ],
});

describe("renderClue — classic same_position paths", () => {
  it("same_position: color + pet", () => {
    const clue = renderClue(
      { type: "same_position", a: "Red", b: "Cat" },
      grid,
    );
    expect(clue.text).toBe("The cat owner lives in the red house.");
  });

  it("same_position: name + color", () => {
    const clue = renderClue(
      { type: "same_position", a: "Alice", b: "Blue" },
      grid,
    );
    expect(clue.text).toBe("Alice lives in the blue house.");
  });

  it("same_position: name + pet", () => {
    const clue = renderClue(
      { type: "same_position", a: "Bob", b: "Dog" },
      grid,
    );
    expect(clue.text).toBe("Bob owns the dog.");
  });

  it("same_position: name + drink", () => {
    const clue = renderClue(
      { type: "same_position", a: "Carol", b: "Tea" },
      grid,
    );
    expect(clue.text).toBe("Carol drinks tea.");
  });

  it("not_same_position: name + pet", () => {
    const clue = renderClue(
      { type: "not_same_position", a: "Alice", b: "Dog" },
      grid,
    );
    expect(clue.text).toBe("Alice does not own the dog.");
  });

  it("not_same_position: color + pet", () => {
    const clue = renderClue(
      { type: "not_same_position", a: "Red", b: "Cat" },
      grid,
    );
    expect(clue.text).toBe("The cat owner does not live in the red house.");
  });

  it("subject priority swap", () => {
    const clue = renderClue(
      { type: "same_position", a: "Cat", b: "Alice" },
      grid,
    );
    expect(clue.text).toBe("Alice owns the cat.");
  });

  it("preserves constraint in returned clue", () => {
    const constraint = { type: "same_position" as const, a: "Red", b: "Cat" };
    const clue = renderClue(constraint, grid);
    expect(clue.constraint).toBe(constraint);
  });

  it("throws on unknown value", () => {
    expect(() =>
      renderClue({ type: "same_position", a: "Unknown", b: "Cat" }, grid),
    ).toThrow("Unknown value: Unknown");
  });
});

describe("at_position / not_at_position", () => {
  it("at_position renders via position label from first ordered category", () => {
    const clue = renderClue(
      { type: "at_position", value: "Alice", position: 0 },
      grid,
    );
    expect(clue.text).toBe("Alice lives in the first house.");
  });

  it("not_at_position uses positionAdjective for Color+House", () => {
    const clue = renderClue(
      { type: "not_at_position", value: "Red", position: 2 },
      grid,
    );
    expect(clue.text).toBe("The third house is not red.");
  });

  it("at_position uses positionAdjective for Color+House", () => {
    const clue = renderClue(
      { type: "at_position", value: "Red", position: 1 },
      grid,
    );
    expect(clue.text).toBe("The second house is red.");
  });
});

describe("positionAdjective + ordered rendering rule", () => {
  // The auto-added House category is ordered; Color has positionAdjective.
  // same_position(Red, "first") must render as "The first house is red."
  it("recovers Color+House 'is red' phrasing via same_position", () => {
    const clue = renderClue(
      { type: "same_position", a: "Red", b: "first" },
      grid,
    );
    expect(clue.text).toBe("The first house is red.");
  });

  it("negated variant renders 'is not red'", () => {
    const clue = renderClue(
      { type: "not_same_position", a: "Red", b: "second" },
      grid,
    );
    expect(clue.text).toBe("The second house is not red.");
  });

  it("works with house value as constraint.a", () => {
    const clue = renderClue(
      { type: "same_position", a: "third", b: "Blue" },
      grid,
    );
    expect(clue.text).toBe("The third house is blue.");
  });

  it("Name + House falls through to normal same_position path", () => {
    const clue = renderClue(
      { type: "same_position", a: "Alice", b: "first" },
      grid,
    );
    expect(clue.text).toBe("Alice lives in the first house.");
  });
});

describe("renderClue — comparatives on House axis", () => {
  it("next_to", () => {
    const clue = renderClue(
      { type: "next_to", a: "Blue", b: "Cat", axis: "House" },
      grid,
    );
    expect(clue.text).toBe("The cat owner lives next to the blue house.");
  });

  it("not_next_to", () => {
    const clue = renderClue(
      { type: "not_next_to", a: "Tea", b: "Dog", axis: "House" },
      grid,
    );
    expect(clue.text).toBe(
      "The tea drinker does not live next to the dog owner.",
    );
  });

  it("left_of", () => {
    const clue = renderClue(
      { type: "left_of", a: "Blue", b: "Green", axis: "House" },
      grid,
    );
    expect(
      clue.text === "The blue house lives directly left of the green house." ||
        clue.text === "The green house lives directly right of the blue house.",
    ).toBe(true);
  });

  it("between", () => {
    const clue = renderClue(
      {
        type: "between",
        outer1: "Red",
        middle: "Cat",
        outer2: "Blue",
        axis: "House",
      },
      grid,
    );
    expect(clue.text).toBe(
      "The cat owner lives somewhere between the red house and the blue house.",
    );
  });

  it("not_between", () => {
    const clue = renderClue(
      {
        type: "not_between",
        outer1: "Red",
        middle: "Cat",
        outer2: "Blue",
        axis: "House",
      },
      grid,
    );
    expect(clue.text).toBe(
      "The cat owner does not live somewhere between the red house and the blue house.",
    );
  });

  it("before", () => {
    const clue = renderClue(
      { type: "before", a: "Alice", b: "Cat", axis: "House" },
      grid,
    );
    expect(clue.text).toMatch(/somewhere (left|right) of/);
  });

  it("exact_distance plural", () => {
    const clue = renderClue(
      {
        type: "exact_distance",
        a: "Alice",
        b: "Cat",
        distance: 2,
        axis: "House",
      },
      grid,
    );
    expect(clue.text).toBe(
      "Alice lives exactly two houses from the cat owner.",
    );
  });

  it("exact_distance singular", () => {
    const clue = renderClue(
      {
        type: "exact_distance",
        a: "Alice",
        b: "Cat",
        distance: 1,
        axis: "House",
      },
      grid,
    );
    expect(clue.text).toBe("Alice lives exactly one house from the cat owner.");
  });
});

describe("custom category noun/verb", () => {
  const customGrid = makeGrid({
    size: 3,
    categories: [
      { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
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
  });

  it("same_position with custom verb", () => {
    const clue = renderClue(
      { type: "same_position", a: "Alice", b: "Toyota" },
      customGrid,
    );
    expect(clue.text).toBe("Alice drives the toyota.");
  });

  it("throws when object category has no verb", () => {
    expect(() =>
      renderClue({ type: "same_position", a: "Alice", b: "Apple" }, customGrid),
    ).toThrow('category "Fruit" has no verb');
  });
});

describe("grid-level comparator overrides", () => {
  const withComparators: Grid = {
    ...grid,
    spatialWords: {
      ...grid.spatialWords,
      comparators: {
        before: "comes earlier than",
        left_of: "is directly before",
        next_to: "is adjacent to",
        not_next_to: "is not adjacent to",
        between: "is between",
        not_between: "is not between",
        exact_distance: "is exactly",
      },
    },
  };

  it("before uses grid comparator when set", () => {
    const clue = renderClue(
      { type: "before", a: "Alice", b: "Bob", axis: "House" },
      withComparators,
    );
    expect(clue.text).toBe("Alice comes earlier than Bob.");
  });

  it("next_to uses grid comparator when set", () => {
    const clue = renderClue(
      { type: "next_to", a: "Alice", b: "Bob", axis: "House" },
      withComparators,
    );
    expect(clue.text).toMatch(
      /^(Alice is adjacent to Bob|Bob is adjacent to Alice)\.$/,
    );
  });

  it("between uses grid comparator when set", () => {
    const clue = renderClue(
      {
        type: "between",
        outer1: "Alice",
        middle: "Bob",
        outer2: "Carol",
        axis: "House",
      },
      withComparators,
    );
    expect(clue.text).toBe("Bob is between Alice and Carol.");
  });
});

describe("before with tuple comparator picks forward or reverse", () => {
  const withTuple: Grid = {
    ...grid,
    spatialWords: {
      ...grid.spatialWords,
      comparators: {
        before: ["has a lower return than", "has a higher return than"],
      },
    },
  };

  it("picks forward or reverse phrase deterministically", () => {
    const aliceBob = renderClue(
      { type: "before", a: "Alice", b: "Bob", axis: "House" },
      withTuple,
    );
    expect(aliceBob.text).toMatch(
      /^(Alice has a lower return than Bob|Bob has a higher return than Alice)\.$/,
    );
    // Deterministic: same input → same output.
    const again = renderClue(
      { type: "before", a: "Alice", b: "Bob", axis: "House" },
      withTuple,
    );
    expect(again.text).toBe(aliceBob.text);
  });
});

describe("distance unit from spatialWords.distanceUnit", () => {
  const withUnit: Grid = {
    ...grid,
    spatialWords: {
      ...grid.spatialWords,
      distanceUnit: ["percentage point", "percentage points"],
    },
  };

  it("exact_distance singular", () => {
    const clue = renderClue(
      {
        type: "exact_distance",
        a: "Alice",
        b: "Cat",
        distance: 1,
        axis: "House",
      },
      withUnit,
    );
    expect(clue.text).toBe(
      "Alice lives exactly 1 percentage point from the cat owner.",
    );
  });

  it("exact_distance plural", () => {
    const clue = renderClue(
      {
        type: "exact_distance",
        a: "Alice",
        b: "Cat",
        distance: 2,
        axis: "House",
      },
      withUnit,
    );
    expect(clue.text).toBe(
      "Alice lives exactly 2 percentage points from the cat owner.",
    );
  });
});

describe("per-axis orderingPhrases in rendering", () => {
  // Grid with two ordered axes, each with its own comparator phrases.
  const multiGrid = makeGrid({
    size: 3,
    categories: [
      {
        name: "Name",
        values: ["Alice", "Bob", "Carol"],
        noun: "",
        subjectPriority: 2,
      },
      {
        name: "Year",
        values: ["2020", "2021", "2022"],
        noun: "fund",
        verb: ["was begun in", "was not begun in"],
        ordered: true,
        orderingPhrases: {
          comparators: {
            before: ["was begun earlier than", "was begun later than"] as [
              string,
              string,
            ],
            next_to: "was begun in the closest year to",
          },
        },
      },
      {
        name: "Return",
        values: ["5%", "6%", "7%"],
        noun: "fund",
        verb: ["has a return of", "does not have a return of"],
        ordered: true,
        orderingPhrases: {
          unit: ["percentage point", "percentage points"] as [string, string],
          comparators: {
            before: ["has a lower return than", "has a higher return than"] as [
              string,
              string,
            ],
          },
        },
      },
    ],
  });

  it("before uses Year axis comparators when axis=Year", () => {
    const clue = renderClue(
      { type: "before", a: "Alice", b: "Bob", axis: "Year" },
      multiGrid,
    );
    expect(clue.text).toMatch(/was begun (earlier|later) than/);
  });

  it("before uses Return axis comparators when axis=Return", () => {
    const clue = renderClue(
      { type: "before", a: "Alice", b: "Bob", axis: "Return" },
      multiGrid,
    );
    expect(clue.text).toMatch(/has a (lower|higher) return than/);
  });

  it("next_to uses Year axis comparators when axis=Year", () => {
    const clue = renderClue(
      { type: "next_to", a: "Alice", b: "Bob", axis: "Year" },
      multiGrid,
    );
    expect(clue.text).toContain("was begun in the closest year to");
  });

  it("next_to falls through to grid defaults when axis=Return (no next_to override)", () => {
    const clue = renderClue(
      { type: "next_to", a: "Alice", b: "Bob", axis: "Return" },
      multiGrid,
    );
    // Return has no next_to comparator → falls through to spatial words default.
    expect(clue.text).toMatch(/lives next to/);
  });

  it("exact_distance uses per-axis unit when axis has one", () => {
    const clue = renderClue(
      {
        type: "exact_distance",
        a: "Alice",
        b: "Bob",
        distance: 2,
        axis: "Return",
      },
      multiGrid,
    );
    expect(clue.text).toContain("2 percentage points");
  });

  it("exact_distance uses grid default when axis has no unit", () => {
    const clue = renderClue(
      {
        type: "exact_distance",
        a: "Alice",
        b: "Bob",
        distance: 2,
        axis: "Year",
      },
      multiGrid,
    );
    // Year has no unit → falls through to cardinals ("two houses").
    expect(clue.text).toContain("two houses");
  });
});

describe("default spatial words sanity", () => {
  it("DEFAULT_SPATIAL_WORDS has expected shape", () => {
    const w: SpatialWords = DEFAULT_SPATIAL_WORDS;
    expect(w.verb).toEqual(["lives", "does not live"]);
    expect(w.adjacency).toBe("next to");
    expect(w.direction).toEqual(["left of", "right of"]);
    expect(w.between).toBe("somewhere between");
    expect(w.cardinals.length).toBeGreaterThanOrEqual(4);
  });
});
