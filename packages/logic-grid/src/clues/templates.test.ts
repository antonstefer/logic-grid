import { describe, it, expect } from "vitest";
import { renderClue } from "./templates";
import { posPrep } from "../grid-utils";
import { DEFAULT_CONFIG } from "../generator";
import { makeGrid } from "../test-helpers";
import type { Grid, SpatialWords } from "../types";

const POSITIONAL_WORDS: SpatialWords = {
  verb: ["is", "is not"],
  adjacency: "adjacent to",
  direction: ["before", "after"],
  between: "somewhere between",
  atPosition: ["is at", "is not at"],
  cardinals: ["zero", "one", "two", "three", "four", "five", "six", "seven"],
};

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
      positionAdjective: { suffix: "house", atPosition: ["is", "is not"] },
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
  spatialWords: DEFAULT_CONFIG.spatialWords,
  positionLabels: ["the first house", "the second house", "the third house"],
});

describe("renderClue", () => {
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

  it("same_position: pet + drink", () => {
    const clue = renderClue(
      { type: "same_position", a: "Cat", b: "Coffee" },
      grid,
    );
    expect(clue.text).toBe("The cat owner drinks coffee.");
  });

  it("not_same_position: name + pet", () => {
    const clue = renderClue(
      { type: "not_same_position", a: "Alice", b: "Dog" },
      grid,
    );
    expect(clue.text).toBe("Alice does not own the dog.");
  });

  it("not_same_position: name + color", () => {
    const clue = renderClue(
      { type: "not_same_position", a: "Bob", b: "Red" },
      grid,
    );
    expect(clue.text).toBe("Bob does not live in the red house.");
  });

  it("not_same_position: color + pet", () => {
    const clue = renderClue(
      { type: "not_same_position", a: "Red", b: "Cat" },
      grid,
    );
    expect(clue.text).toBe("The cat owner does not live in the red house.");
  });

  it("not_same_position: name + drink", () => {
    const clue = renderClue(
      { type: "not_same_position", a: "Alice", b: "Tea" },
      grid,
    );
    expect(clue.text).toBe("Alice does not drink tea.");
  });

  it("not_same_position: color + drink", () => {
    const clue = renderClue(
      { type: "not_same_position", a: "Blue", b: "Coffee" },
      grid,
    );
    expect(clue.text).toBe(
      "The coffee drinker does not live in the blue house.",
    );
  });

  it("not_same_position: pet + drink", () => {
    const clue = renderClue(
      { type: "not_same_position", a: "Dog", b: "Water" },
      grid,
    );
    expect(clue.text).toBe("The dog owner does not drink water.");
  });

  it("next_to", () => {
    const clue = renderClue({ type: "next_to", a: "Blue", b: "Cat" }, grid);
    expect(clue.text).toBe("The cat owner lives next to the blue house.");
  });

  it("not_next_to", () => {
    const clue = renderClue({ type: "not_next_to", a: "Tea", b: "Dog" }, grid);
    expect(clue.text).toBe(
      "The tea drinker does not live next to the dog owner.",
    );
  });

  it("not_next_to: color + pet", () => {
    const clue = renderClue({ type: "not_next_to", a: "Red", b: "Cat" }, grid);
    expect(clue.text).toBe(
      "The cat owner does not live next to the red house.",
    );
  });

  it("left_of renders as left or right", () => {
    const clue = renderClue({ type: "left_of", a: "Blue", b: "Green" }, grid);
    // Deterministic per constraint — could be either phrasing
    expect(
      clue.text === "The blue house lives directly left of the green house." ||
        clue.text === "The green house lives directly right of the blue house.",
    ).toBe(true);
  });

  it("between", () => {
    const clue = renderClue(
      { type: "between", outer1: "Red", middle: "Cat", outer2: "Blue" },
      grid,
    );
    expect(clue.text).toBe(
      "The cat owner lives somewhere between the red house and the blue house.",
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
      "The cat owner does not live somewhere between the red house and the blue house.",
    );
  });

  it("not_between: house noun as middle", () => {
    const clue = renderClue(
      { type: "not_between", outer1: "Alice", middle: "Red", outer2: "Cat" },
      grid,
    );
    expect(clue.text).toBe(
      "The red house is not somewhere between Alice and the cat owner.",
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
    expect(clue.text).toBe(
      "Alice lives exactly two houses from the cat owner.",
    );
  });

  it("exact_distance singular", () => {
    const clue = renderClue(
      { type: "exact_distance", a: "Alice", b: "Cat", distance: 1 },
      grid,
    );
    expect(clue.text).toBe("Alice lives exactly one house from the cat owner.");
  });

  it("throws on unknown value", () => {
    expect(() =>
      renderClue({ type: "same_position", a: "Unknown", b: "Cat" }, grid),
    ).toThrow("Unknown value: Unknown");
  });

  it("swaps subject/object when b has higher priority", () => {
    // Cat (owner, priority 1) as a, Alice (person, priority 2) as b
    // Should swap so Alice becomes the subject
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
    spatialWords: DEFAULT_CONFIG.spatialWords,
    positionLabels: ["the first house", "the second house", "the third house"],
  });

  it("same_position with custom verb", () => {
    const clue = renderClue(
      { type: "same_position", a: "Alice", b: "Toyota" },
      customGrid,
    );
    expect(clue.text).toBe("Alice drives the toyota.");
  });

  it("not_same_position with custom verb", () => {
    const clue = renderClue(
      { type: "not_same_position", a: "Alice", b: "BMW" },
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

  it("custom noun without verb uses generic fallback", () => {
    const clue = renderClue(
      { type: "same_position", a: "Alice", b: "Apple" },
      customGrid,
    );
    // Fruit has noun "lover" but no verb, so falls back to generic
    expect(clue.text).toBe("Alice and the apple lover are in the same house.");
  });

  it("empty-string noun renders bare value", () => {
    const bareGrid = makeGrid({
      size: 3,
      categories: [
        {
          name: "Player",
          values: ["Alice", "Bob", "Carol"],
          noun: "",
        },
        {
          name: "Color",
          values: ["Red", "Blue", "Green"],
          noun: "house",
          verb: ["lives in the", "does not live in the"],
          subjectPriority: -1,
          positionAdjective: { suffix: "house", atPosition: ["is", "is not"] },
        },
      ],
      spatialWords: DEFAULT_CONFIG.spatialWords,
      positionLabels: [
        "the first house",
        "the second house",
        "the third house",
      ],
    });
    const clue = renderClue(
      { type: "same_position", a: "Alice", b: "Red" },
      bareGrid,
    );
    expect(clue.text).toBe("Alice lives in the red house.");
  });

  it("falls back to defaults when no custom noun/verb", () => {
    // Standard grid with no custom fields — should work as before
    const clue = renderClue(
      { type: "same_position", a: "Alice", b: "Red" },
      grid,
    );
    expect(clue.text).toBe("Alice lives in the red house.");
  });
});

describe("custom positionNoun / positionPreposition", () => {
  const seatGrid = makeGrid({
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
        verb: ["lives at the", "does not live at the"],
        subjectPriority: -1,
        positionAdjective: { suffix: "seat", atPosition: ["is", "is not"] },
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
    positionNoun: ["seat", "seats"],
    positionPreposition: "at",
    spatialWords: {
      ...DEFAULT_CONFIG.spatialWords,
      atPosition: ["lives at", "does not live at"],
    },
    positionLabels: ["the first seat", "the second seat", "the third seat"],
  });

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
    expect(clue.text).toBe("Alice lives exactly one seat from the cat owner.");
  });

  it("exact_distance plural uses custom noun", () => {
    const clue = renderClue(
      { type: "exact_distance", a: "Alice", b: "Cat", distance: 2 },
      seatGrid,
    );
    expect(clue.text).toBe("Alice lives exactly two seats from the cat owner.");
  });

  it("same_position color + pet uses custom noun and preposition", () => {
    const clue = renderClue(
      { type: "same_position", a: "Red", b: "Cat" },
      seatGrid,
    );
    expect(clue.text).toBe("The cat owner lives at the red seat.");
  });

  it("same_position name + color uses custom noun and preposition", () => {
    const clue = renderClue(
      { type: "same_position", a: "Alice", b: "Blue" },
      seatGrid,
    );
    expect(clue.text).toBe("Alice lives at the blue seat.");
  });

  it("not_same_position color + pet uses custom noun and preposition", () => {
    const clue = renderClue(
      { type: "not_same_position", a: "Red", b: "Cat" },
      seatGrid,
    );
    expect(clue.text).toBe("The cat owner does not live at the red seat.");
  });

  it("not_same_position color + drink uses custom noun", () => {
    const clue = renderClue(
      { type: "not_same_position", a: "Blue", b: "Coffee" },
      seatGrid,
    );
    expect(clue.text).toBe(
      "The coffee drinker does not live at the blue seat.",
    );
  });

  it("same_position fallback uses custom noun and preposition", () => {
    const minGrid = makeGrid({
      size: 3,
      categories: [
        {
          name: "Shape",
          values: ["Circle", "Square", "Triangle"],
          noun: "shape",
        },
        { name: "Size", values: ["Small", "Medium", "Large"], noun: "size" },
      ],
      positionNoun: ["slot", "slots"],
      positionPreposition: "at",
      spatialWords: DEFAULT_CONFIG.spatialWords,
      positionLabels: ["the first slot", "the second slot", "the third slot"],
    });
    const clue = renderClue(
      { type: "same_position", a: "Circle", b: "Small" },
      minGrid,
    );
    expect(clue.text).toBe(
      "The circle shape and the small size are at the same slot.",
    );
  });

  it("not_same_position fallback (negative branch)", () => {
    const minGrid = makeGrid({
      size: 3,
      categories: [
        {
          name: "Shape",
          values: ["Circle", "Square", "Triangle"],
          noun: "shape",
        },
        { name: "Size", values: ["Small", "Medium", "Large"], noun: "size" },
      ],
      spatialWords: DEFAULT_CONFIG.spatialWords,
      positionLabels: [
        "the first house",
        "the second house",
        "the third house",
      ],
    });
    const clue = renderClue(
      { type: "not_same_position", a: "Circle", b: "Small" },
      minGrid,
    );
    expect(clue.text).toBe(
      "The circle shape and the small size are not in the same house.",
    );
  });

  it("throws on empty positionNoun singular", () => {
    const badGrid = makeGrid({
      size: 3,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
      ],
      positionNoun: ["", "seats"],
      spatialWords: {
        verb: ["is", "is not"],
        adjacency: "next to",
        direction: ["left of", "right of"],
        between: "somewhere between",
        atPosition: ["is in", "is not in"],
        cardinals: ["zero", "one", "two", "three"],
      },
    });
    expect(() =>
      renderClue(
        { type: "exact_distance", a: "Alice", b: "Bob", distance: 1 },
        badGrid,
      ),
    ).toThrow(RangeError);
  });

  it("throws on empty positionNoun plural", () => {
    const badGrid = makeGrid({
      size: 3,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
      ],
      positionNoun: ["seat", ""],
      spatialWords: {
        verb: ["is", "is not"],
        adjacency: "next to",
        direction: ["left of", "right of"],
        between: "somewhere between",
        atPosition: ["is at", "is not at"],
        cardinals: ["zero", "one", "two", "three"],
      },
    });
    expect(() =>
      renderClue(
        { type: "exact_distance", a: "Alice", b: "Bob", distance: 2 },
        badGrid,
      ),
    ).toThrow(RangeError);
  });

  it("throws on empty positionPreposition", () => {
    const badGrid = makeGrid({
      size: 3,
      categories: [{ name: "Name", values: ["Alice", "Bob", "Carol"] }],
      positionPreposition: "",
    });
    expect(() => posPrep(badGrid)).toThrow(RangeError);
  });
});

