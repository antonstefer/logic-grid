import type { Category, Constraint, Clue, Grid } from "../types";

const ORDINALS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
];

const CARDINALS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
];

function ordinalHouse(position: number): string {
  return `the ${ORDINALS[position]} house`;
}

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

function findCategory(value: string, grid: Grid): Category {
  for (const cat of grid.categories) {
    if (cat.values.includes(value)) return cat;
  }
  throw new Error(`Unknown value: ${value}`);
}

function nounOf(value: string, grid: Grid): string {
  const cat = findCategory(value, grid);
  if (cat.noun !== undefined) return cat.noun;
  return CATEGORY_NOUN[cat.name.toLowerCase()] ?? cat.name.toLowerCase();
}

/** Natural noun phrase: "Alice", "the red house", "the cat owner". */
function label(value: string, grid: Grid): string {
  const noun = nounOf(value, grid);
  if (noun === "") return value;
  return `the ${value.toLowerCase()} ${noun}`;
}

/** "lives" for people/owners/drinkers, "is" for houses. */
function livesVerb(value: string, grid: Grid): string {
  return nounOf(value, grid) === "house" ? "is" : "lives";
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

  // Special: color + pet → "The cat lives in the red house"
  if (nounOf(subj, grid) === "house" && objNoun === "owner") {
    const article = negative ? "No" : "The";
    return `${article} ${obj.toLowerCase()} lives in the ${subj.toLowerCase()} house.`;
  }

  // Look up verb: custom category verb first, then built-in noun mapping
  const verb = findCategory(obj, grid).verb ?? NOUN_VERB[objNoun];
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
      const v = livesVerb(constraint.a, grid);
      return `${capitalize(la)} ${v} next to ${lb}.`;
    }
    case "not_next_to": {
      const la = label(constraint.a, grid);
      const lb = label(constraint.b, grid);
      const neg =
        nounOf(constraint.a, grid) === "house" ? "is not" : "does not live";
      return `${capitalize(la)} ${neg} next to ${lb}.`;
    }
    case "left_of": {
      if (simpleHash(constraint.a + constraint.b) % 2 === 0) {
        const v = livesVerb(constraint.a, grid);
        return `${capitalize(label(constraint.a, grid))} ${v} directly left of ${label(constraint.b, grid)}.`;
      }
      const v = livesVerb(constraint.b, grid);
      return `${capitalize(label(constraint.b, grid))} ${v} directly right of ${label(constraint.a, grid)}.`;
    }
    case "between": {
      const lm = label(constraint.middle, grid);
      const lo1 = label(constraint.outer1, grid);
      const lo2 = label(constraint.outer2, grid);
      const v = livesVerb(constraint.middle, grid);
      return `${capitalize(lm)} ${v} somewhere between ${lo1} and ${lo2}.`;
    }
    case "not_between": {
      const lm = label(constraint.middle, grid);
      const lo1 = label(constraint.outer1, grid);
      const lo2 = label(constraint.outer2, grid);
      const neg =
        nounOf(constraint.middle, grid) === "house"
          ? "is not"
          : "does not live";
      return `${capitalize(lm)} ${neg} somewhere between ${lo1} and ${lo2}.`;
    }
    case "before": {
      if (simpleHash(constraint.a + constraint.b) % 2 === 0) {
        const v = livesVerb(constraint.a, grid);
        return `${capitalize(label(constraint.a, grid))} ${v} somewhere left of ${label(constraint.b, grid)}.`;
      }
      const v = livesVerb(constraint.b, grid);
      return `${capitalize(label(constraint.b, grid))} ${v} somewhere right of ${label(constraint.a, grid)}.`;
    }
    case "exact_distance": {
      const la = label(constraint.a, grid);
      const lb = label(constraint.b, grid);
      const v = livesVerb(constraint.a, grid);
      const dist =
        CARDINALS[constraint.distance] ?? String(constraint.distance);
      const houses = constraint.distance === 1 ? "house" : "houses";
      return `${capitalize(la)} ${v} exactly ${dist} ${houses} from ${lb}.`;
    }
    case "at_position": {
      if (nounOf(constraint.value, grid) === "house") {
        return `${capitalize(ordinalHouse(constraint.position))} is ${constraint.value.toLowerCase()}.`;
      }
      return `${capitalize(label(constraint.value, grid))} lives in ${ordinalHouse(constraint.position)}.`;
    }
    case "not_at_position": {
      if (nounOf(constraint.value, grid) === "house") {
        return `${capitalize(ordinalHouse(constraint.position))} is not ${constraint.value.toLowerCase()}.`;
      }
      return `${capitalize(label(constraint.value, grid))} does not live in ${ordinalHouse(constraint.position)}.`;
    }
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
