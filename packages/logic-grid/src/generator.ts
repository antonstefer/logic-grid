import type {
  Puzzle,
  GenerateOptions,
  Grid,
  Solution,
  Constraint,
  Category,
  Difficulty,
  Assignment,
} from "./types";
import type { SolverContext } from "./solver";
import { createSolverContext, encodeConstraintCached } from "./solver";
import { IncrementalSolver } from "./sat";
import { renderClue } from "./clues/templates";
import { classify } from "./difficulty";

const DEFAULT_CATEGORIES: Category[] = [
  {
    name: "Name",
    values: [
      "Alice",
      "Bob",
      "Carol",
      "Dave",
      "Eve",
      "Frank",
      "Grace",
      "Hank",
      "Ivy",
      "Jack",
      "Karen",
      "Leo",
      "Mia",
      "Nick",
      "Olivia",
    ],
  },
  {
    name: "Color",
    values: [
      "Red",
      "Blue",
      "Green",
      "Yellow",
      "White",
      "Orange",
      "Purple",
      "Pink",
      "Brown",
      "Gray",
      "Teal",
      "Maroon",
      "Navy",
      "Lime",
      "Coral",
    ],
  },
  {
    name: "Pet",
    values: [
      "Cat",
      "Dog",
      "Fish",
      "Bird",
      "Rabbit",
      "Turtle",
      "Hamster",
      "Snake",
      "Parrot",
      "Lizard",
      "Ferret",
      "Frog",
      "Horse",
      "Goat",
      "Duck",
    ],
  },
  {
    name: "Drink",
    values: [
      "Tea",
      "Coffee",
      "Water",
      "Milk",
      "Juice",
      "Soda",
      "Wine",
      "Beer",
      "Cocoa",
      "Lemonade",
      "Cider",
      "Smoothie",
      "Espresso",
      "Matcha",
      "Kombucha",
    ],
  },
  {
    name: "Food",
    values: [
      "Pizza",
      "Pasta",
      "Sushi",
      "Tacos",
      "Salad",
      "Steak",
      "Curry",
      "Soup",
      "Burger",
      "Ramen",
      "Falafel",
      "Paella",
      "Gnocchi",
      "Kebab",
      "Risotto",
    ],
  },
  {
    name: "Hobby",
    values: [
      "Reading",
      "Painting",
      "Cooking",
      "Running",
      "Chess",
      "Gardening",
      "Hiking",
      "Knitting",
      "Singing",
      "Fishing",
      "Yoga",
      "Dancing",
      "Cycling",
      "Writing",
      "Gaming",
    ],
  },
  {
    name: "Music",
    values: [
      "Jazz",
      "Rock",
      "Pop",
      "Blues",
      "Folk",
      "Reggae",
      "Metal",
      "Punk",
      "Soul",
      "Funk",
      "Techno",
      "Opera",
      "Country",
      "Indie",
      "Disco",
    ],
  },
  {
    name: "Sport",
    values: [
      "Soccer",
      "Tennis",
      "Golf",
      "Boxing",
      "Rugby",
      "Cricket",
      "Hockey",
      "Skiing",
      "Fencing",
      "Surfing",
      "Rowing",
      "Archery",
      "Polo",
      "Judo",
      "Squash",
    ],
  },
  {
    name: "Job",
    values: [
      "Doctor",
      "Teacher",
      "Chef",
      "Pilot",
      "Lawyer",
      "Artist",
      "Nurse",
      "Farmer",
      "Writer",
      "Baker",
      "Tailor",
      "Mason",
      "Clerk",
      "Miner",
      "Guard",
    ],
  },
  {
    name: "Transport",
    values: [
      "Car",
      "Bike",
      "Bus",
      "Train",
      "Boat",
      "Plane",
      "Scooter",
      "Tram",
      "Ferry",
      "Taxi",
      "Van",
      "Truck",
      "Metro",
      "Cable",
      "Raft",
    ],
  },
];

