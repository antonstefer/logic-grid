import { Constraint, Clue, Grid } from '../types';

export function renderClue(constraint: Constraint, grid: Grid): Clue {
  const text = renderText(constraint, grid);
  return { constraint, text };
}

function findCategory(value: string, grid: Grid): string {
  for (const cat of grid.categories) {
    if (cat.values.includes(value)) return cat.name;
  }
  return 'unknown';
}

function label(value: string, grid: Grid): string {
  const cat = findCategory(value, grid);
  return `the ${value} ${cat.toLowerCase()}`;
}

function renderText(constraint: Constraint, grid: Grid): string {
  switch (constraint.type) {
    case 'same_house': {
      const la = label(constraint.a, grid);
      const lb = label(constraint.b, grid);
      return `${capitalize(la)} is in the same house as ${lb}.`;
    }
    case 'not_same_house': {
      const la = label(constraint.a, grid);
      const lb = label(constraint.b, grid);
      return `${capitalize(la)} is not in the same house as ${lb}.`;
    }
    case 'next_to': {
      const la = label(constraint.a, grid);
      const lb = label(constraint.b, grid);
      return `${capitalize(la)} is next to ${lb}.`;
    }
    case 'not_next_to': {
      const la = label(constraint.a, grid);
      const lb = label(constraint.b, grid);
      return `${capitalize(la)} is not next to ${lb}.`;
    }
    case 'left_of': {
      const la = label(constraint.a, grid);
      const lb = label(constraint.b, grid);
      return `${capitalize(la)} is directly left of ${lb}.`;
    }
    case 'between': {
      const lm = label(constraint.middle, grid);
      const lo1 = label(constraint.outer1, grid);
      const lo2 = label(constraint.outer2, grid);
      return `${capitalize(lm)} is between ${lo1} and ${lo2}.`;
    }
    case 'at_position': {
      const lv = label(constraint.value, grid);
      return `${capitalize(lv)} is in position ${constraint.position + 1}.`;
    }
    case 'not_at_position': {
      const lv = label(constraint.value, grid);
      return `${capitalize(lv)} is not in position ${constraint.position + 1}.`;
    }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
