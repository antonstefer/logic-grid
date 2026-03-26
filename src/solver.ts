import { Constraint, Grid, Solution, Assignment } from "./types";
import {
  createContext,
  encodeBase,
  encodeConstraint,
  encodePuzzle,
  EncodingContext,
} from "./encoding";
import { solveSAT, solveAllSAT, isUnique } from "./sat";

export function solve(constraints: Constraint[], grid: Grid): Solution | null {
  const ctx = createContext(grid);
  const clauses = encodePuzzle(ctx, constraints);
  const result = solveSAT(clauses);

  if (!result.satisfiable) return null;
  return decodeSolution(ctx, result.assignment);
}

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
  allVars: Set<number>;
}

export function createSolverContext(grid: Grid): SolverContext {
  const ctx = createContext(grid);
  const baseClauses = encodeBase(ctx);

  // Collect all variables from base clauses
  const allVars = new Set<number>();
  for (const clause of baseClauses) {
    for (const lit of clause) allVars.add(Math.abs(lit));
  }

  return { ctx, baseClauses, allVars };
}

export function hasUniqueSolutionFast(
  constraints: Constraint[],
  solverCtx: SolverContext,
): boolean {
  const clauses = buildClauses(constraints, solverCtx);
  return isUnique(clauses, solverCtx.allVars);
}

/** Pre-encode a constraint's clauses for reuse. */
export function encodeConstraintCached(
  constraint: Constraint,
  solverCtx: SolverContext,
): number[][] {
  return encodeConstraint(solverCtx.ctx, constraint);
}

function buildClauses(
  constraints: Constraint[],
  solverCtx: SolverContext,
): number[][] {
  const clauses = [...solverCtx.baseClauses];
  for (const c of constraints) {
    const encoded = encodeConstraint(solverCtx.ctx, c);
    for (const clause of encoded) clauses.push(clause);
  }
  return clauses;
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
