import type { Constraint, ConstraintType, Difficulty, Grid } from "./types";
import { deduce } from "./deduce";

export const EASY_TYPES: Set<ConstraintType> = new Set([
  "same_position",
  "not_same_position",
]);

export const MEDIUM_TYPES: Set<ConstraintType> = new Set([
  ...EASY_TYPES,
  "next_to",
  "left_of",
  "before",
]);

// Hard types: between, not_between, not_next_to, exact_distance (plus everything else)

/**
 * Classify puzzle difficulty. Uses constraint types as a floor (easy/medium/hard),
 * then promotes to "expert" if the puzzle requires contradiction or cannot be
 * fully solved by deduction.
 */
export function classify(constraints: Constraint[], grid?: Grid): Difficulty {
  const typeFloor = classifyByTypes(constraints);
  if (!grid) return typeFloor;

  const result = deduce(constraints, grid);
  if (
    !result.complete ||
    result.steps.some((s) => s.technique === "contradiction")
  ) {
    return "expert";
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
