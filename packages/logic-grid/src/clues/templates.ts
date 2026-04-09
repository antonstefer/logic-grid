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
): string | undefined {
  return grid.spatialWords.comparators?.[type];
}

/** Return [subject, object] ordered by subjectPriority (higher first). */
function ordered(a: string, b: string, grid: Grid): [string, string] {
  const pa = findCategory(a, grid).subjectPriority ?? 0;
  const pb = findCategory(b, grid).subjectPriority ?? 0;
  return pb > pa ? [b, a] : [a, b];
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

  let subj = constraint.a;
  let obj = constraint.b;
  let objCat = catB;
  if ((catB.subjectPriority ?? 0) > (catA.subjectPriority ?? 0)) {
    subj = constraint.b;
    obj = constraint.a;
    objCat = catA;
  }

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
      const comp = comparator(grid, "next_to");
      return `${capitalize(label(s, grid))} ${comp ?? `${w.verb[0]} ${w.adjacency}`} ${label(o, grid)}.`;
    }
    case "not_next_to": {
      const [s, o] = ordered(constraint.a, constraint.b, grid);
      const comp = comparator(grid, "not_next_to");
      return `${capitalize(label(s, grid))} ${comp ?? `${w.verb[1]} ${w.adjacency}`} ${label(o, grid)}.`;
    }
    case "left_of": {
      const comp = comparator(grid, "left_of");
      if (comp) {
        return `${capitalize(label(constraint.a, grid))} ${comp} ${label(constraint.b, grid)}.`;
      }
      const [s, o] = ordered(constraint.a, constraint.b, grid);
      const dir = s === constraint.a ? w.direction[0] : w.direction[1];
      return `${capitalize(label(s, grid))} ${w.verb[0]} directly ${dir} ${label(o, grid)}.`;
    }
    case "between": {
      const lm = label(constraint.middle, grid);
      const lo1 = label(constraint.outer1, grid);
      const lo2 = label(constraint.outer2, grid);
      const comp = comparator(grid, "between");
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
      const comp = comparator(grid, "not_between");
      if (comp) return `${capitalize(lm)} ${comp} ${lo1} and ${lo2}.`;
      const middleVerb =
        findCategory(constraint.middle, grid).positionAdjective?.[1] ??
        w.verb[1];
      return `${capitalize(lm)} ${middleVerb} ${w.between} ${lo1} and ${lo2}.`;
    }
    case "before": {
      const comp = comparator(grid, "before");
      if (comp) {
        return `${capitalize(label(constraint.a, grid))} ${comp} ${label(constraint.b, grid)}.`;
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
        comparator(grid, "exact_distance") ?? `${w.verb[0]} exactly`;
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
