import type { Constraint, ConstraintType, Difficulty, Grid } from "./types";
import { deduce } from "./deduce";

/**
 * Every supported constraint type. Declared as a Record so a new
 * ConstraintType variant in types.ts forces a compile-time update here:
 * a missing key is a TypeScript error rather than silent stale config.
 */
const ALL_CONSTRAINT_TYPES_PRESENT: Record<ConstraintType, true> = {
  same_position: true,
  not_same_position: true,
  next_to: true,
  not_next_to: true,
  left_of: true,
  before: true,
  between: true,
  not_between: true,
  exact_distance: true,
};
export const ALL_CONSTRAINT_TYPES: ConstraintType[] = Object.keys(
  ALL_CONSTRAINT_TYPES_PRESENT,
) as ConstraintType[];

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

/** Types that classify a puzzle as "hard" (anything outside MEDIUM_TYPES). */
export const HARD_ONLY_TYPES: ConstraintType[] = ALL_CONSTRAINT_TYPES.filter(
  (t) => !MEDIUM_TYPES.has(t),
);

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
