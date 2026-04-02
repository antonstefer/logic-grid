import { describe, it, expect } from "vitest";
import { createContext, variable, encodeBase, encodePuzzle } from "./encoding";
import { solveSAT, solveAllSAT } from "./sat";
import type { Grid, Constraint } from "./types";

const grid3x3: Grid = {
  size: 3,
  categories: [
    { name: "Color", values: ["Red", "Blue", "Green"] },
    { name: "Pet", values: ["Cat", "Dog", "Fish"] },
    { name: "Drink", values: ["Tea", "Coffee", "Water"] },
  ],
};

function decodeSolution(
  ctx: ReturnType<typeof createContext>,
  assignment: Map<number, boolean>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [value, vi] of ctx.valueIndex) {
    for (let p = 0; p < ctx.numPositions; p++) {
      const v = vi * ctx.numPositions + p + 1;
      if (assignment.get(v)) {
        result[value] = p;
      }
    }
  }
  return result;
}

describe("createContext", () => {
  it("assigns unique indices to all values", () => {
    const ctx = createContext(grid3x3);
    expect(ctx.valueIndex.size).toBe(9);
    const indices = new Set(ctx.valueIndex.values());
    expect(indices.size).toBe(9);
  });

  it("records correct dimensions", () => {
    const ctx = createContext(grid3x3);
    expect(ctx.numPositions).toBe(3);
    expect(ctx.numValues).toBe(9);
  });
});

describe("variable", () => {
  it("returns unique positive integers", () => {
    const ctx = createContext(grid3x3);
    const vars = new Set<number>();
    for (const [val] of ctx.valueIndex) {
      for (let p = 0; p < 3; p++) {
        const v = variable(ctx, val, p);
        expect(v).toBeGreaterThan(0);
        vars.add(v);
      }
    }
    expect(vars.size).toBe(27); // 9 values * 3 positions
  });

  it("throws for unknown value", () => {
    const ctx = createContext(grid3x3);
    expect(() => variable(ctx, "Unknown", 0)).toThrow();
  });
});

describe("encodeBase", () => {
  it("produces solvable base clauses", () => {
    const ctx = createContext(grid3x3);
    const clauses = encodeBase(ctx);
    const result = solveSAT(clauses);
    expect(result.satisfiable).toBe(true);
  });

  it("base clauses have multiple solutions (no puzzle constraints)", () => {
    const ctx = createContext(grid3x3);
    const clauses = encodeBase(ctx);
    const solutions = solveAllSAT(clauses, 2);
    expect(solutions.length).toBe(2);
  });

  it("each solution assigns each value to exactly one position", () => {
    const ctx = createContext(grid3x3);
    const clauses = encodeBase(ctx);
    const result = solveSAT(clauses);
    expect(result.satisfiable).toBe(true);
    if (!result.satisfiable) return;

    const sol = decodeSolution(ctx, result.assignment);
    // Each value should appear exactly once
    for (const cat of grid3x3.categories) {
      const positions = cat.values.map((v) => sol[v]);
      expect(new Set(positions).size).toBe(3);
      for (const p of positions) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(3);
      }
    }
  });
});

