import type { Constraint, ConstraintType, Difficulty, Grid } from "./types";

export const EASY_TYPES: Set<ConstraintType> = new Set([
  "same_house",
  "not_same_house",
  "at_position",
  "not_at_position",
]);

export const MEDIUM_TYPES: Set<ConstraintType> = new Set([
  ...EASY_TYPES,
  "next_to",
  "left_of",
  "before",
]);

// Hard types: between, not_between, not_next_to, exact_distance (plus everything else)

/**
 * Classify puzzle difficulty. Uses constraint types as a floor, then (if grid
 * is provided) checks whether the puzzle is solvable by direct elimination alone.
 */
export function classify(constraints: Constraint[], grid?: Grid): Difficulty {
  const typeFloor = classifyByTypes(constraints);

  if (grid && typeFloor === "easy") {
    // Check if human-style elimination can fully solve it
    const canEliminate = humanSolve(constraints, grid);
    if (canEliminate) return "easy";
    return "medium";
  }

  return typeFloor;
}

function classifyByTypes(constraints: Constraint[]): Difficulty {
  let hasHard = false;
  let hasMedium = false;

  for (const c of constraints) {
    if (!MEDIUM_TYPES.has(c.type)) {
      hasHard = true;
      break;
    }
    if (!EASY_TYPES.has(c.type)) {
      hasMedium = true;
    }
  }

  if (hasHard) return "hard";
  if (hasMedium) return "medium";
  return "easy";
}

/**
 * Attempt to solve using only direct elimination (naked/hidden singles).
 * Returns true if the puzzle is fully solved without guessing.
 */
function humanSolve(constraints: Constraint[], grid: Grid): boolean {
  const n = grid.size;
  const categories = grid.categories;

  // possible[catIdx][valIdx] = set of possible positions
  const possible: Set<number>[][] = categories.map((cat) =>
    cat.values.map(() => new Set(Array.from({ length: n }, (_, i) => i))),
  );

  // Helper: find category and value index
  const valueInfo = new Map<string, [number, number]>();
  for (let ci = 0; ci < categories.length; ci++) {
    for (let vi = 0; vi < categories[ci].values.length; vi++) {
      valueInfo.set(categories[ci].values[vi], [ci, vi]);
    }
  }

  function getPossible(value: string): Set<number> {
    const info = valueInfo.get(value);
    if (!info) return new Set();
    return possible[info[0]][info[1]];
  }

  function getAssigned(value: string): number | null {
    const ps = getPossible(value);
    return ps.size === 1 ? [...ps][0] : null;
  }

  // Apply constraints as elimination rules
  let changed = true;
  while (changed) {
    changed = false;

    for (const c of constraints) {
      switch (c.type) {
        case "at_position": {
          const ps = getPossible(c.value);
          if (ps.size > 1) {
            ps.clear();
            ps.add(c.position);
            changed = true;
          }
          break;
        }
        case "not_at_position": {
          const ps = getPossible(c.value);
          if (ps.has(c.position)) {
            ps.delete(c.position);
            changed = true;
          }
          break;
        }
        case "same_house": {
          const pa = getPossible(c.a);
          const pb = getPossible(c.b);
          // Intersect: both must be in the same position
          for (const p of pa) {
            if (!pb.has(p)) {
              pa.delete(p);
              changed = true;
            }
          }
          for (const p of pb) {
            if (!pa.has(p)) {
              pb.delete(p);
              changed = true;
            }
          }
          break;
        }
        case "not_same_house": {
          const posA = getAssigned(c.a);
          const posB = getAssigned(c.b);
          if (posA !== null) {
            const pb = getPossible(c.b);
            if (pb.has(posA)) {
              pb.delete(posA);
              changed = true;
            }
          }
          if (posB !== null) {
            const pa = getPossible(c.a);
            if (pa.has(posB)) {
              pa.delete(posB);
              changed = true;
            }
          }
          break;
        }
      }
      // Only easy types are processed in human-style elimination
    }

    // Naked singles: if a value has only one position, remove that position
    // from all other values in the same category
    for (let ci = 0; ci < categories.length; ci++) {
      for (let vi = 0; vi < categories[ci].values.length; vi++) {
        if (possible[ci][vi].size === 1) {
          const pos = [...possible[ci][vi]][0];
          for (let ovi = 0; ovi < categories[ci].values.length; ovi++) {
            if (ovi !== vi && possible[ci][ovi].has(pos)) {
              possible[ci][ovi].delete(pos);
              changed = true;
            }
          }
        }
      }
    }

    // Hidden singles: if a position has only one possible value in a category
    for (let ci = 0; ci < categories.length; ci++) {
      for (let p = 0; p < n; p++) {
        let count = 0;
        let lastVi = -1;
        for (let vi = 0; vi < categories[ci].values.length; vi++) {
          if (possible[ci][vi].has(p)) {
            count++;
            lastVi = vi;
            if (count > 1) break;
          }
        }
        if (count === 1 && possible[ci][lastVi].size > 1) {
          possible[ci][lastVi].clear();
          possible[ci][lastVi].add(p);
          changed = true;
        }
      }
    }
  }

  // Check if fully solved
  for (let ci = 0; ci < categories.length; ci++) {
    for (let vi = 0; vi < categories[ci].values.length; vi++) {
      if (possible[ci][vi].size !== 1) return false;
    }
  }
  return true;
}
