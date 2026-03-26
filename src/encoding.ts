import { Constraint, Grid } from "./types";

export interface EncodingContext {
  grid: Grid;
  valueIndex: Map<string, number>;
  numPositions: number;
  numValues: number;
}

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

  return clauses;
}

/** Encode a single constraint as CNF clauses. */
export function encodeConstraint(
  ctx: EncodingContext,
  constraint: Constraint,
): number[][] {
  const n = ctx.numPositions;

  switch (constraint.type) {
    case "same_house": {
      const { a, b } = constraint;
      const clauses: number[][] = [];
      for (let p = 0; p < n; p++) {
        clauses.push([-variable(ctx, a, p), variable(ctx, b, p)]);
        clauses.push([-variable(ctx, b, p), variable(ctx, a, p)]);
      }
      return clauses;
    }

    case "not_same_house": {
      const { a, b } = constraint;
      const clauses: number[][] = [];
      for (let p = 0; p < n; p++) {
        clauses.push([-variable(ctx, a, p), -variable(ctx, b, p)]);
      }
      return clauses;
    }

    case "next_to": {
      const { a, b } = constraint;
      const clauses: number[][] = [];
      // If a at p, then b at p-1 or p+1
      for (let p = 0; p < n; p++) {
        const clause: number[] = [-variable(ctx, a, p)];
        if (p > 0) clause.push(variable(ctx, b, p - 1));
        if (p < n - 1) clause.push(variable(ctx, b, p + 1));
        clauses.push(clause);
      }
      // Symmetric: if b at p, then a at p-1 or p+1
      for (let p = 0; p < n; p++) {
        const clause: number[] = [-variable(ctx, b, p)];
        if (p > 0) clause.push(variable(ctx, a, p - 1));
        if (p < n - 1) clause.push(variable(ctx, a, p + 1));
        clauses.push(clause);
      }
      return clauses;
    }

    case "not_next_to": {
      const { a, b } = constraint;
      const clauses: number[][] = [];
      for (let p = 0; p < n - 1; p++) {
        clauses.push([-variable(ctx, a, p), -variable(ctx, b, p + 1)]);
        clauses.push([-variable(ctx, a, p + 1), -variable(ctx, b, p)]);
      }
      return clauses;
    }

    case "left_of": {
      const { a, b } = constraint;
      const clauses: number[][] = [];
      // a is immediately left of b: pos(a) = pos(b) - 1
      for (let p = 0; p < n - 1; p++) {
        clauses.push([-variable(ctx, a, p), variable(ctx, b, p + 1)]);
      }
      for (let p = 1; p < n; p++) {
        clauses.push([-variable(ctx, b, p), variable(ctx, a, p - 1)]);
      }
      // a cannot be in last position
      clauses.push([-variable(ctx, a, n - 1)]);
      // b cannot be in first position
      clauses.push([-variable(ctx, b, 0)]);
      return clauses;
    }

    case "between": {
      const { outer1, middle, outer2 } = constraint;
      const clauses: number[][] = [];
      // For each pair of positions for outer1 and outer2,
      // middle must be strictly between them
      for (let po1 = 0; po1 < n; po1++) {
        for (let po2 = 0; po2 < n; po2++) {
          if (po1 === po2) {
            // Can't both be at same position (handled by base, but be explicit)
            continue;
          }
          const lo = Math.min(po1, po2);
          const hi = Math.max(po1, po2);
          const validMiddle: number[] = [];
          for (let pm = lo + 1; pm < hi; pm++) {
            validMiddle.push(variable(ctx, middle, pm));
          }
          // If outer1 at po1 and outer2 at po2, middle must be in valid range
          if (validMiddle.length === 0) {
            // Adjacent or same — this combination is forbidden
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
    clauses.push(...encodeConstraint(ctx, c));
  }
  return clauses;
}
