import type { Constraint, ConstraintType, Difficulty, Grid } from "./types";
import { deduce } from "./deduce";

/** Constraint-type difficulty tiers. Distinct from {@link Difficulty} which
 *  also has "expert" — that's a deduction promotion, not a constraint tier. */
export type ConstraintTier = "easy" | "medium" | "hard";

/**
 * Single source of truth for the difficulty tier of every constraint type.
 *
 * Adding a new ConstraintType variant to types.ts is a TypeScript error here
 * until its tier is decided — there's no way to forget to classify it. The
 * helpers below derive everything else from this map.
 */
const TYPE_TIER: Record<ConstraintType, ConstraintTier> = {
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

const TIER_RANK: Record<ConstraintTier, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
};

const allTypes = Object.keys(TYPE_TIER) as ConstraintType[];

/**
 * Constraint types whose tier is exactly `tier`.
 * `typesAtTier("hard")` → ["between", "not_between", "not_next_to", "exact_distance"].
 */
export function typesAtTier(tier: ConstraintTier): ConstraintType[] {
  return allTypes.filter((t) => TYPE_TIER[t] === tier);
}

/**
 * Constraint types whose tier is `tier` or below — i.e. allowed in puzzles
 * generated at this difficulty.
 * `typesUpToTier("medium")` → easy + medium tiers (5 types).
 */
export function typesUpToTier(tier: ConstraintTier): Set<ConstraintType> {
  const max = TIER_RANK[tier];
  return new Set(allTypes.filter((t) => TIER_RANK[TYPE_TIER[t]] <= max));
}

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
  let maxRank = 0;
  for (const c of constraints) {
    const rank = TIER_RANK[TYPE_TIER[c.type]];
    if (rank > maxRank) maxRank = rank;
    if (maxRank === TIER_RANK.hard) break;
  }
  if (maxRank === TIER_RANK.hard) return "hard";
  if (maxRank === TIER_RANK.medium) return "medium";
  return "easy";
}
