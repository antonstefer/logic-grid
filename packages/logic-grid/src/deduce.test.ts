import { describe, it, expect } from "vitest";
import { deduce, hint } from "./deduce";
import { generate } from "./generator";
import type { Grid, Constraint } from "./types";

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
    // All 9 values should be assigned
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
    // Generate a hard puzzle — may or may not be fully solvable by deduction
    const puzzle = generate({ size: 5, seed: 7, difficulty: "hard" });
    const result = deduce(puzzle.constraints, puzzle.grid);
    // Should at least produce some steps
    expect(result.steps.length).toBeGreaterThan(0);
    // complete may be true or false — hard puzzles are unpredictable
  });
});

describe("deduce constraint types", () => {
  const grid: Grid = {
    size: 4,
    categories: [
      { name: "Name", values: ["Alice", "Bob", "Carol", "Dave"] },
      { name: "Color", values: ["Red", "Blue", "Green", "Yellow"] },
    ],
  };

  it("not_same_house eliminates when one value is pinned", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "not_same_house", a: "Red", b: "Alice" },
    ];
    const result = deduce(constraints, grid);
    const nsStep = result.steps.find((s) => s.technique === "not_same_house");
    expect(nsStep).toBeDefined();
    expect(nsStep!.eliminations).toContainEqual({
      value: "Alice",
      position: 0,
    });
  });

  it("next_to constrains to adjacent positions", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "next_to", a: "Red", b: "Alice" },
    ];
    const result = deduce(constraints, grid);
    const ntStep = result.steps.find((s) => s.technique === "next_to");
    expect(ntStep).toBeDefined();
    // Alice can only be at position 1 (adjacent to 0)
    expect(ntStep!.eliminations.filter((e) => e.value === "Alice").length).toBe(
      3,
    ); // eliminates positions 0, 2, and 3
  });

  it("not_next_to eliminates adjacent positions", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 1 },
      { type: "not_next_to", a: "Red", b: "Alice" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "not_next_to");
    expect(step).toBeDefined();
    expect(step!.eliminations).toContainEqual({
      value: "Alice",
      position: 0,
    });
    expect(step!.eliminations).toContainEqual({
      value: "Alice",
      position: 2,
    });
  });

  it("left_of pins b to a+1", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 1 },
      { type: "left_of", a: "Red", b: "Alice" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "left_of");
    expect(step).toBeDefined();
    expect(step!.assignments).toContainEqual({
      value: "Alice",
      position: 2,
    });
  });

  it("before eliminates positions", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 2 },
      { type: "before", a: "Red", b: "Alice" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "before");
    expect(step).toBeDefined();
    // Alice must be at position 3 (right of position 2)
    expect(step!.assignments).toContainEqual({
      value: "Alice",
      position: 3,
    });
  });

  it("exact_distance constrains positions", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "exact_distance", a: "Red", b: "Alice", distance: 2 },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "exact_distance");
    expect(step).toBeDefined();
    expect(step!.assignments).toContainEqual({
      value: "Alice",
      position: 2,
    });
  });

  it("between constrains middle position", () => {
    const grid3: Grid = {
      size: 5,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol", "Dave", "Eve"] },
        { name: "Color", values: ["Red", "Blue", "Green", "Yellow", "White"] },
      ],
    };
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "at_position", value: "Blue", position: 4 },
      { type: "between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid3);
    const step = result.steps.find((s) => s.technique === "between");
    expect(step).toBeDefined();
    // Alice must be at positions 1, 2, or 3 (between 0 and 4)
    expect(
      step!.eliminations.filter((e) => e.value === "Alice"),
    ).toContainEqual({ value: "Alice", position: 0 });
    expect(
      step!.eliminations.filter((e) => e.value === "Alice"),
    ).toContainEqual({ value: "Alice", position: 4 });
  });

  it("not_between eliminates middle positions", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "at_position", value: "Blue", position: 3 },
      { type: "not_between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "not_between");
    expect(step).toBeDefined();
    expect(step!.eliminations).toContainEqual({ value: "Alice", position: 1 });
    expect(step!.eliminations).toContainEqual({ value: "Alice", position: 2 });
  });

  it("elimination (not_at_position) removes position and assigns when only one left", () => {
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Alice", position: 0 },
      { type: "not_at_position", value: "Alice", position: 1 },
      { type: "not_at_position", value: "Alice", position: 2 },
    ];
    const result = deduce(constraints, grid);
    const elims = result.steps.filter((s) => s.technique === "elimination");
    expect(elims.length).toBeGreaterThan(0);
    // After three eliminations Alice must be at position 3
    const assigns = result.steps.flatMap((s) => s.assignments);
    expect(assigns).toContainEqual({ value: "Alice", position: 3 });
  });

  it("between arc-consistency: middle cannot be at boundary positions", () => {
    // Outers are both restricted to middle positions (1–2), so middle
    // can't be at 0 or 3 (nothing can be outside it on both sides).
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Red", position: 0 },
      { type: "not_at_position", value: "Red", position: 3 },
      { type: "not_at_position", value: "Blue", position: 0 },
      { type: "not_at_position", value: "Blue", position: 3 },
      { type: "between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    // Alice can't be at 0 or 3 — no outer can be on both sides of a boundary
    expect(allElims).toContainEqual({ value: "Alice", position: 0 });
    expect(allElims).toContainEqual({ value: "Alice", position: 3 });
  });

  it("between: pinned middle + pinned outer constrains the other outer to opposite side", () => {
    // middle=Alice at 2, outer1=Red at 0 → outer2=Blue must be > 2
    const constraints: Constraint[] = [
      { type: "at_position", value: "Alice", position: 2 },
      { type: "at_position", value: "Red", position: 0 },
      { type: "between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    // Blue must be at position 3 (only position > 2), so 0, 1, 2 are eliminated
    expect(allElims).toContainEqual({ value: "Blue", position: 0 });
    expect(allElims).toContainEqual({ value: "Blue", position: 1 });
    expect(allElims).toContainEqual({ value: "Blue", position: 2 });
    const allAssigns = result.steps.flatMap((s) => s.assignments);
    expect(allAssigns).toContainEqual({ value: "Blue", position: 3 });
  });

  it("naked_pair eliminates positions from other values in category", () => {
    // Red and Blue can only be at {0, 1} — no other Color can be there
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Red", position: 2 },
      { type: "not_at_position", value: "Red", position: 3 },
      { type: "not_at_position", value: "Blue", position: 2 },
      { type: "not_at_position", value: "Blue", position: 3 },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "naked_pair");
    expect(step).toBeDefined();
    // Green and Yellow must be eliminated from positions 0 and 1
    const elims = step!.eliminations;
    expect(elims.some((e) => e.value === "Green" && e.position === 0)).toBe(
      true,
    );
    expect(elims.some((e) => e.value === "Yellow" && e.position === 1)).toBe(
      true,
    );
  });

  it("naked_triple eliminates positions from other values in category", () => {
    // Needs 5 values so hidden_single doesn't fire first (positions 3 and 4 each
    // have 2 candidates, so no single forces them — naked_triple fires instead)
    const grid5: Grid = {
      size: 5,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol", "Dave", "Eve"] },
        { name: "Color", values: ["Red", "Blue", "Green", "Yellow", "White"] },
      ],
    };
    // Red, Blue, Green restricted to {0,1,2}; Yellow and White still have all 5
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Red", position: 3 },
      { type: "not_at_position", value: "Red", position: 4 },
      { type: "not_at_position", value: "Blue", position: 3 },
      { type: "not_at_position", value: "Blue", position: 4 },
      { type: "not_at_position", value: "Green", position: 3 },
      { type: "not_at_position", value: "Green", position: 4 },
    ];
    const result = deduce(constraints, grid5);
    const step = result.steps.find((s) => s.technique === "naked_triple");
    expect(step).toBeDefined();
    const elims = step!.eliminations;
    // Yellow and White must be eliminated from {0, 1, 2}
    expect(elims.some((e) => e.value === "Yellow" && e.position <= 2)).toBe(
      true,
    );
    expect(elims.some((e) => e.value === "White" && e.position <= 2)).toBe(
      true,
    );
  });

  it("hidden_pair restricts the two values exclusively reachable at two positions", () => {
    // With 6 values in the category, Red={0,1,2} and Blue={0,1,3} are the ONLY colors
    // that can be at positions 0 or 1 (all others excluded). Hidden pair fires and
    // restricts Red to {0,1} and Blue to {0,1}.
    const grid6: Grid = {
      size: 6,
      categories: [
        {
          name: "Name",
          values: ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank"],
        },
        {
          name: "Color",
          values: ["Red", "Blue", "Green", "Yellow", "White", "Black"],
        },
      ],
    };
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Red", position: 3 },
      { type: "not_at_position", value: "Red", position: 4 },
      { type: "not_at_position", value: "Red", position: 5 },
      { type: "not_at_position", value: "Blue", position: 2 },
      { type: "not_at_position", value: "Blue", position: 4 },
      { type: "not_at_position", value: "Blue", position: 5 },
      { type: "not_at_position", value: "Green", position: 0 },
      { type: "not_at_position", value: "Green", position: 1 },
      { type: "not_at_position", value: "Yellow", position: 0 },
      { type: "not_at_position", value: "Yellow", position: 1 },
      { type: "not_at_position", value: "White", position: 0 },
      { type: "not_at_position", value: "White", position: 1 },
      { type: "not_at_position", value: "Black", position: 0 },
      { type: "not_at_position", value: "Black", position: 1 },
    ];
    const result = deduce(constraints, grid6);
    const step = result.steps.find((s) => s.technique === "hidden_pair");
    expect(step).toBeDefined();
    // Red (was {0,1,2}) loses position 2; Blue (was {0,1,3}) loses position 3
    expect(step!.eliminations).toContainEqual({ value: "Red", position: 2 });
    expect(step!.eliminations).toContainEqual({ value: "Blue", position: 3 });
  });

  it("same_house_chain: A linked to M linked to B forces A and B to share positions", () => {
    // same_house(A=Red, M=Alice) and same_house(M=Alice, B=Blue)
    // → Red and Blue must be at the same position
    // Add a constraint to make Red's position known so Blue gets pinned too
    const constraints: Constraint[] = [
      { type: "same_house", a: "Red", b: "Alice" },
      { type: "same_house", a: "Alice", b: "Blue" },
      { type: "at_position", value: "Red", position: 0 },
    ];
    const result = deduce(constraints, grid);
    const allAssigns = result.steps.flatMap((s) => s.assignments);
    // Blue must be co-located with Red (position 0) via the chain
    expect(allAssigns).toContainEqual({ value: "Blue", position: 0 });
  });

  it("contradiction: rules out positions that would lead to an impossible state", () => {
    // Use a hard seeded puzzle known to require contradiction to solve
    const puzzle = generate({
      size: 4,
      categories: 4,
      difficulty: "hard",
      seed: 2,
    });
    const result = deduce(puzzle.constraints, puzzle.grid);
    expect(result.complete).toBe(true);
    expect(result.steps.some((s) => s.technique === "contradiction")).toBe(
      true,
    );
  });
});

describe("hint", () => {
  it("returns first deduction with no known values", () => {
    const h = hint(puzzle3x3, grid3x3);
    expect(h).not.toBeNull();
    expect(h!.technique).toBe("direct");
  });

  it("skips past known assignments", () => {
    // Red=0 and Cat=0 are early deductions; hint should give something new
    const h = hint(puzzle3x3, grid3x3, { Red: 0, Cat: 0 });
    expect(h).not.toBeNull();
    // Should not re-suggest Red or Cat assignments
    for (const a of h!.assignments) {
      expect(a.value).not.toBe("Red");
      expect(a.value).not.toBe("Cat");
    }
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
