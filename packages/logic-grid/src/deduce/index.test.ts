import { describe, it, expect } from "vitest";
import { deduce, hint } from ".";
import { generate } from "../generator";
import type { Grid, Constraint } from "../types";

describe("error handling", () => {
  it("throws when a constraint references an unknown value", () => {
    const g: Grid = {
      size: 3,
      categories: [{ name: "Color", values: ["Red", "Blue", "Green"] }],
    };
    expect(() =>
      deduce([{ type: "same_house", a: "Red", b: "Purple" }], g),
    ).toThrow("Unknown value: Purple");
  });
});

// Same 3x3 puzzle from solver.test.ts — known solvable by deduction
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

describe("deduce", () => {
  it("fully solves a 3x3 puzzle by deduction", () => {
    const result = deduce(puzzle3x3, grid3x3);
    expect(result.complete).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it("every step has a technique and explanation", () => {
    const result = deduce(puzzle3x3, grid3x3);
    for (const s of result.steps) {
      expect(s.technique).toBeTruthy();
      expect(s.explanation).toBeTruthy();
      expect(s.eliminations.length + s.assignments.length).toBeGreaterThan(0);
    }
  });

  it("steps collectively assign all values", () => {
    const result = deduce(puzzle3x3, grid3x3);
    const assigned = new Map<string, number>();
    for (const s of result.steps) {
      for (const a of s.assignments) {
        assigned.set(a.value, a.position);
      }
    }
    expect(assigned.size).toBe(9);
    expect(assigned.get("Red")).toBe(0);
    expect(assigned.get("Cat")).toBe(0);
    expect(assigned.get("Blue")).toBe(1);
    expect(assigned.get("Green")).toBe(2);
    expect(assigned.get("Dog")).toBe(1);
    expect(assigned.get("Fish")).toBe(2);
    expect(assigned.get("Tea")).toBe(0);
    expect(assigned.get("Coffee")).toBe(1);
    expect(assigned.get("Water")).toBe(2);
  });

  it("first step uses at_position (direct assignment)", () => {
    const result = deduce(puzzle3x3, grid3x3);
    expect(result.steps[0].technique).toBe("direct");
    expect(result.steps[0].clueIndices).toContain(0);
  });

  it("snapshots explanation strings", () => {
    const result = deduce(puzzle3x3, grid3x3);
    expect(result.steps.map((s) => s.explanation)).toMatchSnapshot();
  });

  it("solves generated easy puzzles completely", () => {
    const puzzle = generate({ size: 4, seed: 10, difficulty: "easy" });
    const result = deduce(puzzle.constraints, puzzle.grid);
    expect(result.complete).toBe(true);
  });

  it("returns partial results for hard puzzles if deduction stalls", () => {
    const puzzle = generate({ size: 5, seed: 7, difficulty: "hard" });
    const result = deduce(puzzle.constraints, puzzle.grid);
    expect(result.steps.length).toBeGreaterThan(0);
  });
});

describe("hint", () => {
  it("returns first deduction with no known values", () => {
    const h = hint(puzzle3x3, grid3x3);
    expect(h).not.toBeNull();
    expect(h!.technique).toBe("direct");
  });

  it("returns null when no steps can be made and no known values", () => {
    const g: Grid = {
      size: 3,
      categories: [{ name: "Color", values: ["Red", "Blue", "Green"] }],
    };
    expect(hint([], g)).toBeNull();
  });

  it("skips past known assignments", () => {
    const h = hint(puzzle3x3, grid3x3, { Red: 0, Cat: 0 });
    expect(h).not.toBeNull();
    for (const a of h!.assignments) {
      expect(a.value).not.toBe("Red");
      expect(a.value).not.toBe("Cat");
    }
  });

  it("returns elimination-only step for unknown value", () => {
    const g: Grid = {
      size: 4,
      categories: [
        { name: "Color", values: ["Red", "Blue", "Green", "Yellow"] },
      ],
    };
    // Red loses position 0 but still has {1,2,3} — no assignment, only elimination.
    // known has Blue but not Red, so the elimination step is "new" for the user.
    const h = hint(
      [{ type: "not_at_position", value: "Red", position: 0 }],
      g,
      { Blue: 1 },
    );
    expect(h).not.toBeNull();
    expect(h!.assignments).toHaveLength(0);
    expect(h!.eliminations).toContainEqual({ value: "Red", position: 0 });
  });

  it("returns null when puzzle is fully known", () => {
    const known: Record<string, number> = {
      Red: 0,
      Blue: 1,
      Green: 2,
      Cat: 0,
      Dog: 1,
      Fish: 2,
      Tea: 0,
      Coffee: 1,
      Water: 2,
    };
    const h = hint(puzzle3x3, grid3x3, known);
    expect(h).toBeNull();
  });
});
