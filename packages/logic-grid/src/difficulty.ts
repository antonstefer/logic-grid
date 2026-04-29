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

/**
 * Types that classify a puzzle as "hard" (anything outside MEDIUM_TYPES).
 *
 * The intermediate Record gives us a compile-time exhaustiveness check: a new
 * ConstraintType variant added to types.ts is a TypeScript error here unless
 * its key is added below, so this list never silently drifts.
 */
export const HARD_ONLY_TYPES: ConstraintType[] = (
  Object.keys({
    same_position: true,
    not_same_position: true,
    next_to: true,
    not_next_to: true,
    left_of: true,
    before: true,
    between: true,
    not_between: true,
    exact_distance: true,
  } satisfies Record<ConstraintType, true>) as ConstraintType[]
).filter((t) => !MEDIUM_TYPES.has(t));

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
