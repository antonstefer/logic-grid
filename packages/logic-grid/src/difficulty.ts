import type { Constraint, ConstraintType, Difficulty, Grid } from "./types";
import { deduce } from "./deduce";

/**
 * Single source of truth for the difficulty tier of every constraint type.
 *
 * Adding a new ConstraintType variant to types.ts is a TypeScript error here
 * until its tier is decided — there's no way to forget to classify it. The
 * three exported sets/lists below are derived from this Record.
 */
const TYPE_TIER: Record<ConstraintType, "easy" | "medium" | "hard"> = {
  same_position: "easy",
  not_same_position: "easy",
  next_to: "medium",
  left_of: "medium",
  before: "medium",
  between: "hard",
  not_between: "hard",
  not_next_to: "hard",
  exact_distance: "hard",
};

const tierEntries = Object.entries(TYPE_TIER) as [
  ConstraintType,
  "easy" | "medium" | "hard",
][];

export const EASY_TYPES: Set<ConstraintType> = new Set(
  tierEntries.filter(([, tier]) => tier === "easy").map(([t]) => t),
);

export const MEDIUM_TYPES: Set<ConstraintType> = new Set(
  tierEntries
    .filter(([, tier]) => tier === "easy" || tier === "medium")
    .map(([t]) => t),
);

/** Types that classify a puzzle as "hard" (i.e. tier === "hard"). */
export const HARD_ONLY_TYPES: ConstraintType[] = tierEntries
  .filter(([, tier]) => tier === "hard")
  .map(([t]) => t);

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
