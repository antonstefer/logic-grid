import type { Category, Constraint, Clue, Grid } from "../types";
import { pinnedAxis, resolveAxis } from "../axis";

function findCategory(value: string, grid: Grid): Category {
  for (const cat of grid.categories) {
    if (cat.values.includes(value)) return cat;
  }
  throw new Error(`Unknown value: ${value}`);
}

/** Lowercase a value if the category opts in. */
function lc(value: string, cat: Category): string {
  return cat.lowercase ? value.toLowerCase() : value;
}

/** Join a list with the given conjunction word, Oxford-comma for 3+ items:
 *  ["x"] → "x"; ["a","b"] → "a <joiner> b";
 *  ["a","b","c"] → "a, b, <joiner> c".
 *  Throws on empty input — an empty list has no natural form and empty
 *  strings would silently leak into templates. */
function joinWith(items: string[], joiner: string): string {
  if (items.length === 0)
    throw new RangeError("joinWith: items must be non-empty");
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${joiner} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${joiner} ${items[items.length - 1]}`;
}

/** Join with "or" (disjunctive). Thin wrapper — kept as the primary public
 *  helper because most callsites want disjunction. */
export function joinOr(items: string[]): string {
  return joinWith(items, "or");
}

/** Natural noun phrase: "Alice", "the red house", "the cat owner". */
export function label(value: string, grid: Grid): string {
  const cat = findCategory(value, grid);
  if (!cat.noun) return value;
  return `the ${lc(value, cat)} ${cat.noun}`;
}

/** Value as it appears in the object position of a same_position clue. */
function objectValue(value: string, grid: Grid): string {
  const cat = findCategory(value, grid);
  const suffix = cat.valueSuffix;
  return suffix ? `${lc(value, cat)} ${suffix}` : lc(value, cat);
}

/** Look up a symmetric comparator (plain string). */
function symmetricComp(
  grid: Grid,
  type:
    | "next_to"
    | "not_next_to"
    | "between"
    | "not_between"
    | "exact_distance",
  axisName: string,
): string {
  return resolveAxis(grid, axisName).orderingPhrases.comparators[type];
}

/**
 * Pick the directional comparator phrase. Uses `orderedPair()` to decide which
 * side becomes the subject (priority first, then hash tiebreaker) and selects
 * the matching forward/reverse phrase from the tuple.
 */
function directionalComp(
  grid: Grid,
  type: "before" | "left_of",
  a: string,
  b: string,
  axisName: string,
): { subject: string; object: string; phrase: string } {
  const c = resolveAxis(grid, axisName).orderingPhrases.comparators[type];
  const [s] = orderedPair(a, b, grid);
  return s === a
    ? { subject: a, object: b, phrase: c[0] }
    : { subject: b, object: a, phrase: c[1] };
}

/**
 * Return [subject, object] ordered by subjectPriority (higher first). Ties are
 * broken by a deterministic hash so the same constraint pair always renders
 * the same way, but different pairs vary across left/right phrasings.
 */
function orderedPair(a: string, b: string, grid: Grid): [string, string] {
  const pa = findCategory(a, grid).subjectPriority ?? 0;
  const pb = findCategory(b, grid).subjectPriority ?? 0;
  if (pa !== pb) return pb > pa ? [b, a] : [a, b];
  return simpleHash(a + b) % 2 === 0 ? [a, b] : [b, a];
}

/** Deterministic hash — same constraint always renders the same way. */
function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Format a single-position reference using the pinned axis's own verb, so
 * the deduction reads in the same voice as the clue. For non-positionAdjective
 * categories:
 *   "Alice lives in the first house"   (House verb = "lives in the")
 *   "Dan has a return of 12%"          (Return verb = "has a return of")
 *   "Emma has an appointment at 10am"  (Time verb = "has an appointment at")
 *
 * For positionAdjective categories (e.g. Color, where "Red" describes "house"),
 * flips the subject to the pinned-axis row and uses the adjective verb:
 *   "the first house is red" / "the first house is not red"
 */
export function formatAtSingle(
  value: string,
  position: number,
  grid: Grid,
  negative: boolean,
): string {
  const cat = findCategory(value, grid);
  const axis = pinnedAxis(grid);
  if (!axis) throw new RangeError("Grid has no ordered category");
  // Pinned-axis values (e.g. "first" on House) are row anchors themselves;
  // passing one here would produce tautologies like "the first house lives
  // in the first house". Callers should use the axis value directly in the
  // sentence's anchor slot instead.
  if (axis.values.includes(value)) {
    throw new RangeError(
      `formatAtSingle: "${value}" is a pinned-axis value; use it as the anchor, not the subject`,
    );
  }
  const axisVal = axis.values[position];
  // Ordered categories practically always declare a noun; `validateCategories`
  // requires `verb` but not `noun`, so this guards the empty-noun edge case.
  const axisNoun = axis.noun || "position";
  if (cat.positionAdjective) {
    const adj = cat.positionAdjective[negative ? 1 : 0];
    return `the ${axisVal} ${axisNoun} ${adj} ${lc(value, cat)}`;
  }
  const verb = axis.verb[negative ? 1 : 0];
  const axisObject = axis.valueSuffix
    ? `${axisVal} ${axis.valueSuffix}`
    : axisVal;
  return `${label(value, grid)} ${verb} ${axisObject}`;
}

/**
 * Format a multi-position reference using the pinned axis's verb with a
 * disjunctive list of values:
 *   "Alice lives in the first or second house"
 *   "Dan has a return of 3%, 5%, or 8%"
 *
 * For positionAdjective categories, uses the bare adjective as subject with
 * the adjective verb: "red is the first or second house".
 */
export function formatAtMulti(
  value: string,
  positions: number[],
  grid: Grid,
  negative: boolean,
): string {
  // Degenerate case: a single position is the formatAtSingle contract.
  // joinOr handles length-1 gracefully; mirror that here so callers don't
  // hit the broken "neither , nor the first house" output from the nor-path
  // when positions.length === 1.
  if (positions.length === 1) {
    return formatAtSingle(value, positions[0], grid, negative);
  }
  const cat = findCategory(value, grid);
  const axis = pinnedAxis(grid);
  if (!axis) throw new RangeError("Grid has no ordered category");
  // Same contract as formatAtSingle: a pinned-axis value as subject would
  // produce a tautology against its own anchor slot. Unreachable in current
  // callers (pinned-axis values are size-1 and route through formatAtSingle
  // via describeKnown/describeResult's assign path), but the symmetric guard
  // keeps the two helpers' preconditions honest.
  if (axis.values.includes(value)) {
    throw new RangeError(
      `formatAtMulti: "${value}" is a pinned-axis value; use it as the anchor, not the subject`,
    );
  }
  const axisNoun = axis.noun || "position";
  const posStrOr = joinOr(positions.map((p) => axis.values[p]));
  if (cat.positionAdjective) {
    const posAdj = cat.positionAdjective[0];
    // Negative multi-pos: classical "neither...nor" with the pinned-axis
    // values as subject. De Morgan-explicit ("red is not the A or B" is
    // ambiguous) and naturally ordered ("neither the first nor the fourth
    // house is red" reads in the same rhythm as the singular PA flip
    // "the first house is not red"). Singular verb agrees with "neither…nor".
    if (negative) {
      // "neither the first nor the fourth house" / "neither the first, the
      // second, nor the fourth house". Each item gets "the " prepended so
      // the disjunction reads definite; `joinWith` handles the 2-vs-3+
      // shape uniformly.
      const withThe = positions.map((p) => `the ${axis.values[p]}`);
      return `neither ${joinWith(withThe, "nor")} ${axisNoun} ${posAdj} ${lc(value, cat)}`;
    }
    // Positive multi-pos: bare adjective as subject ("red") with the
    // positionAdjective verb and a singular disjunction. Reads
    // distributively — "red is the first or second house" = "one of these
    // houses is red" — without needing the neither-nor flip the negative
    // case uses, and without the double-noun problem the non-PA fallback
    // would hit ("the red house is in the first or second house").
    return `${lc(value, cat)} ${posAdj} the ${posStrOr} ${axisNoun}`;
  }
  const axisObjects = axis.valueSuffix
    ? `${posStrOr} ${axis.valueSuffix}`
    : posStrOr;
  const verb = axis.verb[negative ? 1 : 0];
  return `${label(value, grid)} ${verb} ${axisObjects}`;
}

/** Convert a constraint into a human-readable English clue. */
export function renderClue(constraint: Constraint, grid: Grid): Clue {
  const text = renderText(constraint, grid);
  return { constraint, text };
}

/**
 * Render a between/not_between clue. The axis's authored comparator (e.g.
 * "lives somewhere between") assumes the middle is a person-like subject
 * that can "live". For a middle whose category has `positionAdjective` —
 * the value is an adjective describing the axis noun (Red → house) — the
 * "lives" verb breaks. Swap to the adjective verb so the subject-noun-pair
 * ("the red house") composes with "is" / "is not" instead.
 */
function renderBetween(
  constraint: {
    outer1: string;
    middle: string;
    outer2: string;
    axis: string;
  },
  grid: Grid,
  negative: boolean,
): string {
  const lm = label(constraint.middle, grid);
  const lo1 = label(constraint.outer1, grid);
  const lo2 = label(constraint.outer2, grid);
  const middleCat = findCategory(constraint.middle, grid);
  let comp: string;
  if (middleCat.positionAdjective) {
    // "The red house is between X and Y" / "The red house is not between X and Y".
    comp = `${middleCat.positionAdjective[negative ? 1 : 0]} between`;
  } else {
    comp = symmetricComp(
      grid,
      negative ? "not_between" : "between",
      constraint.axis,
    );
  }
  return `${capitalize(lm)} ${comp} ${lo1} and ${lo2}.`;
}

// --- Same-position rendering ---

function renderSamePosition(
  constraint: { a: string; b: string },
  grid: Grid,
  negative: boolean,
): string {
  const catA = findCategory(constraint.a, grid);
  const catB = findCategory(constraint.b, grid);
  const idx = negative ? 1 : 0;

  // Position-adjective path: if one side has positionAdjective and the other
  // is an ordered category, render the ordered value as subject with the
  // adjective verb. Recovers the classical Color+House idiom:
  // `same_position(Red, "1st")` → "The 1st house is red."
  if (catA.positionAdjective && catB.ordered === true) {
    return `${capitalize(label(constraint.b, grid))} ${catA.positionAdjective[idx]} ${lc(constraint.a, catA)}.`;
  }
  if (catB.positionAdjective && catA.ordered === true) {
    return `${capitalize(label(constraint.a, grid))} ${catB.positionAdjective[idx]} ${lc(constraint.b, catB)}.`;
  }

  const [subj, obj] = orderedPair(constraint.a, constraint.b, grid);
  const objCat = findCategory(obj, grid);
  const verb = objCat.verb;
  if (!verb) {
    throw new Error(
      `Cannot render same_position: category "${objCat.name}" has no verb`,
    );
  }
  return `${capitalize(label(subj, grid))} ${verb[idx]} ${objectValue(obj, grid)}.`;
}

// --- Main renderer ---

function renderText(constraint: Constraint, grid: Grid): string {
  switch (constraint.type) {
    case "same_position":
      return renderSamePosition(constraint, grid, false);
    case "not_same_position":
      return renderSamePosition(constraint, grid, true);
    case "next_to": {
      const [s, o] = orderedPair(constraint.a, constraint.b, grid);
      const comp = symmetricComp(grid, "next_to", constraint.axis);
      return `${capitalize(label(s, grid))} ${comp} ${label(o, grid)}.`;
    }
    case "not_next_to": {
      const [s, o] = orderedPair(constraint.a, constraint.b, grid);
      const comp = symmetricComp(grid, "not_next_to", constraint.axis);
      return `${capitalize(label(s, grid))} ${comp} ${label(o, grid)}.`;
    }
    case "left_of": {
      const comp = directionalComp(
        grid,
        "left_of",
        constraint.a,
        constraint.b,
        constraint.axis,
      );
      return `${capitalize(label(comp.subject, grid))} ${comp.phrase} ${label(comp.object, grid)}.`;
    }
    case "between":
      return renderBetween(constraint, grid, false);
    case "not_between":
      return renderBetween(constraint, grid, true);
    case "before": {
      const comp = directionalComp(
        grid,
        "before",
        constraint.a,
        constraint.b,
        constraint.axis,
      );
      return `${capitalize(label(comp.subject, grid))} ${comp.phrase} ${label(comp.object, grid)}.`;
    }
    case "exact_distance": {
      const [s, o] = orderedPair(constraint.a, constraint.b, grid);
      const la = label(s, grid);
      const lb = label(o, grid);
      const axisCategory = resolveAxis(grid, constraint.axis);
      const unit = axisCategory.orderingPhrases?.unit;
      const prefix = symmetricComp(grid, "exact_distance", constraint.axis);
      if (unit) {
        const unitNoun = constraint.distance === 1 ? unit[0] : unit[1];
        return `${capitalize(la)} ${prefix} ${constraint.distance} ${unitNoun} from ${lb}.`;
      }
      return `${capitalize(la)} ${prefix} ${constraint.distance} from ${lb}.`;
    }
  }
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
