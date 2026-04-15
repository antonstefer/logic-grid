import type { Category, Constraint, Grid } from "./types";
import { isPinnedAxis, pinnedAxis, resolveAxis } from "./axis";

/**
 * Predicate `isValid(rank_a, rank_b)` for a binary comparative.
 * exact_distance is not here because its predicate depends on `distance`
 * and optional numericValues — handled inline at the dispatch site.
 */
function binaryPredicate(
  type: "before" | "left_of" | "next_to" | "not_next_to",
): (i: number, j: number) => boolean {
  switch (type) {
    case "before":
      return (i, j) => i < j;
    case "left_of":
      return (i, j) => j === i + 1;
    case "next_to":
      return (i, j) => Math.abs(i - j) === 1;
    case "not_next_to":
      return (i, j) => Math.abs(i - j) !== 1;
  }
}

/**
 * Resolve rank `k` on `axis` for `value` to a SAT variable:
 * - Pinned axis: rank = position, return the position variable directly.
 * - Non-pinned axis: return the rank auxiliary variable (allocator handles
 *   channeling to position vars under the hood).
 */
function rankOrPos(
  ctx: EncodingContext,
  alloc: RankVarAllocator,
  axis: Category,
  value: string,
  rank: number,
): number {
  return isPinnedAxis(ctx.grid, axis)
    ? variable(ctx, value, rank)
    : alloc.rankVar(ctx, axis, value, rank);
}

/**
 * Encode a binary comparative constraint in implication form:
 *   For each rank i of a: [¬a@i, b@j₁, b@j₂, ...] where jₖ are valid b ranks.
 *   For each rank j of b: symmetric.
 *
 * On a pinned axis `rankOrPos` returns position vars, so this collapses to
 * the classic positional implication-chain form (e.g. for `next_to`:
 * "if a at p then b at p-1 or p+1"). On a non-pinned axis it emits the
 * same structure over rank vars, with channeling clauses added once per
 * (axis, value) pair by the allocator.
 *
 * Implication form produces tight, propagation-friendly clauses when valid
 * ranks per operand form a narrow set (next_to, left_of, exact_distance).
 * For constraints where the valid set is wide (not_next_to), the clauses
 * are longer but still O(M) per side — acceptable.
 */
function encodeBinaryAxis(
  ctx: EncodingContext,
  alloc: RankVarAllocator,
  a: string,
  b: string,
  axis: Category,
  isValid: (i: number, j: number) => boolean,
): number[][] {
  const M = axis.values.length;
  const clauses: number[][] = [];
  for (let i = 0; i < M; i++) {
    const clause: number[] = [-rankOrPos(ctx, alloc, axis, a, i)];
    for (let j = 0; j < M; j++) {
      if (isValid(i, j)) clause.push(rankOrPos(ctx, alloc, axis, b, j));
    }
    clauses.push(clause);
  }
  for (let j = 0; j < M; j++) {
    const clause: number[] = [-rankOrPos(ctx, alloc, axis, b, j)];
    for (let i = 0; i < M; i++) {
      if (isValid(i, j)) clause.push(rankOrPos(ctx, alloc, axis, a, i));
    }
    clauses.push(clause);
  }
  return clauses;
}

/**
 * Encode `between` in implication form:
 *   For each distinct rank pair (i, j) of the outers, emit
 *   [¬outer1@i, ¬outer2@j, middle@k₁, ..., middle@kₘ] where kₘ are the
 *   ranks strictly between lo=min(i,j) and hi=max(i,j).
 *
 * On pinned axis this is the classic positional between form; on non-pinned
 * the same structure over rank vars plus channeling.
 */
function encodeBetween(
  ctx: EncodingContext,
  alloc: RankVarAllocator,
  outer1: string,
  middle: string,
  outer2: string,
  axis: Category,
): number[][] {
  const M = axis.values.length;
  const clauses: number[][] = [];
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      if (i === j) continue;
      const lo = Math.min(i, j);
      const hi = Math.max(i, j);
      const clause: number[] = [
        -rankOrPos(ctx, alloc, axis, outer1, i),
        -rankOrPos(ctx, alloc, axis, outer2, j),
      ];
      for (let k = lo + 1; k < hi; k++) {
        clause.push(rankOrPos(ctx, alloc, axis, middle, k));
      }
      clauses.push(clause);
    }
  }
  return clauses;
}

/**
 * Encode `not_between` as bad-triples: for each middle rank k strictly
 * between outer1 rank p1 and outer2 rank p2 (in either order), emit
 * [¬middle@k, ¬outer1@p1, ¬outer2@p2].
 */
