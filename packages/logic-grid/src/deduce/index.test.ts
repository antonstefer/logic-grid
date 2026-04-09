import { describe, it, expect } from "vitest";
import { deduce } from ".";
import { generate } from "../generator";
import { makeGrid } from "../test-helpers";
import type { Constraint } from "../types";

describe("error handling", () => {
  it("throws when a constraint references an unknown value", () => {
    const g = makeGrid({
      size: 3,
      categories: [{ name: "Color", values: ["Red", "Blue", "Green"] }],
    });
    expect(() =>
      deduce([{ type: "same_position", a: "Red", b: "Purple" }], g),
    ).toThrow("Unknown value: Purple");
  });
});

describe("edge cases", () => {
  it("returns no steps and incomplete for empty constraints", () => {
    const g = makeGrid({
      size: 3,
      categories: [
        { name: "Color", values: ["Red", "Blue", "Green"] },
        { name: "Pet", values: ["Cat", "Dog", "Fish"] },
      ],
    });
    const result = deduce([], g);
    expect(result.steps).toEqual([]);
    expect(result.complete).toBe(false);
  });
});

// Same 3x3 puzzle from solver.test.ts — known solvable by deduction
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
