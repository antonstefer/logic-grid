import type { Category, Constraint, Grid } from "./types";
import { resolveAxis } from "./axis";

/**
 * True when `axis` is the first ordered category in `grid`. This category is
 * identity-pinned by encodeBase (rank = position), so the cheap positional
 * encoders can be used for constraints targeting it.
 */
function isIdentityPinnedAxis(grid: Grid, axis: Category): boolean {
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
  for (const [i, j] of badPairs) {
    clauses.push([
      -alloc.rankVar(ctx, axis, a, i),
      -alloc.rankVar(ctx, axis, b, j),
    ]);
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
        clauses.push([
          -alloc.rankVar(ctx, axis, outer1, i),
          -alloc.rankVar(ctx, axis, outer2, j),
          -alloc.rankVar(ctx, axis, middle, k),
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
  /** Cache: "axisName:value" → base var index for that value's rank vars. */
  private cache = new Map<string, number>();
  /** Accumulated channeling clauses (forward + AMO + ALO). */
  readonly channeling: number[][] = [];

  constructor(ctx: EncodingContext) {
    this.nextVar = ctx.numValues * ctx.numPositions + 1;
  }

  /** High-water mark: the first variable ID NOT used by this allocator. */
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
    const key = `${axis.name}:${value}`;
    let base = this.cache.get(key);
    if (base === undefined) {
      base = this.nextVar;
      const M = axis.values.length;
      this.nextVar += M;
      this.cache.set(key, base);
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

  // Identity-pin the first ordered category. This matches the generator's
  // randomSolution behavior and keeps the row-based positional encoder
  // semantically consistent with the axis-tagged comparative constraints.
  const firstOrdered = grid.categories.find((c) => c.ordered === true);
  if (!firstOrdered) throw new Error("Grid has no ordered category");
  for (let i = 0; i < firstOrdered.values.length; i++) {
    clauses.push([variable(ctx, firstOrdered.values[i], i)]);
  }

  return clauses;
}

// --- Positional fast path for identity-pinned axes ---
// The first ordered category is identity-pinned (value i at row i) by
// encodeBase. For constraints targeting this axis, we can use direct
// position-based clauses instead of the larger rank-forbidding clauses.

function encodePositionalNextTo(
  ctx: EncodingContext,
  a: string,
  b: string,
): number[][] {
  const n = ctx.numPositions;
  const clauses: number[][] = [];
  for (let p = 0; p < n; p++) {
    const clause: number[] = [-variable(ctx, a, p)];
    if (p > 0) clause.push(variable(ctx, b, p - 1));
    if (p < n - 1) clause.push(variable(ctx, b, p + 1));
    clauses.push(clause);
  }
  for (let p = 0; p < n; p++) {
    const clause: number[] = [-variable(ctx, b, p)];
    if (p > 0) clause.push(variable(ctx, a, p - 1));
    if (p < n - 1) clause.push(variable(ctx, a, p + 1));
    clauses.push(clause);
  }
  return clauses;
}

function encodePositionalNotNextTo(
  ctx: EncodingContext,
  a: string,
  b: string,
): number[][] {
  const n = ctx.numPositions;
  const clauses: number[][] = [];
  for (let p = 0; p < n - 1; p++) {
    clauses.push([-variable(ctx, a, p), -variable(ctx, b, p + 1)]);
    clauses.push([-variable(ctx, a, p + 1), -variable(ctx, b, p)]);
  }
  return clauses;
}

function encodePositionalLeftOf(
  ctx: EncodingContext,
  a: string,
  b: string,
): number[][] {
  const n = ctx.numPositions;
  const clauses: number[][] = [];
  for (let p = 0; p < n - 1; p++) {
    clauses.push([-variable(ctx, a, p), variable(ctx, b, p + 1)]);
  }
  for (let p = 1; p < n; p++) {
    clauses.push([-variable(ctx, b, p), variable(ctx, a, p - 1)]);
  }
  clauses.push([-variable(ctx, a, n - 1)]);
  clauses.push([-variable(ctx, b, 0)]);
  return clauses;
}

function encodePositionalBefore(
  ctx: EncodingContext,
  a: string,
  b: string,
): number[][] {
  const n = ctx.numPositions;
  const clauses: number[][] = [];
  for (let p = 0; p < n; p++) {
    const clause: number[] = [-variable(ctx, a, p)];
    for (let q = p + 1; q < n; q++) clause.push(variable(ctx, b, q));
    clauses.push(clause);
  }
  for (let p = 0; p < n; p++) {
    const clause: number[] = [-variable(ctx, b, p)];
    for (let q = 0; q < p; q++) clause.push(variable(ctx, a, q));
    clauses.push(clause);
  }
  return clauses;
}

function encodePositionalBetween(
  ctx: EncodingContext,
  outer1: string,
  middle: string,
  outer2: string,
): number[][] {
  const n = ctx.numPositions;
  const clauses: number[][] = [];
  for (let po1 = 0; po1 < n; po1++) {
    for (let po2 = 0; po2 < n; po2++) {
      if (po1 === po2) continue;
      const lo = Math.min(po1, po2);
      const hi = Math.max(po1, po2);
      const validMiddle: number[] = [];
      for (let pm = lo + 1; pm < hi; pm++) {
        validMiddle.push(variable(ctx, middle, pm));
      }
      if (validMiddle.length === 0) {
        clauses.push([
          -variable(ctx, outer1, po1),
          -variable(ctx, outer2, po2),
        ]);
      } else {
        clauses.push([
          -variable(ctx, outer1, po1),
          -variable(ctx, outer2, po2),
          ...validMiddle,
        ]);
      }
    }
  }
  return clauses;
}

function encodePositionalNotBetween(
  ctx: EncodingContext,
  outer1: string,
  middle: string,
  outer2: string,
): number[][] {
  const n = ctx.numPositions;
  const clauses: number[][] = [];
  for (let pm = 1; pm < n - 1; pm++) {
    for (let po1 = 0; po1 < pm; po1++) {
      for (let po2 = pm + 1; po2 < n; po2++) {
        clauses.push([
          -variable(ctx, middle, pm),
          -variable(ctx, outer1, po1),
          -variable(ctx, outer2, po2),
        ]);
        clauses.push([
          -variable(ctx, middle, pm),
          -variable(ctx, outer1, po2),
          -variable(ctx, outer2, po1),
        ]);
      }
    }
  }
  return clauses;
}

function encodePositionalExactDistance(
  ctx: EncodingContext,
  a: string,
  b: string,
  distance: number,
  numVals: number[] | undefined,
): number[][] {
  const n = ctx.numPositions;
  const clauses: number[][] = [];
  if (numVals) {
    const validPairs: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(numVals[i] - numVals[j]) === distance) {
          validPairs.push([i, j]);
        }
      }
    }
    for (let p = 0; p < n; p++) {
      const clause: number[] = [-variable(ctx, a, p)];
      for (const [p1, p2] of validPairs) {
        if (p1 === p) clause.push(variable(ctx, b, p2));
        if (p2 === p) clause.push(variable(ctx, b, p1));
      }
      clauses.push(clause);
    }
    for (let p = 0; p < n; p++) {
      const clause: number[] = [-variable(ctx, b, p)];
      for (const [p1, p2] of validPairs) {
        if (p1 === p) clause.push(variable(ctx, a, p2));
        if (p2 === p) clause.push(variable(ctx, a, p1));
      }
      clauses.push(clause);
    }
  } else {
    for (let p = 0; p < n; p++) {
      const clause: number[] = [-variable(ctx, a, p)];
      if (p + distance < n) clause.push(variable(ctx, b, p + distance));
      if (p - distance >= 0) clause.push(variable(ctx, b, p - distance));
      clauses.push(clause);
    }
    for (let p = 0; p < n; p++) {
      const clause: number[] = [-variable(ctx, b, p)];
      if (p + distance < n) clause.push(variable(ctx, a, p + distance));
      if (p - distance >= 0) clause.push(variable(ctx, a, p - distance));
      clauses.push(clause);
    }
  }
  return clauses;
}

/** Encode a single constraint as CNF clauses. */
export function encodeConstraint(
  ctx: EncodingContext,
  constraint: Constraint,
  alloc?: RankVarAllocator,
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
      if (isIdentityPinnedAxis(ctx.grid, axis)) {
        switch (constraint.type) {
          case "next_to":
            return encodePositionalNextTo(ctx, constraint.a, constraint.b);
          case "not_next_to":
            return encodePositionalNotNextTo(ctx, constraint.a, constraint.b);
          case "left_of":
            return encodePositionalLeftOf(ctx, constraint.a, constraint.b);
          case "before":
            return encodePositionalBefore(ctx, constraint.a, constraint.b);
        }
      }
      const bad = badBinaryRankPairs(
        constraint.type,
        axis.values.length,
        0,
        undefined,
      );
      return encodeBinaryAxis(ctx, alloc!, constraint.a, constraint.b, axis, bad);
    }

    case "exact_distance": {
      const axis = resolveAxis(ctx.grid, constraint.axis);
      if (isIdentityPinnedAxis(ctx.grid, axis)) {
        return encodePositionalExactDistance(
          ctx,
          constraint.a,
          constraint.b,
          constraint.distance,
          axis.numericValues,
        );
      }
      const bad = badBinaryRankPairs(
        "exact_distance",
        axis.values.length,
        constraint.distance,
        axis.numericValues,
      );
      return encodeBinaryAxis(ctx, alloc!, constraint.a, constraint.b, axis, bad);
    }

    case "between":
    case "not_between": {
      const axis = resolveAxis(ctx.grid, constraint.axis);
      if (isIdentityPinnedAxis(ctx.grid, axis)) {
        return constraint.type === "between"
          ? encodePositionalBetween(
              ctx,
              constraint.outer1,
              constraint.middle,
              constraint.outer2,
            )
          : encodePositionalNotBetween(
              ctx,
              constraint.outer1,
              constraint.middle,
              constraint.outer2,
            );
      }
      return encodeBetweenAxis(
        ctx,
        alloc!,
        constraint.outer1,
        constraint.middle,
        constraint.outer2,
        axis,
        constraint.type === "not_between",
      );
    }

    case "at_position": {
      return [[variable(ctx, constraint.value, constraint.position)]];
    }

    case "not_at_position": {
      return [[-variable(ctx, constraint.value, constraint.position)]];
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