const EASY_TYPES: Set<Constraint["type"]> = new Set([
  "same_house",
  "not_same_house",
  "at_position",
  "not_at_position",
]);

const MEDIUM_TYPES: Set<Constraint["type"]> = new Set([
  ...EASY_TYPES,
  "next_to",
  "left_of",
]);

const MAX_RETRIES = 100;

/**
 * Generate a logic grid puzzle with a unique solution and minimal constraint set.
 * Throws if generation fails after 100 retries (e.g. impossible difficulty for grid size).
 */
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
    const clauseCache = filtered.map((c) =>
      encodeConstraintCached(c, solverCtx),
    );

    // Build ONE incremental solver with activation literals for all constraints
    const incSolver = buildIncrementalSolver(solverCtx, clauseCache);
    if (!incSolver) continue; // base clauses contradictory (shouldn't happen)

    // Check if all constraints together produce a unique solution
    const allActive = Array.from({ length: filtered.length }, () => true);
    if (
      !checkUnique(
        incSolver.solver,
        incSolver.actBase,
        filtered.length,
        allActive,
      )
    )
      continue;

    const minimal = minimizeConstraints(filtered, incSolver, rng);
    const actualDifficulty = classify(minimal, grid);

    // If specific difficulty requested and doesn't match, retry
    if (difficulty && actualDifficulty !== difficulty) continue;

    const clues = minimal.map((c) => renderClue(c, grid));

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
      `Try different options (larger size or different difficulty).`,
  );
}

function buildGrid(
  size: number,
  numCategories: number,
  categoryNames?: Category[],
): Grid {
  let categories: Category[];

  if (categoryNames) {
    categories = categoryNames.map((c) => ({
      name: c.name,
      values: padValues(c.values, size, c.name),
    }));
  } else {
    categories = DEFAULT_CATEGORIES.slice(0, numCategories).map((c) => ({
      name: c.name,
      values: padValues(c.values, size, c.name),
    }));
  }

  return { size, categories };
}

/** Extend a value pool to the requested size with generated names if needed. */
function padValues(pool: string[], size: number, catName: string): string[] {
  if (pool.length >= size) return pool.slice(0, size);
  const values = [...pool];
  for (let i = pool.length; i < size; i++) {
    values.push(`${catName}${i + 1}`);
  }
  return values;
}

