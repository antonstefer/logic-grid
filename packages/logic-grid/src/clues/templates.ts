import type { Constraint, Clue, Grid } from "../types";

/** Convert a constraint into a human-readable English clue. */
export function renderClue(constraint: Constraint, grid: Grid): Clue {
  const text = renderText(constraint, grid);
  return { constraint, text };
}

/**
 * Maps category names to label nouns and verb phrases.
 * Empty string noun = person category (value used bare: "Alice").
 * Unlisted categories fall through to using the category name itself.
 */
const CATEGORY_NOUN: Record<string, string> = {
  name: "",
  color: "house",
  pet: "owner",
  drink: "drinker",
  food: "lover",
  hobby: "enthusiast",
  music: "fan",
  sport: "player",
};

/**
 * Verb phrases for same-house clues, keyed by noun.
 * Used when this noun is the OBJECT: "{subject} {verb} {raw value}".
 * [positive, negative]
 */
const NOUN_VERB: Record<string, [string, string]> = {
  "": ["lives with", "does not live with"],
  owner: ["owns the", "does not own the"],
  drinker: ["drinks", "does not drink"],
  house: ["lives in the", "does not live in the"],
  lover: ["eats", "does not eat"],
  enthusiast: ["enjoys", "does not enjoy"],
  fan: ["listens to", "does not listen to"],
  player: ["plays", "does not play"],
};

function findCategory(value: string, grid: Grid): string {
  for (const cat of grid.categories) {
    if (cat.values.includes(value)) return cat.name;
  }
  return "unknown";
}

function nounOf(value: string, grid: Grid): string {
  const cat = findCategory(value, grid).toLowerCase();
  return CATEGORY_NOUN[cat] ?? cat;
}

/** Natural noun phrase: "Alice", "the red house", "the cat owner". */
function label(value: string, grid: Grid): string {
  const cat = findCategory(value, grid).toLowerCase();
  const noun = CATEGORY_NOUN[cat];
  if (noun === "") return value;
  return `the ${value.toLowerCase()} ${noun ?? cat}`;
}

// --- Same-house rendering ---

/** Subject priority: person > house > everything else. */
function subjectPriority(noun: string): number {
  if (noun === "") return 2; // person
  if (noun === "house") return 1; // color
  return 0;
}

function renderSameHouse(
  constraint: { a: string; b: string },
  grid: Grid,
  negative: boolean,
): string {
  const nounA = nounOf(constraint.a, grid);
  const nounB = nounOf(constraint.b, grid);

  // Pick subject (higher priority) and object
  let subj = constraint.a;
  let obj = constraint.b;
  let objNoun = nounB;
  if (subjectPriority(nounB) > subjectPriority(nounA)) {
    subj = constraint.b;
    obj = constraint.a;
    objNoun = nounA;
  }

  const idx = negative ? 1 : 0;

  // Special: color + pet → "The red house has a cat"
  if (nounOf(subj, grid) === "house" && objNoun === "owner") {
    const verb = negative ? "does not have a" : "has a";
    return `The ${subj.toLowerCase()} house ${verb} ${obj.toLowerCase()}.`;
  }

  // Look up verb for the object noun
  const verb = NOUN_VERB[objNoun];
  if (verb) {
    const subjNoun = nounOf(subj, grid);
    // "house" subject + non-house object: insert "'s resident"
    const subjLabel =
      subjNoun === "house"
        ? `The ${subj.toLowerCase()} house's resident`
        : capitalize(label(subj, grid));
    // "house" object needs "house" suffix: "lives in the red house"
    const suffix =
      objNoun === "house"
        ? ` ${obj.toLowerCase()} house`
        : ` ${obj.toLowerCase()}`;
    return `${subjLabel} ${verb[idx]}${suffix}.`;
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
