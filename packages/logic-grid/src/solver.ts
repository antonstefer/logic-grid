import type { Constraint, Grid, Solution, Assignment } from "./types";
import type { EncodingContext } from "./encoding";
import {
  createContext,
  encodeBase,
  encodeConstraint,
  encodePuzzle,
} from "./encoding";
import { solveSAT, solveAllSAT } from "./sat";

/** Solve a puzzle. Returns the solution, or `null` if the constraints are unsatisfiable. */
export function solve(constraints: Constraint[], grid: Grid): Solution | null {
  const ctx = createContext(grid);
  const clauses = encodePuzzle(ctx, constraints);
  const result = solveSAT(clauses);

  if (!result.satisfiable) return null;
  return decodeSolution(ctx, result.assignment);
}

/** Check whether a constraint set produces exactly one solution. */
export function hasUniqueSolution(
  constraints: Constraint[],
  grid: Grid,
): boolean {
  const ctx = createContext(grid);
  const clauses = encodePuzzle(ctx, constraints);
  const solutions = solveAllSAT(clauses, 2);
  return solutions.length === 1;
}

export interface SolverContext {
  ctx: EncodingContext;
  baseClauses: number[][];
}

/** Pre-compute base clauses for a grid. Reuse across multiple solve/uniqueness calls on the same grid. */
export function createSolverContext(grid: Grid): SolverContext {
  const ctx = createContext(grid);
  const baseClauses = encodeBase(ctx);
  return { ctx, baseClauses };
}

/** Pre-encode a constraint's clauses for reuse. */
export function encodeConstraintCached(
  constraint: Constraint,
  solverCtx: SolverContext,
): number[][] {
  return encodeConstraint(solverCtx.ctx, constraint);
}

function decodeSolution(
  ctx: EncodingContext,
  assignment: Map<number, boolean>,
): Solution {
  const solution: Solution = [];

  for (const cat of ctx.grid.categories) {
    const catAssignment: Assignment = {};
    for (const val of cat.values) {
      const vi = ctx.valueIndex.get(val)!;
      for (let p = 0; p < ctx.numPositions; p++) {
        const varIdx = vi * ctx.numPositions + p + 1;
        if (assignment.get(varIdx)) {
          catAssignment[val] = p;
          break;
        }
      }
    }
    solution.push(catAssignment);
  }

  return solution;
}
