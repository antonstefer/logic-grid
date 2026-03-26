import { describe, it, expect } from "vitest";
import { solve, hasUniqueSolution } from "./solver";
import { Grid, Constraint } from "./types";

/**
 * 3x3 puzzle: 3 houses, 3 categories
 *
 * Solution (verify by hand):
 *   Position 0: Red,   Cat,  Tea
 *   Position 1: Blue,  Dog,  Coffee
 *   Position 2: Green, Fish, Water
 *
 * Reasoning:
 *   - Red is at position 0 (at_position)
 *   - Red and Cat share a house → Cat=0
 *   - Blue is directly left of Green → Blue=1, Green=2 (can't be 0, that's Red)
 *   - Blue and Dog share a house → Dog=1, so Fish=2
 *   - Dog and Coffee share a house → Coffee=1
 *   - Tea is at position 0 (at_position) → Water=2
 */
const grid3x3: Grid = {
  size: 3,
  categories: [
    { name: "Color", values: ["Red", "Blue", "Green"] },
    { name: "Pet", values: ["Cat", "Dog", "Fish"] },
    { name: "Drink", values: ["Tea", "Coffee", "Water"] },
  ],
};

const puzzle3x3: Constraint[] = [
  { type: "at_position", value: "Red", position: 0 },
  { type: "same_house", a: "Red", b: "Cat" },
  { type: "left_of", a: "Blue", b: "Green" },
  { type: "same_house", a: "Blue", b: "Dog" },
  { type: "same_house", a: "Dog", b: "Coffee" },
  { type: "at_position", value: "Tea", position: 0 },
];

describe("solve", () => {
  it("solves a 3x3 puzzle with known solution", () => {
    const solution = solve(puzzle3x3, grid3x3);
    expect(solution).not.toBeNull();

    const [colors, pets, drinks] = solution!;
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

/**
 * 4x4 puzzle
 *
 * Solution (verify by hand):
 *   Position 0: Alice, Red,    Cat,  Tea
 *   Position 1: Bob,   Blue,   Dog,  Coffee
 *   Position 2: Carol, Green,  Fish, Milk
 *   Position 3: Dave,  Yellow, Bird, Water
 *
 * Reasoning:
 *   1. Alice=0 (at_position)
 *   2. Alice=Red → Red=0 (same_house)
 *   3. Alice=Tea → Tea=0 (same_house)
 *   4. Bob next to Alice(0) → Bob=1 (only adjacent position)
 *   5. Dave=Yellow (same_house). Remaining positions for Carol,Dave: {2,3}
 *   6. left_of(Blue,Green): Blue can't be 0 (Red). Options: (1,2) or (2,3).
 *      If (2,3): Yellow would need pos 1, but Bob=1. Contradiction.
 *      So Blue=1, Green=2 → Yellow=3 → Dave=3, Carol=2
 *   7. Carol=Fish → Fish=2 (same_house)
 *   8. Milk=2 (at_position) → Carol drinks Milk
 *   9. left_of(Dog,Fish): Fish=2, so Dog=1
 *  10. Dog=Coffee → Coffee=1 (same_house)
 *  11. Alice≠Bird (not_same_house) → Bird≠0 → Bird=3, Cat=0
 *      Remaining: Water=3
 */
const grid4x4: Grid = {
  size: 4,
  categories: [
    { name: "Name", values: ["Alice", "Bob", "Carol", "Dave"] },
    { name: "Color", values: ["Red", "Blue", "Green", "Yellow"] },
    { name: "Pet", values: ["Cat", "Dog", "Fish", "Bird"] },
    { name: "Drink", values: ["Tea", "Coffee", "Milk", "Water"] },
  ],
};

const puzzle4x4: Constraint[] = [
  { type: "at_position", value: "Alice", position: 0 },
  { type: "same_house", a: "Alice", b: "Red" },
  { type: "same_house", a: "Alice", b: "Tea" },
  { type: "next_to", a: "Bob", b: "Alice" },
  { type: "same_house", a: "Dave", b: "Yellow" },
  { type: "left_of", a: "Blue", b: "Green" },
  { type: "same_house", a: "Carol", b: "Fish" },
  { type: "at_position", value: "Milk", position: 2 },
  { type: "same_house", a: "Dog", b: "Coffee" },
  { type: "left_of", a: "Dog", b: "Fish" },
  { type: "not_same_house", a: "Alice", b: "Bird" },
];

describe("solve 4x4", () => {
  it("solves a 4x4 puzzle with known solution", () => {
    const solution = solve(puzzle4x4, grid4x4);
    expect(solution).not.toBeNull();

    const [names, colors, pets, drinks] = solution!;
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
    // Remove last constraint — Blue/Dog link breaks, multiple solutions
    const weakened = puzzle3x3.slice(0, -1);
    expect(hasUniqueSolution(weakened, grid3x3)).toBe(false);
  });

  it("returns false with no constraints", () => {
    expect(hasUniqueSolution([], grid3x3)).toBe(false);
  });
});
