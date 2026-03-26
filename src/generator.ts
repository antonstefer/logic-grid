import { Puzzle, GenerateOptions, Grid, Solution, Constraint, Category, Difficulty, Assignment } from './types';
import { createSolverContext, encodeConstraintCached, isUniqueFast, SolverContext } from './solver';
import { renderClue } from './clues/templates';
import { classify } from './difficulty';

const DEFAULT_CATEGORIES: Category[] = [
  { name: 'Name', values: ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'] },
  { name: 'Color', values: ['Red', 'Blue', 'Green', 'Yellow', 'White', 'Orange'] },
  { name: 'Pet', values: ['Cat', 'Dog', 'Fish', 'Bird', 'Rabbit', 'Turtle'] },
  { name: 'Drink', values: ['Tea', 'Coffee', 'Water', 'Milk', 'Juice', 'Soda'] },
  { name: 'Food', values: ['Pizza', 'Pasta', 'Sushi', 'Tacos', 'Salad', 'Steak'] },
  { name: 'Hobby', values: ['Reading', 'Painting', 'Cooking', 'Running', 'Chess', 'Gardening'] },
];

const EASY_TYPES: Set<Constraint['type']> = new Set([
  'same_house', 'not_same_house', 'at_position', 'not_at_position',
]);

const MEDIUM_TYPES: Set<Constraint['type']> = new Set([
  ...EASY_TYPES, 'next_to', 'left_of',
]);

const MAX_RETRIES = 100;

export function generate(options?: GenerateOptions): Puzzle {
  const size = options?.size ?? 4;
  const numCategories = options?.categories ?? 4;
  const difficulty = options?.difficulty;
  const rng = createRng(options?.seed);

  const grid = buildGrid(size, numCategories, options?.categoryNames);
  const solverCtx = createSolverContext(grid);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const solution = randomSolution(grid, rng);
    const allConstraints = enumerateConstraints(solution, grid);

    // Filter by difficulty before minimization
    const filtered = difficulty
      ? filterByDifficulty(allConstraints, difficulty)
      : allConstraints;

    shuffle(filtered, rng);

    // Pre-encode all constraint clauses once
    const clauseCache = filtered.map(c => encodeConstraintCached(c, solverCtx));

    // Check if filtered constraints can produce a unique solution
    if (!isUniqueFast(solverCtx.baseClauses, clauseCache, solverCtx.allVars)) continue;

    const minimal = minimizeConstraints(filtered, clauseCache, solverCtx, rng);
    const actualDifficulty = classify(minimal, grid);

    // If specific difficulty requested and doesn't match, retry
    if (difficulty && actualDifficulty !== difficulty) continue;

    const clues = minimal.map(c => renderClue(c, grid));

    return {
      grid,
      constraints: minimal,
      clues,
      solution,
      difficulty: actualDifficulty,
    };
  }

  throw new Error(
    `Failed to generate a puzzle after ${MAX_RETRIES} attempts. ` +
    `Try different options (larger size or different difficulty).`
  );
}

function buildGrid(size: number, numCategories: number, categoryNames?: Category[]): Grid {
  let categories: Category[];

  if (categoryNames) {
    categories = categoryNames.map(c => ({
      name: c.name,
      values: c.values.slice(0, size),
    }));
  } else {
    categories = DEFAULT_CATEGORIES.slice(0, numCategories).map(c => ({
      name: c.name,
      values: c.values.slice(0, size),
    }));
  }

  return { size, categories };
}

function randomSolution(grid: Grid, rng: () => number): Solution {
  return grid.categories.map(cat => {
    const positions = Array.from({ length: grid.size }, (_, i) => i);
    shuffle(positions, rng);
    const assignment: Assignment = {};
    for (let i = 0; i < cat.values.length; i++) {
      assignment[cat.values[i]] = positions[i];
    }
    return assignment;
  });
}

