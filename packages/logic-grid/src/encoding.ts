import type { Category, Constraint, Grid } from "./types";
import { resolveAxis } from "./axis";

/**
 * True when `axis` is the first ordered category in `grid`. Phase 1/2 pins
 * this category by identity in encodeBase, so rank = position for it; we can
 * use the cheap positional encoders for any comparative constraint targeting
 * this axis.
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
 * Rank-forbidding encoder for binary comparative constraints. For each bad
 * rank pair (i, j) and each ordered position pair (p1, p2) with p1 ≠ p2,
 * emits the 4-literal clause
 *   [¬x(a, p1), ¬x(axis[i], p1), ¬x(b, p2), ¬x(axis[j], p2)]
 * which forbids the simultaneous assignment.
 *
 * Clause count per constraint: |bad pairs| × n(n−1). Worst case O(M²·n²).
 */
function encodeBinaryAxis(
  ctx: EncodingContext,
  a: string,
  b: string,
  axis: Category,
  badPairs: [number, number][],
): number[][] {
  const n = ctx.numPositions;
  const clauses: number[][] = [];
  for (const [i, j] of badPairs) {
    const ai = axis.values[i];
    const aj = axis.values[j];
    for (let p1 = 0; p1 < n; p1++) {
      for (let p2 = 0; p2 < n; p2++) {
        // When i ≠ j and p1 = p2, base clauses forbid two distinct axis
        // values coexisting at the same position, so the clause is vacuous.
        // When i = j, we MUST emit the p1 = p2 case — it forbids `a` and
        // `b` sharing the same position (and thus the same rank).
        if (p1 === p2 && i !== j) continue;
        clauses.push([
          -variable(ctx, a, p1),
          -variable(ctx, ai, p1),
          -variable(ctx, b, p2),
          -variable(ctx, aj, p2),
        ]);
      }
    }
  }
  return clauses;
}

/**
 * Rank-forbidding encoder for ternary between/not_between. For each bad
 * (rank_o1, rank_o2, rank_middle) triple and each position triple (p1, p2, p3)
 * with all positions distinct, emits a 6-literal clause forbidding the
 * assignment.
 */
function encodeBetweenAxis(
  ctx: EncodingContext,
  outer1: string,
  middle: string,
  outer2: string,
  axis: Category,
  forbidStrictlyBetween: boolean,
): number[][] {
  const n = ctx.numPositions;
  const M = axis.values.length;
  const clauses: number[][] = [];
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      for (let k = 0; k < M; k++) {
        const lo = Math.min(i, j);
        const hi = Math.max(i, j);
        // "strictly between" requires i ≠ j (non-degenerate outer pair) and
        // k lies strictly inside the open interval (lo, hi).
        const strictlyBetween = i !== j && k > lo && k < hi;
        // `between` is violated when middle is NOT strictly between outers.
        // `not_between` is violated when middle IS strictly between outers.
        const violates = forbidStrictlyBetween
          ? strictlyBetween
          : !strictlyBetween;
        if (!violates) continue;
        const ai = axis.values[i];
        const aj = axis.values[j];
        const ak = axis.values[k];
        for (let p1 = 0; p1 < n; p1++) {
          for (let p2 = 0; p2 < n; p2++) {
            // When i ≠ j and p1 = p2, a_i and a_j collide → vacuous.
            if (p1 === p2 && i !== j) continue;
            for (let p3 = 0; p3 < n; p3++) {
              // Same vacuous-collision skips for the middle's axis slot.
              if (p3 === p1 && k !== i) continue;
              if (p3 === p2 && k !== j) continue;
              clauses.push([
                -variable(ctx, outer1, p1),
                -variable(ctx, ai, p1),
                -variable(ctx, outer2, p2),
                -variable(ctx, aj, p2),
                -variable(ctx, middle, p3),
                -variable(ctx, ak, p3),
              ]);
            }
          }
        }
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
      return encodeBinaryAxis(ctx, constraint.a, constraint.b, axis, bad);
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
      return encodeBinaryAxis(ctx, constraint.a, constraint.b, axis, bad);
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
  const clauses = encodeBase(ctx);
  for (const c of constraints) {
    for (const clause of encodeConstraint(ctx, c)) clauses.push(clause);
  }
  return clauses;
}