function randomSolution(grid: Grid, rng: () => number): Solution {
  return grid.categories.map((cat) => {
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

  // Build indexed arrays for fast access (avoid Map lookups in hot loops)
  const allValues: string[] = [];
  const posArr: number[] = [];
  const catArr: number[] = [];
  for (let ci = 0; ci < solution.length; ci++) {
    for (const [val, pos] of Object.entries(solution[ci])) {
      allValues.push(val);
      posArr.push(pos);
      catArr.push(ci);
    }
  }
  // Also keep a Map for position constraints below
  const posOf = new Map<string, number>();
  for (let i = 0; i < allValues.length; i++) posOf.set(allValues[i], posArr[i]);

  // Negative constraints (not_same_house, not_next_to) grow O(n²) and are rarely
  // essential for uniqueness — cap them to keep the minimization set tractable.
  const maxNegative = n <= 4 ? Infinity : n * n * 2;
  let negativeCount = 0;

  for (let i = 0; i < allValues.length; i++) {
    const a = allValues[i];
    const posA = posArr[i];
    const catA = catArr[i];

    for (let j = i + 1; j < allValues.length; j++) {
      if (catArr[j] === catA) continue;
      const b = allValues[j];
      const posB = posArr[j];

      if (posA === posB) {
        constraints.push({ type: "same_house", a, b });
      } else if (negativeCount < maxNegative) {
        constraints.push({ type: "not_same_house", a, b });
        negativeCount++;
      }

      if (Math.abs(posA - posB) === 1) {
        constraints.push({ type: "next_to", a, b });
      } else if (posA !== posB && negativeCount < maxNegative) {
        constraints.push({ type: "not_next_to", a, b });
        negativeCount++;
      }

      if (posA === posB - 1) {
        constraints.push({ type: "left_of", a, b });
      }
      if (posB === posA - 1) {
        constraints.push({ type: "left_of", a: b, b: a });
      }
    }
  }

  // Between constraints (triples from different categories)
  // Cap at 50 to avoid slow minimization — stop enumeration early
  const maxBetween = 50;
  let betweenCount = 0;
  outer: for (
    let i = 0;
    i < allValues.length && betweenCount < maxBetween;
    i++
  ) {
    const ai = allValues[i],
      catAi = catArr[i],
      posAi = posArr[i];
    for (
      let j = i + 1;
      j < allValues.length && betweenCount < maxBetween;
      j++
    ) {
      const catAj = catArr[j];
      if (catAj === catAi) continue;
      const aj = allValues[j],
        posAj = posArr[j];
      for (let k = j + 1; k < allValues.length; k++) {
        const catAk = catArr[k];
        if (catAk === catAi || catAk === catAj) continue;
        const ak = allValues[k],
          posAk = posArr[k];
        // Check each of the 3 values as potential middle
        const vals = [ai, aj, ak];
        const positions = [posAi, posAj, posAk];
        for (let m = 0; m < 3; m++) {
          const o0 = m === 0 ? 1 : 0;
          const o1 = m === 2 ? 1 : 2;
          const lo = Math.min(positions[o0], positions[o1]);
          const hi = Math.max(positions[o0], positions[o1]);
          if (positions[m] > lo && positions[m] < hi) {
            const [v1, v2] =
              vals[o0] < vals[o1] ? [vals[o0], vals[o1]] : [vals[o1], vals[o0]];
            constraints.push({
              type: "between",
              outer1: v1,
              middle: vals[m],
              outer2: v2,
            });
            if (++betweenCount >= maxBetween) continue outer;
          }
        }
      }
    }
  }

  // Position constraints
  const notAtPositionConstraints: Constraint[] = [];
  for (const [val, pos] of posOf) {
    constraints.push({ type: "at_position", value: val, position: pos });
    for (let p = 0; p < n; p++) {
      if (p !== pos) {
        notAtPositionConstraints.push({
          type: "not_at_position",
          value: val,
          position: p,
        });
      }
    }
  }
  // Cap not_at_position for larger grids
  constraints.push(
    ...notAtPositionConstraints.slice(
      0,
      n <= 4 ? notAtPositionConstraints.length : n * n,
    ),
  );

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
    case "same_house":
    case "not_same_house":
    case "next_to":
    case "not_next_to": {
      // Symmetric: sort pair
      const [a, b] = c.a < c.b ? [c.a, c.b] : [c.b, c.a];
      return `${c.type}:${a}:${b}`;
    }
    case "left_of":
      return `left_of:${c.a}:${c.b}`;
    case "between": {
      const [o1, o2] =
        c.outer1 < c.outer2 ? [c.outer1, c.outer2] : [c.outer2, c.outer1];
      return `between:${o1}:${c.middle}:${o2}`;
    }
    case "at_position":
      return `at_position:${c.value}:${c.position}`;
    case "not_at_position":
      return `not_at_position:${c.value}:${c.position}`;
  }
}

function filterByDifficulty(
  constraints: Constraint[],
  difficulty: Difficulty,
): Constraint[] {
  const allowedTypes =
    difficulty === "easy"
      ? EASY_TYPES
      : difficulty === "medium"
        ? MEDIUM_TYPES
        : null; // hard allows all types

  if (!allowedTypes) return constraints;
  return constraints.filter((c) => allowedTypes.has(c.type));
}

// Constraint types ranked by how much they narrow the solution space.
// Constructive phase adds high-informativeness constraints first to reach
// uniqueness in fewer SAT calls; destructive phase removes low ones first.
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

interface IncSolverCtx {
  solver: IncrementalSolver;
  actBase: number;
  total: number;
}

/**
 * Build a single solver for all minimization checks. Each constraint's clauses
 * are guarded by an activation literal: [-act_i, ...clause]. Setting act_i true
 * enables the constraint; false disables it. This avoids rebuilding the solver
 * for each uniqueness check — just change the assumptions.
 */
function buildIncrementalSolver(
  solverCtx: SolverContext,
  clauseCache: number[][][],
): IncSolverCtx | null {
  let maxVar = 0;
  for (const clause of solverCtx.baseClauses) {
    for (const lit of clause) {
      const v = lit > 0 ? lit : -lit;
      if (v > maxVar) maxVar = v;
    }
  }
  for (const clauses of clauseCache) {
    for (const clause of clauses) {
      for (const lit of clause) {
        const v = lit > 0 ? lit : -lit;
        if (v > maxVar) maxVar = v;
      }
    }
  }
  const actBase = maxVar + 1;
  const total = clauseCache.length;

  const allClauses: number[][] = [...solverCtx.baseClauses];
  for (let i = 0; i < total; i++) {
    const actVar = actBase + i;
    for (const clause of clauseCache[i]) {
      allClauses.push([-actVar, ...clause]);
    }
  }

  const solver = new IncrementalSolver(allClauses);
  if (!solver.init()) return null;

  return { solver, actBase, total };
}

function checkUnique(
  solver: IncrementalSolver,
  actBase: number,
  total: number,
  active: boolean[],
): boolean {
  const assumptions = new Array<number>(total);
  for (let i = 0; i < total; i++) {
    assumptions[i] = active[i] ? actBase + i : -(actBase + i);
  }
  return solver.isUniqueUnder(assumptions);
}

function minimizeConstraints(
  constraints: Constraint[],
  incSolver: IncSolverCtx,
  rng: () => number,
): Constraint[] {
  const { solver, actBase, total } = incSolver;

  const indices = Array.from({ length: constraints.length }, (_, i) => i);

  // Sort by informativeness (most informative first) with randomness within tiers
  indices.sort((a, b) => {
    const ia = INFORMATIVENESS[constraints[a].type] ?? 3;
    const ib = INFORMATIVENESS[constraints[b].type] ?? 3;
    if (ia !== ib) return ib - ia;
    return rng() - 0.5;
  });

  // Phase 1: Binary search for the smallest prefix (in informativeness order)
  // that yields a unique solution. O(log n) SAT calls instead of O(n).
  const active = new Array<boolean>(total).fill(false);
  let lo = 1;
  let hi = indices.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    // Activate first `mid` constraints in sorted order
    active.fill(false);
    for (let i = 0; i < mid; i++) active[indices[i]] = true;
    if (checkUnique(solver, actBase, total, active)) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  // Activate the found prefix
  active.fill(false);
  for (let i = 0; i < lo; i++) active[indices[i]] = true;

  // Phase 2: Remove redundant constraints from the prefix. Tries removing
  // groups at once (least informative first) to reduce SAT calls.
  const selected = indices.slice(0, lo);
  selected.reverse();

  batchRemove(selected, solver, actBase, total, active);

  return constraints.filter((_, i) => active[i]);
}

/** Recursively try removing groups of constraints. */
function batchRemove(
  toTry: number[],
  solver: IncrementalSolver,
  actBase: number,
  total: number,
  active: boolean[],
): void {
  if (toTry.length === 0) return;

  if (toTry.length === 1) {
    // Single constraint: try removing it
    const idx = toTry[0];
    active[idx] = false;
    active[idx] = !checkUnique(solver, actBase, total, active);
    return;
  }

  // Try removing all at once
  for (const idx of toTry) active[idx] = false;
  if (checkUnique(solver, actBase, total, active)) return; // all redundant
  for (const idx of toTry) active[idx] = true; // restore

  // Split and recurse
  const mid = toTry.length >> 1;
  batchRemove(toTry.slice(0, mid), solver, actBase, total, active);
  batchRemove(toTry.slice(mid), solver, actBase, total, active);
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