function enumerateConstraints(solution: Solution, grid: Grid): Constraint[] {
  const constraints: Constraint[] = [];
  const n = grid.size;

  // Build value→position map across all categories
  const posOf = new Map<string, number>();
  const catOf = new Map<string, number>();
  for (let ci = 0; ci < solution.length; ci++) {
    for (const [val, pos] of Object.entries(solution[ci])) {
      posOf.set(val, pos);
      catOf.set(val, ci);
    }
  }

  const allValues = [...posOf.keys()];

  // Pairwise constraints between values of different categories
  // For larger grids, limit negative constraints (not_same_house, not_next_to)
  // to keep the constraint set manageable for minimization
  const maxNegative = n <= 4 ? Infinity : n * n * 2;
  let negativeCount = 0;

  for (let i = 0; i < allValues.length; i++) {
    const a = allValues[i];
    const posA = posOf.get(a)!;
    const catA = catOf.get(a)!;

    for (let j = i + 1; j < allValues.length; j++) {
      const b = allValues[j];
      if (catOf.get(b) === catA) continue;

      const posB = posOf.get(b)!;

      if (posA === posB) {
        constraints.push({ type: 'same_house', a, b });
      } else if (negativeCount < maxNegative) {
        constraints.push({ type: 'not_same_house', a, b });
        negativeCount++;
      }

      if (Math.abs(posA - posB) === 1) {
        constraints.push({ type: 'next_to', a, b });
      } else if (posA !== posB && negativeCount < maxNegative) {
        constraints.push({ type: 'not_next_to', a, b });
        negativeCount++;
      }

      if (posA === posB - 1) {
        constraints.push({ type: 'left_of', a, b });
      }
      if (posB === posA - 1) {
        constraints.push({ type: 'left_of', a: b, b: a });
      }
    }
  }

  // Between constraints (triples from different categories)
  // Only enumerate triples where all 3 values are from different categories
  // and positions are consecutive-ish (gap ≤ n-1, which is always true, but
  // we cap the total to avoid combinatorial explosion on larger grids)
  const betweenConstraints: Constraint[] = [];
  for (let i = 0; i < allValues.length; i++) {
    for (let j = i + 1; j < allValues.length; j++) {
      for (let k = j + 1; k < allValues.length; k++) {
        const vals = [allValues[i], allValues[j], allValues[k]];
        const cats = vals.map(v => catOf.get(v)!);
        if (cats[0] === cats[1] || cats[0] === cats[2] || cats[1] === cats[2]) continue;

        const positions = vals.map(v => posOf.get(v)!);
        for (let m = 0; m < 3; m++) {
          const outers = [0, 1, 2].filter(x => x !== m);
          const lo = Math.min(positions[outers[0]], positions[outers[1]]);
          const hi = Math.max(positions[outers[0]], positions[outers[1]]);
          if (positions[m] > lo && positions[m] < hi) {
            const [o1, o2] = vals[outers[0]] < vals[outers[1]]
              ? [vals[outers[0]], vals[outers[1]]]
              : [vals[outers[1]], vals[outers[0]]];
            betweenConstraints.push({
              type: 'between',
              outer1: o1,
              middle: vals[m],
              outer2: o2,
            });
          }
        }
      }
    }
  }
  // Cap between constraints to avoid slow minimization
  constraints.push(...betweenConstraints.slice(0, 50));

  // Position constraints
  const notAtPositionConstraints: Constraint[] = [];
  for (const [val, pos] of posOf) {
    constraints.push({ type: 'at_position', value: val, position: pos });
    for (let p = 0; p < n; p++) {
      if (p !== pos) {
        notAtPositionConstraints.push({ type: 'not_at_position', value: val, position: p });
      }
    }
  }
  // Cap not_at_position for larger grids
  constraints.push(...notAtPositionConstraints.slice(0, n <= 4 ? notAtPositionConstraints.length : n * n));

  return deduplicateConstraints(constraints);
}

function deduplicateConstraints(constraints: Constraint[]): Constraint[] {
  const seen = new Set<string>();
  const result: Constraint[] = [];

  for (const c of constraints) {
    const key = constraintKey(c);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  }

  return result;
}

function constraintKey(c: Constraint): string {
  switch (c.type) {
    case 'same_house':
    case 'not_same_house':
    case 'next_to':
    case 'not_next_to': {
      // Symmetric: sort pair
      const [a, b] = c.a < c.b ? [c.a, c.b] : [c.b, c.a];
      return `${c.type}:${a}:${b}`;
    }
    case 'left_of':
      return `left_of:${c.a}:${c.b}`;
    case 'between': {
      const [o1, o2] = c.outer1 < c.outer2
        ? [c.outer1, c.outer2]
        : [c.outer2, c.outer1];
      return `between:${o1}:${c.middle}:${o2}`;
    }
    case 'at_position':
      return `at_position:${c.value}:${c.position}`;
    case 'not_at_position':
      return `not_at_position:${c.value}:${c.position}`;
  }
}

function filterByDifficulty(constraints: Constraint[], difficulty: Difficulty): Constraint[] {
  const allowedTypes = difficulty === 'easy'
    ? EASY_TYPES
    : difficulty === 'medium'
      ? MEDIUM_TYPES
      : null; // hard allows all types

  if (!allowedTypes) return constraints;
  return constraints.filter(c => allowedTypes.has(c.type));
}

// Higher = more informative, added first in constructive phase
const INFORMATIVENESS: Record<string, number> = {
  at_position: 7,
  same_house: 6,
  left_of: 5,
  next_to: 4,
  between: 3,
  not_next_to: 2,
  not_same_house: 1,
  not_at_position: 0,
};

function minimizeConstraints(
  constraints: Constraint[],
  clauseCache: number[][][],
  solverCtx: SolverContext,
  rng: () => number,
): Constraint[] {
  const { baseClauses, allVars } = solverCtx;

  // Build index mapping: track which constraints and their cached clauses
  const indices = Array.from({ length: constraints.length }, (_, i) => i);

  // Sort by informativeness (most informative first) with randomness within tiers
  indices.sort((a, b) => {
    const ia = INFORMATIVENESS[constraints[a].type] ?? 3;
    const ib = INFORMATIVENESS[constraints[b].type] ?? 3;
    if (ia !== ib) return ib - ia;
    return rng() - 0.5;
  });

  // Phase 1: Constructive — add constraints until puzzle has unique solution
  const selected = new Set<number>();
  for (const idx of indices) {
    selected.add(idx);
    const activeClauses = [...selected].map(i => clauseCache[i]);
    if (isUniqueFast(baseClauses, activeClauses, allVars)) {
      break;
    }
  }

  // Phase 2: Destructive — remove redundant constraints from selected set
  const selectedArr = [...selected];
  // Try removing least informative first
  selectedArr.sort((a, b) => {
    const ia = INFORMATIVENESS[constraints[a].type] ?? 3;
    const ib = INFORMATIVENESS[constraints[b].type] ?? 3;
    return ia - ib;
  });

  for (const idx of selectedArr) {
    selected.delete(idx);
    const activeClauses = [...selected].map(i => clauseCache[i]);
    if (!isUniqueFast(baseClauses, activeClauses, allVars)) {
      selected.add(idx); // needed, keep it
    }
  }

  return [...selected].map(i => constraints[i]);
}

// Seeded PRNG (xorshift32)
function createRng(seed?: number): () => number {
  if (seed === undefined) {
    return Math.random;
  }
  let state = seed | 0;
  if (state === 0) state = 1;
  return () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