function encodeNotBetween(
  ctx: EncodingContext,
  alloc: RankVarAllocator,
  outer1: string,
  middle: string,
  outer2: string,
  axis: Category,
): number[][] {
  const M = axis.values.length;
  const clauses: number[][] = [];
  for (let k = 1; k < M - 1; k++) {
    for (let p1 = 0; p1 < k; p1++) {
      for (let p2 = k + 1; p2 < M; p2++) {
        clauses.push([
          -rankOrPos(ctx, alloc, axis, middle, k),
          -rankOrPos(ctx, alloc, axis, outer1, p1),
          -rankOrPos(ctx, alloc, axis, outer2, p2),
        ]);
        clauses.push([
          -rankOrPos(ctx, alloc, axis, middle, k),
          -rankOrPos(ctx, alloc, axis, outer1, p2),
          -rankOrPos(ctx, alloc, axis, outer2, p1),
        ]);
      }
    }
  }
  return clauses;
}

/** Holds grid metadata needed to map values/positions to SAT variables. */
export interface EncodingContext {
  grid: Grid;
  valueIndex: Map<string, number>;
  numPositions: number;
  numValues: number;
}

/** Build an encoding context for a grid, mapping values to sequential indices. */
export function createContext(grid: Grid): EncodingContext {
  const valueIndex = new Map<string, number>();
  let idx = 0;
  for (const cat of grid.categories) {
    for (const val of cat.values) {
      valueIndex.set(val, idx++);
    }
  }
  return {
    grid,
    valueIndex,
    numPositions: grid.size,
    numValues: idx,
  };
}

/**
 * Allocates rank auxiliary variables r(v,k) = "value v has rank k on axis".
 * These variables decouple rank from position, letting comparative constraints
 * use compact 2-3 literal clauses instead of the O(M²·n²)/O(M³·n³) rank-
 * forbidding clauses.
 *
 * Channeling clauses are emitted exactly once per (axis, value) pair. The
 * allocator caches variable IDs so constraints sharing an axis reuse them.
 */
export class RankVarAllocator {
  /** Next available variable ID, starting above position variables. */
  private nextVar: number;
  /** Cache: axis → value → base var index for that value's rank vars on that axis. */
  private readonly cache = new Map<Category, Map<string, number>>();
  /** Accumulated channeling clauses (forward + AMO + ALO). */
  readonly channeling: number[][] = [];

  constructor(ctx: EncodingContext) {
    this.nextVar = ctx.numValues * ctx.numPositions + 1;
  }

  /**
   * High-water mark: the first variable ID NOT used by this allocator.
   * Callers that add their own variables (e.g. activation literals) MUST
   * capture this AFTER all rank var allocations are complete. Allocating
   * more rank vars after a caller has captured varCeiling will silently
   * collide with the caller's variables.
   */
  get varCeiling(): number {
    return this.nextVar;
  }

  /**
   * Get or create the rank variable for (value, rank) on the given axis.
   * If this is the first request for this (axis, value) pair, allocates M
   * rank vars and emits channeling + AMO + ALO clauses.
   */
  rankVar(
    ctx: EncodingContext,
    axis: Category,
    value: string,
    rank: number,
  ): number {
    let axisCache = this.cache.get(axis);
    if (!axisCache) {
      axisCache = new Map();
      this.cache.set(axis, axisCache);
    }
    let base = axisCache.get(value);
    if (base === undefined) {
      base = this.nextVar;
      const M = axis.values.length;
      this.nextVar += M;
      axisCache.set(value, base);
      this.emitChanneling(ctx, axis, value, base, M);
    }
    return base + rank;
  }

  private emitChanneling(
    ctx: EncodingContext,
    axis: Category,
    value: string,
    base: number,
    M: number,
  ): void {
    const n = ctx.numPositions;
    // Forward: x(v,p) ∧ x(axis[k],p) → r(v,k)
    for (let k = 0; k < M; k++) {
      for (let p = 0; p < n; p++) {
        this.channeling.push([
          -variable(ctx, value, p),
          -variable(ctx, axis.values[k], p),
          base + k,
        ]);
      }
    }
    // AMO: at most one rank per value
    for (let k1 = 0; k1 < M; k1++) {
      for (let k2 = k1 + 1; k2 < M; k2++) {
        this.channeling.push([-(base + k1), -(base + k2)]);
      }
    }
    // ALO: at least one rank per value
    const alo: number[] = [];
    for (let k = 0; k < M; k++) alo.push(base + k);
    this.channeling.push(alo);
  }
}

