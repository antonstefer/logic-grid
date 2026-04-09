import type {
  Category,
  Constraint,
  Clue,
  Grid,
  OrderingComparatorType,
} from "../types";
import { posNoun, posNounPlural } from "../grid-utils";

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

function comparator(
  grid: Grid,
  type: OrderingComparatorType,
): string | [string, string] | undefined {
  return grid.spatialWords.comparators?.[type];
}

/**
 * Resolve a symmetric comparator. Tuples on symmetric types are rejected
 * by validateGrid in the generator, so we trust the type at render time.
 */
function symmetricComp(
  grid: Grid,
  type: OrderingComparatorType,
): string | undefined {
  return comparator(grid, type) as string | undefined;
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
): { subject: string; object: string; phrase: string } | undefined {
  const c = comparator(grid, type);
  if (c === undefined) return undefined;
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
  const [subj, obj] = ordered(constraint.a, constraint.b, grid);
  const objCat = findCategory(obj, grid);
  const idx = negative ? 1 : 0;
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
  const w = grid.spatialWords;
  switch (constraint.type) {
    case "same_position":
      return renderSamePosition(constraint, grid, false);
    case "not_same_position":
      return renderSamePosition(constraint, grid, true);
    case "next_to": {
      const [s, o] = ordered(constraint.a, constraint.b, grid);
      const comp = symmetricComp(grid, "next_to");
      return `${capitalize(label(s, grid))} ${comp ?? `${w.verb[0]} ${w.adjacency}`} ${label(o, grid)}.`;
    }
    case "not_next_to": {
      const [s, o] = ordered(constraint.a, constraint.b, grid);
      const comp = symmetricComp(grid, "not_next_to");
      return `${capitalize(label(s, grid))} ${comp ?? `${w.verb[1]} ${w.adjacency}`} ${label(o, grid)}.`;
    }
    case "left_of": {
      const comp = directionalComp(grid, "left_of", constraint.a, constraint.b);
      if (comp) {
        return `${capitalize(label(comp.subject, grid))} ${comp.phrase} ${label(comp.object, grid)}.`;
      }
      const [s, o] = ordered(constraint.a, constraint.b, grid);
      const dir = s === constraint.a ? w.direction[0] : w.direction[1];
      return `${capitalize(label(s, grid))} ${w.verb[0]} directly ${dir} ${label(o, grid)}.`;
    }
    case "between": {
      const lm = label(constraint.middle, grid);
      const lo1 = label(constraint.outer1, grid);
      const lo2 = label(constraint.outer2, grid);
      const comp = symmetricComp(grid, "between");
      if (comp) return `${capitalize(lm)} ${comp} ${lo1} and ${lo2}.`;
      const middleVerb =
        findCategory(constraint.middle, grid).positionAdjective?.[0] ??
        w.verb[0];
      return `${capitalize(lm)} ${middleVerb} ${w.between} ${lo1} and ${lo2}.`;
    }
    case "not_between": {
      const lm = label(constraint.middle, grid);
      const lo1 = label(constraint.outer1, grid);
      const lo2 = label(constraint.outer2, grid);
      const comp = symmetricComp(grid, "not_between");
      if (comp) return `${capitalize(lm)} ${comp} ${lo1} and ${lo2}.`;
      const middleVerb =
        findCategory(constraint.middle, grid).positionAdjective?.[1] ??
        w.verb[1];
      return `${capitalize(lm)} ${middleVerb} ${w.between} ${lo1} and ${lo2}.`;
    }
    case "before": {
      const comp = directionalComp(grid, "before", constraint.a, constraint.b);
      if (comp) {
        return `${capitalize(label(comp.subject, grid))} ${comp.phrase} ${label(comp.object, grid)}.`;
      }
      const [s, o] = ordered(constraint.a, constraint.b, grid);
      const dir = s === constraint.a ? w.direction[0] : w.direction[1];
      return `${capitalize(label(s, grid))} ${w.verb[0]} somewhere ${dir} ${label(o, grid)}.`;
    }
    case "exact_distance": {
      const [s, o] = ordered(constraint.a, constraint.b, grid);
      const la = label(s, grid);
      const lb = label(o, grid);
      const unit = w.distanceUnit;
      const prefix =
        symmetricComp(grid, "exact_distance") ?? `${w.verb[0]} exactly`;
      if (unit) {
        const unitNoun = constraint.distance === 1 ? unit[0] : unit[1];
        return `${capitalize(la)} ${prefix} ${constraint.distance} ${unitNoun} from ${lb}.`;
      }
      const dist = w.cardinals[constraint.distance];
      const noun =
        constraint.distance === 1 ? posNoun(grid) : posNounPlural(grid);
      return `${capitalize(la)} ${prefix} ${dist} ${noun} from ${lb}.`;
    }
    case "at_position": {
      const posLabel = grid.positionLabels[constraint.position];
      const cat = findCategory(constraint.value, grid);
      if (cat.positionAdjective) {
        return `${capitalize(posLabel)} ${cat.positionAdjective[0]} ${constraint.value.toLowerCase()}.`;
      }
      return `${capitalize(label(constraint.value, grid))} ${w.atPosition[0]} ${posLabel}.`;
    }
    case "not_at_position": {
      const posLabel = grid.positionLabels[constraint.position];
      const cat = findCategory(constraint.value, grid);
      if (cat.positionAdjective) {
        return `${capitalize(posLabel)} ${cat.positionAdjective[1]} ${constraint.value.toLowerCase()}.`;
      }
      return `${capitalize(label(constraint.value, grid))} ${w.atPosition[1]} ${posLabel}.`;
    }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
