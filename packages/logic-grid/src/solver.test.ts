import { describe, it, expect } from "vitest";
import { solve, hasUniqueSolution } from "./solver";
import { makeGrid } from "./test-helpers";
import type { Constraint } from "./types";

/**
 * 3x3 puzzle: auto-added House + 3 custom categories.
 *
 * Solution:
 *   Row 0: first house, Red,   Cat,  Tea
 *   Row 1: second house, Blue,  Dog,  Coffee
 *   Row 2: third house, Green, Fish, Water
 */
const grid3x3 = makeGrid({
  size: 3,
  categories: [
    { name: "Color", values: ["Red", "Blue", "Green"] },
    { name: "Pet", values: ["Cat", "Dog", "Fish"] },
    { name: "Drink", values: ["Tea", "Coffee", "Water"] },
  ],
});

const puzzle3x3: Constraint[] = [
  { type: "at_position", value: "Red", position: 0 },
  { type: "same_position", a: "Red", b: "Cat" },
  { type: "left_of", a: "Blue", b: "Green", axis: "House" },
  { type: "same_position", a: "Blue", b: "Dog" },
  { type: "same_position", a: "Dog", b: "Coffee" },
  { type: "at_position", value: "Tea", position: 0 },
];

describe("solve", () => {
  it("solves a 3x3 puzzle with known solution", () => {
    const solution = solve(puzzle3x3, grid3x3);
    expect(solution).not.toBeNull();

    // Auto-added House is categories[0], then Color, Pet, Drink.
    const [, colors, pets, drinks] = solution!;
    expect(colors).toEqual({ Red: 0, Blue: 1, Green: 2 });
    expect(pets).toEqual({ Cat: 0, Dog: 1, Fish: 2 });
    expect(drinks).toEqual({ Tea: 0, Coffee: 1, Water: 2 });
  });

  it("returns null for contradictory constraints", () => {
    const impossible: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "at_position", value: "Red", position: 1 },
    ];
    expect(solve(impossible, grid3x3)).toBeNull();
  });

  it("returns a valid solution even with no puzzle constraints", () => {
    const solution = solve([], grid3x3);
    expect(solution).not.toBeNull();
    for (const assignment of solution!) {
      const positions = Object.values(assignment);
      expect(new Set(positions).size).toBe(3);
    }
  });
});

/** 4x4 puzzle with auto-added House. */
const grid4x4 = makeGrid({
  size: 4,
  categories: [
    { name: "Name", values: ["Alice", "Bob", "Carol", "Dave"] },
    { name: "Color", values: ["Red", "Blue", "Green", "Yellow"] },
    { name: "Pet", values: ["Cat", "Dog", "Fish", "Bird"] },
    { name: "Drink", values: ["Tea", "Coffee", "Milk", "Water"] },
  ],
});

const puzzle4x4: Constraint[] = [
  { type: "at_position", value: "Alice", position: 0 },
  { type: "same_position", a: "Alice", b: "Red" },
  { type: "same_position", a: "Alice", b: "Tea" },
  { type: "next_to", a: "Bob", b: "Alice", axis: "House" },
  { type: "same_position", a: "Dave", b: "Yellow" },
  { type: "left_of", a: "Blue", b: "Green", axis: "House" },
  { type: "same_position", a: "Carol", b: "Fish" },
  { type: "at_position", value: "Milk", position: 2 },
  { type: "same_position", a: "Dog", b: "Coffee" },
  { type: "left_of", a: "Dog", b: "Fish", axis: "House" },
  { type: "not_same_position", a: "Alice", b: "Bird" },
];

describe("solve 4x4", () => {
  it("solves a 4x4 puzzle with known solution", () => {
    const solution = solve(puzzle4x4, grid4x4);
    expect(solution).not.toBeNull();

    // House, Name, Color, Pet, Drink
    const [, names, colors, pets, drinks] = solution!;
    expect(names).toEqual({ Alice: 0, Bob: 1, Carol: 2, Dave: 3 });
    expect(colors).toEqual({ Red: 0, Blue: 1, Green: 2, Yellow: 3 });
    expect(pets).toEqual({ Cat: 0, Dog: 1, Fish: 2, Bird: 3 });
    expect(drinks).toEqual({ Tea: 0, Coffee: 1, Milk: 2, Water: 3 });
  });
});

describe("hasUniqueSolution", () => {
  it("returns true for the 3x3 puzzle", () => {
    expect(hasUniqueSolution(puzzle3x3, grid3x3)).toBe(true);
  });

  it("returns true for the 4x4 puzzle", () => {
    expect(hasUniqueSolution(puzzle4x4, grid4x4)).toBe(true);
  });

  it("returns false when a constraint is removed", () => {
    const weakened = puzzle3x3.slice(0, -1);
    expect(hasUniqueSolution(weakened, grid3x3)).toBe(false);
  });

  it("returns false with no constraints", () => {
    expect(hasUniqueSolution([], grid3x3)).toBe(false);
  });
});