/** SAT variable for "value v is at position p". 1-based. */
export function variable(
  ctx: EncodingContext,
  value: string,
  position: number,
): number {
  const vi = ctx.valueIndex.get(value);
  if (vi === undefined) throw new Error(`Unknown value: ${value}`);
  return vi * ctx.numPositions + position + 1;
}

/** Base ALO/AMO clauses ensuring valid assignments. */
export function encodeBase(ctx: EncodingContext): number[][] {
  const clauses: number[][] = [];
  const { grid, numPositions } = ctx;

  for (const cat of grid.categories) {
    for (const val of cat.values) {
      // ALO: value must be in at least one position
      const alo: number[] = [];
      for (let p = 0; p < numPositions; p++) {
        alo.push(variable(ctx, val, p));
      }
      clauses.push(alo);

      // AMO: value in at most one position
      for (let p1 = 0; p1 < numPositions; p1++) {
        for (let p2 = p1 + 1; p2 < numPositions; p2++) {
          clauses.push([-variable(ctx, val, p1), -variable(ctx, val, p2)]);
        }
      }
    }

    // Per position: exactly one value from this category
    for (let p = 0; p < numPositions; p++) {
      // ALO: at least one value at position p
      const alo: number[] = [];
      for (const val of cat.values) {
        alo.push(variable(ctx, val, p));
      }
      clauses.push(alo);

      // AMO: at most one value at position p
      for (let i = 0; i < cat.values.length; i++) {
        for (let j = i + 1; j < cat.values.length; j++) {
          clauses.push([
            -variable(ctx, cat.values[i], p),
            -variable(ctx, cat.values[j], p),
          ]);
        }
      }
    }
  }

  // Pin the first ordered axis to break the n!-fold position symmetry.
  // Without this, every puzzle would have n! equivalent solutions (one per
  // permutation of abstract position slots). This is the only axis that
  // gets pinned; all others use the general rank-var encoder.
  const axis = pinnedAxis(grid);
  if (!axis) throw new Error("Grid has no ordered category");
  for (let i = 0; i < axis.values.length; i++) {
    clauses.push([variable(ctx, axis.values[i], i)]);
  }

  return clauses;
}

/** Encode a single constraint as CNF clauses. */
export function encodeConstraint(
  ctx: EncodingContext,
  constraint: Constraint,
  alloc: RankVarAllocator,
): number[][] {
  const n = ctx.numPositions;

  switch (constraint.type) {
    case "same_position": {
      const { a, b } = constraint;
      const clauses: number[][] = [];
      for (let p = 0; p < n; p++) {
        clauses.push([-variable(ctx, a, p), variable(ctx, b, p)]);
        clauses.push([-variable(ctx, b, p), variable(ctx, a, p)]);
      }
      return clauses;
    }

    case "not_same_position": {
      const { a, b } = constraint;
      const clauses: number[][] = [];
      for (let p = 0; p < n; p++) {
        clauses.push([-variable(ctx, a, p), -variable(ctx, b, p)]);
      }
      return clauses;
    }

    case "next_to":
    case "not_next_to":
    case "left_of":
    case "before": {
      const axis = resolveAxis(ctx.grid, constraint.axis);
      const isValid = binaryPredicate(constraint.type);
      return encodeBinaryAxis(
        ctx,
        alloc,
        constraint.a,
        constraint.b,
        axis,
        isValid,
      );
    }

    case "exact_distance": {
      const axis = resolveAxis(ctx.grid, constraint.axis);
      const numVals = axis.numericValues;
      const d = constraint.distance;
      const isValid = numVals
        ? (i: number, j: number) => Math.abs(numVals[i] - numVals[j]) === d
        : (i: number, j: number) => Math.abs(i - j) === d;
      return encodeBinaryAxis(
        ctx,
        alloc,
        constraint.a,
        constraint.b,
        axis,
        isValid,
      );
    }

    case "between":
    case "not_between": {
      const axis = resolveAxis(ctx.grid, constraint.axis);
      return constraint.type === "between"
        ? encodeBetween(
            ctx,
            alloc,
            constraint.outer1,
            constraint.middle,
            constraint.outer2,
            axis,
          )
        : encodeNotBetween(
            ctx,
            alloc,
            constraint.outer1,
            constraint.middle,
            constraint.outer2,
            axis,
          );
    }
  }
}

/** Encode base + all constraints into a single clause set. */
export function encodePuzzle(
  ctx: EncodingContext,
  constraints: Constraint[],
): number[][] {
  const alloc = new RankVarAllocator(ctx);
  const clauses = encodeBase(ctx);
  for (const c of constraints) {
    for (const clause of encodeConstraint(ctx, c, alloc)) clauses.push(clause);
  }
  for (const clause of alloc.channeling) clauses.push(clause);
  return clauses;
}