describe("position category", () => {
  const posGrid = makeGrid({
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
            before: "has a lower return than",
            left_of: "has a return exactly one percentage point less than",
            next_to: "has a return within one percentage point of",
            not_next_to:
              "does not have a return within one percentage point of",
            between: "has a return between",
            not_between: "does not have a return between",
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
    spatialWords: {
      ...POSITIONAL_WORDS,
      distanceUnit: ["percentage point", "percentage points"],
    },
    positionLabels: ["6%", "7%", "8%"],
  });

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

  it("before uses ordering templates", () => {
    const clue = renderClue({ type: "before", a: "Alice", b: "Bob" }, posGrid);
    expect(clue.text).toMatch(/somewhere (before|after)/);
  });

  it("left_of uses ordering templates", () => {
    const clue = renderClue({ type: "left_of", a: "Alice", b: "Bob" }, posGrid);
    expect(
      clue.text === "Alice is directly before Bob." ||
        clue.text === "Bob is directly after Alice.",
    ).toBe(true);
  });

  it("left_of uses grid comparator when set", () => {
    const g: Grid = {
      ...posGrid,
      spatialWords: {
        ...posGrid.spatialWords,
        comparators: {
          ...posGrid.spatialWords.comparators,
          left_of: "has a return exactly one point less than",
        },
      },
    };
    const clue = renderClue({ type: "left_of", a: "Alice", b: "Bob" }, g);
    expect(clue.text).toBe(
      "Alice has a return exactly one point less than Bob.",
    );
  });

  it("before uses grid comparator when set", () => {
    const g: Grid = {
      ...posGrid,
      spatialWords: {
        ...posGrid.spatialWords,
        comparators: {
          ...posGrid.spatialWords.comparators,
          before: "has a lower return than",
        },
      },
    };
    const clue = renderClue({ type: "before", a: "Alice", b: "Bob" }, g);
    expect(clue.text).toBe("Alice has a lower return than Bob.");
  });

  it("exact_distance uses unit from ordering templates", () => {
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

  it("next_to uses ordering templates", () => {
    const clue = renderClue({ type: "next_to", a: "Alice", b: "Bob" }, posGrid);
    expect(clue.text).toBe("Alice is adjacent to Bob.");
  });

  it("not_next_to uses ordering templates", () => {
    const clue = renderClue(
      { type: "not_next_to", a: "Alice", b: "Bob" },
      posGrid,
    );
    expect(clue.text).toBe("Alice is not adjacent to Bob.");
  });

  it("between uses ordering templates", () => {
    const clue = renderClue(
      { type: "between", outer1: "Alice", middle: "Bob", outer2: "Carol" },
      posGrid,
    );
    expect(clue.text).toBe("Bob is somewhere between Alice and Carol.");
  });

  it("not_between uses ordering templates", () => {
    const clue = renderClue(
      { type: "not_between", outer1: "Alice", middle: "Bob", outer2: "Carol" },
      posGrid,
    );
    expect(clue.text).toBe("Bob is not somewhere between Alice and Carol.");
  });

  it("between uses grid comparator when set", () => {
    const g: Grid = {
      ...posGrid,
      spatialWords: {
        ...posGrid.spatialWords,
        comparators: {
          ...posGrid.spatialWords.comparators,
          between: "has a return between",
        },
      },
    };
    const clue = renderClue(
      { type: "between", outer1: "Alice", middle: "Bob", outer2: "Carol" },
      g,
    );
    expect(clue.text).toBe("Bob has a return between Alice and Carol.");
  });

  it("not_between uses grid comparator when set", () => {
    const g: Grid = {
      ...posGrid,
      spatialWords: {
        ...posGrid.spatialWords,
        comparators: {
          ...posGrid.spatialWords.comparators,
          not_between: "does not have a return between",
        },
      },
    };
    const clue = renderClue(
      { type: "not_between", outer1: "Alice", middle: "Bob", outer2: "Carol" },
      g,
    );
    expect(clue.text).toBe(
      "Bob does not have a return between Alice and Carol.",
    );
  });
});
