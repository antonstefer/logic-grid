import type { Constraint, Clue, Grid } from "../types";

/** Convert a constraint into a human-readable English clue. */
export function renderClue(constraint: Constraint, grid: Grid): Clue {
  const text = renderText(constraint, grid);
  return { constraint, text };
}

/**
 * Maps category names to label nouns and same-house template keys.
 * Empty string = person category (value used bare: "Alice").
 * Non-empty = noun appended: "the red house", "the cat owner".
 * Unlisted categories fall through to using the category name itself.
 */
const CATEGORY_NOUN: Record<string, string> = {
  name: "",
  color: "house",
  pet: "owner",
  drink: "drinker",
};

function findCategory(value: string, grid: Grid): string {
  for (const cat of grid.categories) {
    if (cat.values.includes(value)) return cat.name;
  }
  return "unknown";
}

/** Natural noun phrase: "Alice", "the red house", "the cat owner". */
function label(value: string, grid: Grid): string {
  const cat = findCategory(value, grid).toLowerCase();
  const noun = CATEGORY_NOUN[cat];
  if (noun === "") return value; // person — bare name
  return `the ${value.toLowerCase()} ${noun ?? cat}`;
}

// --- Same-house templates keyed by noun pair ---
// Keyed as "nounA+nounB" where "" = person category.
// Each entry: [positive template, negative template].
// Templates receive (labelA, labelB, rawA, rawB).

type Template = (la: string, lb: string, ra: string, rb: string) => string;

const SAME_HOUSE: Record<string, [Template, Template]> = {
  "+owner": [
    (la, _lb, _ra, rb) => `${la} owns the ${rb}.`,
    (la, _lb, _ra, rb) => `${la} does not own the ${rb}.`,
  ],
  "+drinker": [
    (la, _lb, _ra, rb) => `${la} drinks ${rb}.`,
    (la, _lb, _ra, rb) => `${la} does not drink ${rb}.`,
  ],
  "+house": [
    (la, _lb, _ra, rb) => `${la} lives in the ${rb} house.`,
    (la, _lb, _ra, rb) => `${la} does not live in the ${rb} house.`,
  ],
  "house+owner": [
    (_la, _lb, ra, rb) => `The ${ra} house has a ${rb}.`,
    (_la, _lb, ra, rb) => `The ${ra} house does not have a ${rb}.`,
  ],
  "house+drinker": [
    (la, _lb, _ra, rb) => `${la}'s resident drinks ${rb}.`,
    (la, _lb, _ra, rb) => `${la}'s resident does not drink ${rb}.`,
  ],
  "owner+drinker": [
    (la, _lb, _ra, rb) => `${la} drinks ${rb}.`,
    (la, _lb, _ra, rb) => `${la} does not drink ${rb}.`,
  ],
};

function nounOf(value: string, grid: Grid): string {
  const cat = findCategory(value, grid).toLowerCase();
  return CATEGORY_NOUN[cat] ?? cat;
}

function renderSameHouse(
  constraint: { a: string; b: string },
  grid: Grid,
  negative: boolean,
): string {
  const nounA = nounOf(constraint.a, grid);
  const nounB = nounOf(constraint.b, grid);
  const idx = negative ? 1 : 0;

  // Try both orderings
  const tmpl =
    SAME_HOUSE[`${nounA}+${nounB}`] ?? SAME_HOUSE[`${nounB}+${nounA}`];

  if (tmpl) {
    const swap = !SAME_HOUSE[`${nounA}+${nounB}`];
    const a = swap ? constraint.b : constraint.a;
    const b = swap ? constraint.a : constraint.b;
    return capitalize(
      tmpl[idx](
        label(a, grid),
        label(b, grid),
        a.toLowerCase(),
        b.toLowerCase(),
      ),
    );
  }

  // Generic fallback
  const la = label(constraint.a, grid);
  const lb = label(constraint.b, grid);
  return negative
    ? `${capitalize(la)} and ${lb} are not in the same house.`
    : `${capitalize(la)} and ${lb} are in the same house.`;
}

// --- Main renderer ---

function renderText(constraint: Constraint, grid: Grid): string {
  switch (constraint.type) {
    case "same_house":
      return renderSameHouse(constraint, grid, false);
    case "not_same_house":
      return renderSameHouse(constraint, grid, true);
    case "next_to": {
      const la = label(constraint.a, grid);
      const lb = label(constraint.b, grid);
      return `${capitalize(la)} is next to ${lb}.`;
    }
    case "not_next_to": {
      const la = label(constraint.a, grid);
      const lb = label(constraint.b, grid);
      return `${capitalize(la)} is not next to ${lb}.`;
    }
    case "left_of": {
      // Alternate "left of" / "right of" based on value names
      if (simpleHash(constraint.a + constraint.b) % 2 === 0) {
        return `${capitalize(label(constraint.a, grid))} is directly to the left of ${label(constraint.b, grid)}.`;
      }
      return `${capitalize(label(constraint.b, grid))} is directly to the right of ${label(constraint.a, grid)}.`;
    }
    case "between": {
      const lm = label(constraint.middle, grid);
      const lo1 = label(constraint.outer1, grid);
      const lo2 = label(constraint.outer2, grid);
      return `${capitalize(lm)} is between ${lo1} and ${lo2}.`;
    }
    case "at_position":
      return `${capitalize(label(constraint.value, grid))} is in house ${constraint.position + 1}.`;
    case "not_at_position":
      return `${capitalize(label(constraint.value, grid))} is not in house ${constraint.position + 1}.`;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Deterministic hash — same constraint always renders the same way. */
function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
