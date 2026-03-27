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
    expect(clue.text).toBe("The blue house is next to the cat owner.");
  });

  it("not_next_to", () => {
    const clue = renderClue({ type: "not_next_to", a: "Tea", b: "Dog" }, grid);
    expect(clue.text).toBe(
      "The tea drinker does not live next to the dog owner.",
    );
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
