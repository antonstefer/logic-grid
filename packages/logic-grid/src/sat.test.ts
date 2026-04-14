import { describe, it, expect } from "vitest";
import { solveSAT, solveAllSAT, IncrementalSolver } from "./sat";

function verifySolution(
  clauses: number[][],
  assignment: Map<number, boolean>,
): boolean {
  for (const clause of clauses) {
    const satisfied = clause.some((lit) => {
      const variable = Math.abs(lit);
      const value = assignment.get(variable);
      return value !== undefined && (lit > 0 ? value : !value);
    });
    if (!satisfied) return false;
  }
  return true;
}

describe("solveSAT", () => {
  it("satisfies empty formula", () => {
    const result = solveSAT([]);
    expect(result.satisfiable).toBe(true);
  });

  it("satisfies single unit clause", () => {
    const result = solveSAT([[1]]);
    expect(result.satisfiable).toBe(true);
    if (result.satisfiable) {
      expect(result.assignment.get(1)).toBe(true);
    }
  });

  it("satisfies negative unit clause", () => {
    const result = solveSAT([[-1]]);
    expect(result.satisfiable).toBe(true);
    if (result.satisfiable) {
      expect(result.assignment.get(1)).toBe(false);
    }
  });

  it("detects contradiction", () => {
    const result = solveSAT([[1], [-1]]);
    expect(result.satisfiable).toBe(false);
  });

  it("solves simple satisfiable formula", () => {
    // (1 OR 2) AND (NOT 1 OR 3) AND (2 OR NOT 3)
    const clauses = [
      [1, 2],
      [-1, 3],
      [2, -3],
    ];
    const result = solveSAT(clauses);
    expect(result.satisfiable).toBe(true);
    if (result.satisfiable) {
      expect(verifySolution(clauses, result.assignment)).toBe(true);
    }
  });

  it("detects pigeonhole UNSAT (3 pigeons, 2 holes)", () => {
    // 3 pigeons must each be in one of 2 holes, but no two pigeons in same hole
    // Variables: p(i,j) = pigeon i in hole j
    // p(1,1)=1 p(1,2)=2 p(2,1)=3 p(2,2)=4 p(3,1)=5 p(3,2)=6
    const clauses: number[][] = [
      // Each pigeon in at least one hole
      [1, 2], // pigeon 1
      [3, 4], // pigeon 2
      [5, 6], // pigeon 3
      // No two pigeons in same hole
      [-1, -3], // hole 1: not pigeon 1 and 2
      [-1, -5], // hole 1: not pigeon 1 and 3
      [-3, -5], // hole 1: not pigeon 2 and 3
      [-2, -4], // hole 2: not pigeon 1 and 2
      [-2, -6], // hole 2: not pigeon 1 and 3
      [-4, -6], // hole 2: not pigeon 2 and 3
    ];
    const result = solveSAT(clauses);
    expect(result.satisfiable).toBe(false);
  });

  it("solves a larger satisfiable formula", () => {
    // Encode: exactly one of {1,2,3} is true
    const clauses: number[][] = [
      [1, 2, 3], // at least one
      [-1, -2], // not both 1 and 2
      [-1, -3], // not both 1 and 3
      [-2, -3], // not both 2 and 3
    ];
    const result = solveSAT(clauses);
    expect(result.satisfiable).toBe(true);
    if (result.satisfiable) {
      expect(verifySolution(clauses, result.assignment)).toBe(true);
      // Exactly one should be true
      const trueCount = [1, 2, 3].filter((v) =>
        result.assignment.get(v),
      ).length;
      expect(trueCount).toBe(1);
    }
  });

  it("handles formula with many variables", () => {
    // Chain implications: 1 -> 2 -> 3 -> 4 -> 5, and 1 must be true
    const clauses: number[][] = [[1], [-1, 2], [-2, 3], [-3, 4], [-4, 5]];
    const result = solveSAT(clauses);
    expect(result.satisfiable).toBe(true);
    if (result.satisfiable) {
      for (let i = 1; i <= 5; i++) {
        expect(result.assignment.get(i)).toBe(true);
      }
    }
  });

  it("detects empty clause as UNSAT", () => {
    const result = solveSAT([[]]);
    expect(result.satisfiable).toBe(false);
  });
});

describe("IncrementalSolver", () => {
  it("returns false when assumption contradicts fixed assignment", () => {
    // Clauses: x1 must be true, x2 free
    const solver = new IncrementalSolver([[1], [2, -2]]);
    expect(solver.init()).toBe(true);
    // Assume x1 is false — contradicts the unit clause
    expect(solver.isUniqueUnder([-1])).toBe(false);
  });

  it("init returns false for contradictory unit clauses", () => {
    const solver = new IncrementalSolver([[1], [-1]]);
    expect(solver.init()).toBe(false);
  });

  it("init succeeds with duplicate unit clauses", () => {
    const solver = new IncrementalSolver([[1], [1], [2, -2]]);
    expect(solver.init()).toBe(true);
  });

  it("skips assumption when variable already has same value", () => {
    // x1 must be true (unit clause forces it). Exactly one of x2,x3 is true.
    const solver = new IncrementalSolver([[1], [2, 3], [-2, -3]]);
    expect(solver.init()).toBe(true);
    // Assume x1=true (already forced — hits the continue branch) and x2=true
    expect(solver.isUniqueUnder([1, 2])).toBe(true);
  });

  it("init returns false for contradictory base clauses", () => {
    const solver = new IncrementalSolver([[1], [-1]]);
    expect(solver.init()).toBe(false);
  });

  it("returns false when propagation fails after assumptions", () => {
    // [[1,2],[1,-2]]: assuming x1=false forces x2=true (from [1,2]) and x2=false (from [1,-2])
    const solver = new IncrementalSolver([
      [1, 2],
      [1, -2],
    ]);
    expect(solver.init()).toBe(true);
    expect(solver.isUniqueUnder([-1])).toBe(false);
  });
});

describe("solveAllSAT", () => {
  it("finds all solutions up to limit", () => {
    // x1 can be true or false, no constraints
    const solutions = solveAllSAT([[1, -1]], 10);
    // The tautology [1, -1] is always satisfied, but the solver
    // needs some variable to assign. There should be 2 solutions.
    expect(solutions.length).toBe(2);
  });

  it("returns single solution when unique", () => {
    const clauses = [[1], [2], [3]];
    const solutions = solveAllSAT(clauses, 2);
    expect(solutions.length).toBe(1);
    expect(solutions[0].get(1)).toBe(true);
    expect(solutions[0].get(2)).toBe(true);
    expect(solutions[0].get(3)).toBe(true);
  });

  it("returns empty for UNSAT", () => {
    const solutions = solveAllSAT([[1], [-1]], 2);
    expect(solutions.length).toBe(0);
  });

  it("finds exactly 3 solutions for exactly-one-of-3", () => {
    const clauses: number[][] = [
      [1, 2, 3],
      [-1, -2],
      [-1, -3],
      [-2, -3],
    ];
    const solutions = solveAllSAT(clauses, 10);
    expect(solutions.length).toBe(3);
    for (const sol of solutions) {
      expect(verifySolution(clauses, sol)).toBe(true);
    }
  });

  it("respects limit", () => {
    const clauses: number[][] = [
      [1, 2, 3],
      [-1, -2],
      [-1, -3],
      [-2, -3],
    ];
    const solutions = solveAllSAT(clauses, 2);
    expect(solutions.length).toBe(2);
  });
});