describe("encodeConstraint", () => {
  it("same_position forces two values to same position", () => {
    const ctx = createContext(grid3x3);
    const clauses = encodePuzzle(ctx, [
      { type: "same_position", a: "Red", b: "Cat" },
    ]);
    const solutions = solveAllSAT(clauses, 100);
    for (const sol of solutions) {
      const decoded = decodeSolution(ctx, sol);
      expect(decoded["Red"]).toBe(decoded["Cat"]);
    }
  });

  it("not_same_position prevents two values at same position", () => {
    const ctx = createContext(grid3x3);
    const clauses = encodePuzzle(ctx, [
      { type: "not_same_position", a: "Red", b: "Cat" },
    ]);
    const solutions = solveAllSAT(clauses, 100);
    for (const sol of solutions) {
      const decoded = decodeSolution(ctx, sol);
      expect(decoded["Red"]).not.toBe(decoded["Cat"]);
    }
  });

  it("at_position pins a value", () => {
    const ctx = createContext(grid3x3);
    const clauses = encodePuzzle(ctx, [
      { type: "at_position", value: "Red", position: 1 },
    ]);
    const solutions = solveAllSAT(clauses, 100);
    for (const sol of solutions) {
      const decoded = decodeSolution(ctx, sol);
      expect(decoded["Red"]).toBe(1);
    }
  });

  it("not_at_position excludes a value from a position", () => {
    const ctx = createContext(grid3x3);
    const clauses = encodePuzzle(ctx, [
      { type: "not_at_position", value: "Red", position: 0 },
    ]);
    const solutions = solveAllSAT(clauses, 100);
    for (const sol of solutions) {
      const decoded = decodeSolution(ctx, sol);
      expect(decoded["Red"]).not.toBe(0);
    }
  });

  it("next_to forces adjacency", () => {
    const ctx = createContext(grid3x3);
    const clauses = encodePuzzle(ctx, [
      { type: "next_to", a: "Red", b: "Cat" },
    ]);
    const solutions = solveAllSAT(clauses, 100);
    expect(solutions.length).toBeGreaterThan(0);
    for (const sol of solutions) {
      const decoded = decodeSolution(ctx, sol);
      expect(Math.abs(decoded["Red"] - decoded["Cat"])).toBe(1);
    }
  });

  it("not_next_to prevents adjacency", () => {
    const ctx = createContext(grid3x3);
    const clauses = encodePuzzle(ctx, [
      { type: "not_next_to", a: "Red", b: "Cat" },
    ]);
    const solutions = solveAllSAT(clauses, 100);
    for (const sol of solutions) {
      const decoded = decodeSolution(ctx, sol);
      expect(Math.abs(decoded["Red"] - decoded["Cat"])).not.toBe(1);
    }
  });

  it("left_of places a immediately left of b", () => {
    const ctx = createContext(grid3x3);
    const clauses = encodePuzzle(ctx, [
      { type: "left_of", a: "Red", b: "Cat" },
    ]);
    const solutions = solveAllSAT(clauses, 100);
    expect(solutions.length).toBeGreaterThan(0);
    for (const sol of solutions) {
      const decoded = decodeSolution(ctx, sol);
      expect(decoded["Cat"] - decoded["Red"]).toBe(1);
    }
  });

  it("between forces middle between outers", () => {
    const ctx = createContext(grid3x3);
    const clauses = encodePuzzle(ctx, [
      { type: "between", outer1: "Red", middle: "Cat", outer2: "Blue" },
    ]);
    const solutions = solveAllSAT(clauses, 100);
    expect(solutions.length).toBeGreaterThan(0);
    for (const sol of solutions) {
      const decoded = decodeSolution(ctx, sol);
      const lo = Math.min(decoded["Red"], decoded["Blue"]);
      const hi = Math.max(decoded["Red"], decoded["Blue"]);
      expect(decoded["Cat"]).toBeGreaterThan(lo);
      expect(decoded["Cat"]).toBeLessThan(hi);
    }
  });

  it("not_between forbids middle between outers", () => {
    const ctx = createContext(grid3x3);
    const clauses = encodePuzzle(ctx, [
      { type: "not_between", outer1: "Red", middle: "Cat", outer2: "Blue" },
    ]);
    const solutions = solveAllSAT(clauses, 100);
    for (const sol of solutions) {
      const decoded = decodeSolution(ctx, sol);
      const lo = Math.min(decoded["Red"], decoded["Blue"]);
      const hi = Math.max(decoded["Red"], decoded["Blue"]);
      // Cat must NOT be strictly between Red and Blue
      const catBetween = decoded["Cat"] > lo && decoded["Cat"] < hi;
      expect(catBetween).toBe(false);
    }
  });

  it("before forces a to be left of b", () => {
    const ctx = createContext(grid3x3);
    const clauses = encodePuzzle(ctx, [{ type: "before", a: "Red", b: "Cat" }]);
    const solutions = solveAllSAT(clauses, 100);
    expect(solutions.length).toBeGreaterThan(0);
    for (const sol of solutions) {
      const decoded = decodeSolution(ctx, sol);
      expect(decoded["Red"]).toBeLessThan(decoded["Cat"]);
    }
  });

  it("exact_distance forces exact position difference", () => {
    const ctx = createContext(grid3x3);
    const clauses = encodePuzzle(ctx, [
      { type: "exact_distance", a: "Red", b: "Cat", distance: 2 },
    ]);
    const solutions = solveAllSAT(clauses, 100);
    expect(solutions.length).toBeGreaterThan(0);
    for (const sol of solutions) {
      const decoded = decodeSolution(ctx, sol);
      expect(Math.abs(decoded["Red"] - decoded["Cat"])).toBe(2);
    }
  });

  it("exact_distance with numericValues uses value distance", () => {
    const numGrid: Grid = {
      size: 3,
      categories: [
        { name: "Color", values: ["Red", "Blue", "Green"] },
        {
          name: "Year",
          values: ["1980", "1990", "2005"],
          noun: "car",
          isPosition: true,
          numericValues: [1980, 1990, 2005],
        },
      ],
    };
    const ctx = createContext(numGrid);
    // distance=10 means |numericValues[p1]-numericValues[p2]|=10, i.e. positions 0,1
    const clauses = encodePuzzle(ctx, [
      { type: "exact_distance", a: "Red", b: "Blue", distance: 10 },
    ]);
    const solutions = solveAllSAT(clauses, 100);
    expect(solutions.length).toBeGreaterThan(0);
    for (const sol of solutions) {
      const decoded = decodeSolution(ctx, sol);
      const p1 = decoded["Red"];
      const p2 = decoded["Blue"];
      expect(
        Math.abs(
          numGrid.categories[1].numericValues![p1] -
            numGrid.categories[1].numericValues![p2],
        ),
      ).toBe(10);
    }
  });

  it("combined constraints produce unique solution", () => {
    // Pin everything for a 3x3
    const ctx = createContext(grid3x3);
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "at_position", value: "Blue", position: 1 },
      { type: "at_position", value: "Green", position: 2 },
      { type: "same_position", a: "Red", b: "Cat" },
      { type: "same_position", a: "Blue", b: "Dog" },
      { type: "same_position", a: "Red", b: "Tea" },
      { type: "same_position", a: "Blue", b: "Coffee" },
    ];
    const clauses = encodePuzzle(ctx, constraints);
    const solutions = solveAllSAT(clauses, 2);
    expect(solutions.length).toBe(1);

    const decoded = decodeSolution(ctx, solutions[0]);
    expect(decoded["Red"]).toBe(0);
    expect(decoded["Cat"]).toBe(0);
    expect(decoded["Tea"]).toBe(0);
    expect(decoded["Blue"]).toBe(1);
    expect(decoded["Dog"]).toBe(1);
    expect(decoded["Coffee"]).toBe(1);
    expect(decoded["Green"]).toBe(2);
    expect(decoded["Fish"]).toBe(2);
    expect(decoded["Water"]).toBe(2);
  });
});
