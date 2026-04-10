import type {
  Category,
  Constraint,
  Clue,
  Grid,
  OrderingComparatorType,
} from "../types";
import { orderedCategories, resolveAxis } from "../axis";

function findCategory(value: string, grid: Grid): Category {
  for (const cat of grid.categories) {
    if (cat.values.includes(value)) return cat;
  }
  throw new Error(`Unknown value: ${value}`);
}

/** Natural noun phrase: "Alice", "the red house", "the cat owner". */
function label(value: string, grid: Grid): string {
  const noun = findCategory(value, grid).noun;
  if (!noun) return value;
  return `the ${value.toLowerCase()} ${noun}`;
}

/** Value as it appears in the object position of a same_position clue. */
function objectValue(value: string, grid: Grid): string {
  const cat = findCategory(value, grid);
  const suffix = cat.valueSuffix;
  return suffix ? `${value.toLowerCase()} ${suffix}` : value.toLowerCase();
}

/** Look up a comparator phrase from the axis category's orderingPhrases. */
function comparator(
  grid: Grid,
  type: OrderingComparatorType,
  axisName: string,
): string | [string, string] {
  const axis = resolveAxis(grid, axisName);
  return axis.orderingPhrases.comparators[type];
}

/**
 * Resolve a symmetric comparator. Tuples on symmetric types are rejected
 * by validateGrid in the generator, so we trust the type at render time.
 */
function symmetricComp(
  grid: Grid,
  type: OrderingComparatorType,
  axisName: string,
): string {
  return comparator(grid, type, axisName) as string;
}

/**
 * Pick the directional comparator phrase. For tuples, uses `ordered()` to
 * decide which side becomes the subject (priority first, then hash tiebreaker)
 * and selects the matching forward/reverse phrase. For string comparators,
 * always uses constraint.a as subject (forward only).
 */
function directionalComp(
  grid: Grid,
  type: OrderingComparatorType,
  a: string,
  b: string,
  axisName: string,
): { subject: string; object: string; phrase: string } {
  const c = comparator(grid, type, axisName);
  if (typeof c === "string") {
    return { subject: a, object: b, phrase: c };
  }
  const [s] = ordered(a, b, grid);
  return s === a
    ? { subject: a, object: b, phrase: c[0] }
    : { subject: b, object: a, phrase: c[1] };
}

/**
 * Return [subject, object] ordered by subjectPriority (higher first). Ties are
 * broken by a deterministic hash so the same constraint pair always renders
 * the same way, but different pairs vary across left/right phrasings.
 */
function ordered(a: string, b: string, grid: Grid): [string, string] {
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

/** Convert a constraint into a human-readable English clue. */
export function renderClue(constraint: Constraint, grid: Grid): Clue {
  const text = renderText(constraint, grid);
  return { constraint, text };
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
    return `${capitalize(label(constraint.b, grid))} ${catA.positionAdjective[idx]} ${constraint.a.toLowerCase()}.`;
  }
  if (catB.positionAdjective && catA.ordered === true) {
    return `${capitalize(label(constraint.a, grid))} ${catB.positionAdjective[idx]} ${constraint.b.toLowerCase()}.`;
  }

  const [subj, obj] = ordered(constraint.a, constraint.b, grid);
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
      const [s, o] = ordered(constraint.a, constraint.b, grid);
      const comp = symmetricComp(grid, "next_to", constraint.axis);
      return `${capitalize(label(s, grid))} ${comp} ${label(o, grid)}.`;
    }
    case "not_next_to": {
      const [s, o] = ordered(constraint.a, constraint.b, grid);
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
    case "between": {
      const lm = label(constraint.middle, grid);
      const lo1 = label(constraint.outer1, grid);
      const lo2 = label(constraint.outer2, grid);
      const comp = symmetricComp(grid, "between", constraint.axis);
      return `${capitalize(lm)} ${comp} ${lo1} and ${lo2}.`;
    }
    case "not_between": {
      const lm = label(constraint.middle, grid);
      const lo1 = label(constraint.outer1, grid);
      const lo2 = label(constraint.outer2, grid);
      const comp = symmetricComp(grid, "not_between", constraint.axis);
      return `${capitalize(lm)} ${comp} ${lo1} and ${lo2}.`;
    }
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
      const [s, o] = ordered(constraint.a, constraint.b, grid);
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
    case "at_position": {
      // Render using the first ordered category's value at this position.
      const axis = orderedCategories(grid)[0];
      if (!axis) throw new Error("Grid has no ordered category");
      const axisVal = axis.values[constraint.position];
      const cat = findCategory(constraint.value, grid);
      if (cat.positionAdjective) {
        return `${capitalize(label(axisVal, grid))} ${cat.positionAdjective[0]} ${constraint.value.toLowerCase()}.`;
      }
      return `${capitalize(label(constraint.value, grid))} ${axis.verb[0]} ${objectValue(axisVal, grid)}.`;
    }
    case "not_at_position": {
      const axis = orderedCategories(grid)[0];
      if (!axis) throw new Error("Grid has no ordered category");
      const axisVal = axis.values[constraint.position];
      const cat = findCategory(constraint.value, grid);
      if (cat.positionAdjective) {
        return `${capitalize(label(axisVal, grid))} ${cat.positionAdjective[1]} ${constraint.value.toLowerCase()}.`;
      }
      return `${capitalize(label(constraint.value, grid))} ${axis.verb[1]} ${objectValue(axisVal, grid)}.`;
    }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
