import type { Category, Constraint, Grid } from "./types";
import { resolveAxis } from "./axis";

/** True when `axis` is pinned (rank = position) by encodeBase for symmetry breaking. */
function isPinnedAxis(grid: Grid, axis: Category): boolean {
  return grid.categories.find((c) => c.ordered === true) === axis;
}

/**
 * Comparative constraint types for binary rank relations (a, b).
 * `between` and `not_between` are ternary and handled separately.
 */
type BinaryComparativeType =
  | "before"
  | "left_of"
  | "next_to"
  | "not_next_to"
  | "exact_distance";

/**
 * Enumerate "bad" rank pairs for a binary comparative — the (rank_a, rank_b)
 * combinations that violate the constraint and must be forbidden.
 */
function badBinaryRankPairs(
  type: BinaryComparativeType,
  M: number,
  distance: number,
  numericValues: number[] | undefined,
): [number, number][] {
  const bad: [number, number][] = [];
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      let violates: boolean;
      switch (type) {
        case "before":
          violates = i >= j;
          break;
        case "left_of":
          violates = j !== i + 1;
          break;
        case "next_to":
          violates = Math.abs(i - j) !== 1;
          break;
        case "not_next_to":
          violates = Math.abs(i - j) === 1;
          break;
        case "exact_distance": {
          const d = numericValues
            ? Math.abs(numericValues[i] - numericValues[j])
            : Math.abs(i - j);
          violates = d !== distance;
          break;
        }
      }
      if (violates) bad.push([i, j]);
    }
  }
  return bad;
}

/**
 * Rank-var encoder for binary comparative constraints. For each bad rank pair
 * (i, j), emits a 2-literal clause [-r(a,i), -r(b,j)]. Channeling clauses
 * link rank vars to position vars (emitted once per (axis, value) pair via
 * the RankVarAllocator).
 *
 * Clause count per constraint: |bad pairs| × 1 + channeling.
 */
function encodeBinaryAxis(
  ctx: EncodingContext,
  alloc: RankVarAllocator,
  a: string,
  b: string,
  axis: Category,
  badPairs: [number, number][],
): number[][] {
  const clauses: number[][] = [];
  if (isPinnedAxis(ctx.grid, axis)) {
    // Pinned axis: rank = position, use position vars directly.
    for (const [i, j] of badPairs)
      clauses.push([-variable(ctx, a, i), -variable(ctx, b, j)]);
  } else {
    for (const [i, j] of badPairs) {
      clauses.push([
        -alloc.rankVar(ctx, axis, a, i),
        -alloc.rankVar(ctx, axis, b, j),
      ]);
    }
  }
  return clauses;
}

/**
 * Rank-var encoder for ternary between/not_between. For each bad rank triple
 * (i, j, k), emits a 3-literal clause [-r(outer1,i), -r(outer2,j), -r(middle,k)].
 *
 * Complexity: O(M³) constraint clauses + O(V·M·n) channeling. At M=n=8
 * with 3 values: ~512 + ~192 + ~84 + 3 ≈ ~800 clauses instead of ~260k.
 */
function encodeBetweenAxis(
  ctx: EncodingContext,
  alloc: RankVarAllocator,
  outer1: string,
  middle: string,
  outer2: string,
  axis: Category,
  forbidStrictlyBetween: boolean,
): number[][] {
  const M = axis.values.length;
  const pinned = isPinnedAxis(ctx.grid, axis);
  const v = pinned
    ? (val: string, rank: number) => variable(ctx, val, rank)
    : (val: string, rank: number) => alloc.rankVar(ctx, axis, val, rank);
  const clauses: number[][] = [];
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      for (let k = 0; k < M; k++) {
        const lo = Math.min(i, j);
        const hi = Math.max(i, j);
        const strictlyBetween = i !== j && k > lo && k < hi;
        const violates = forbidStrictlyBetween
          ? strictlyBetween
          : !strictlyBetween;
        if (!violates) continue;
        clauses.push([-v(outer1, i), -v(outer2, j), -v(middle, k)]);
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

  // Pin the display axis to break the n!-fold position symmetry. Without
  // this, every puzzle would have n! equivalent solutions (one per
  // permutation of abstract position slots). This is the only axis that
  // gets pinned; all others use the general rank-var encoder.
  const dispAxis = grid.categories.find((c) => c.ordered === true);
  if (!dispAxis) throw new Error("Grid has no ordered category");
  for (let i = 0; i < dispAxis.values.length; i++) {
    clauses.push([variable(ctx, dispAxis.values[i], i)]);
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
      const bad = badBinaryRankPairs(
        constraint.type,
        axis.values.length,
        0,
        undefined,
      );
      return encodeBinaryAxis(
        ctx,
        alloc,
        constraint.a,
        constraint.b,
        axis,
        bad,
      );
    }

    case "exact_distance": {
      const axis = resolveAxis(ctx.grid, constraint.axis);
      const bad = badBinaryRankPairs(
        "exact_distance",
        axis.values.length,
        constraint.distance,
        axis.numericValues,
      );
      return encodeBinaryAxis(
        ctx,
        alloc,
        constraint.a,
        constraint.b,
        axis,
        bad,
      );
    }

    case "between":
    case "not_between": {
      const axis = resolveAxis(ctx.grid, constraint.axis);
      return encodeBetweenAxis(
        ctx,
        alloc,
        constraint.outer1,
        constraint.middle,
        constraint.outer2,
        axis,
        constraint.type === "not_between",
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
