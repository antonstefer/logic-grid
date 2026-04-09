import type {
  Puzzle,
  GenerateOptions,
  Grid,
  ComparatorMap,
  Solution,
  Constraint,
  Category,
  Difficulty,
  Assignment,
} from "./types";
import type { SolverContext } from "./solver";
import { createSolverContext } from "./solver";
import { encodeConstraint } from "./encoding";
import { IncrementalSolver } from "./sat";
import { renderClue } from "./clues/templates";
import { classify, EASY_TYPES, MEDIUM_TYPES } from "./difficulty";
import { deduce } from "./deduce";
import { orderedCategories, resolveAxis } from "./axis";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_SPATIAL_WORDS,
  DEFAULT_POSITION_NOUN,
  DEFAULT_POSITION_PREPOSITION,
  defaultHouseCategory,
} from "./default-config";

const MAX_RETRIES = 100;

// Symmetric constraint types — comparators must be a single string, not a tuple.
// NOTE: duplicated in logic-grid-ai/src/validation.ts so the AI retry loop can
// catch this without depending on the core package. Keep both lists in sync.
const SYMMETRIC_COMPARATORS = new Set([
  "next_to",
  "not_next_to",
  "between",
  "not_between",
  "exact_distance",
]);

function checkComparators(
  scope: string,
  comparators: ComparatorMap | undefined,
): void {
  if (!comparators) return;
  for (const [type, value] of Object.entries(comparators)) {
    if (Array.isArray(value) && SYMMETRIC_COMPARATORS.has(type)) {
      throw new RangeError(
        `${scope} comparator "${type}" is symmetric and must be a single string, not [forward, reverse]`,
      );
    }
  }
}

/**
 * Validate per-category invariants. Called by buildGrid before the grid is
 * used for anything, so downstream code can rely on these invariants.
 */
function validateCategories(categories: Category[]): void {
  const names = new Set<string>();
  for (const c of categories) {
    if (names.has(c.name)) {
      throw new RangeError(`Duplicate category name "${c.name}"`);
    }
    names.add(c.name);

    if (c.noun !== "" && !c.verb) {
      throw new RangeError(
        `Category "${c.name}" requires a verb (only the person category may omit it)`,
      );
    }

    if (c.ordered === true) {
      if (c.numericValues !== undefined) {
        if (c.numericValues.length !== c.values.length) {
          throw new RangeError(
            `Category "${c.name}" numericValues length must match values length`,
          );
        }
        for (let i = 1; i < c.numericValues.length; i++) {
          if (c.numericValues[i] <= c.numericValues[i - 1]) {
            throw new RangeError(
              `Category "${c.name}" numericValues must be in ascending order`,
            );
          }
        }
      }
      checkComparators(`Category "${c.name}"`, c.orderingPhrases?.comparators);
    }
  }
}

/**
 * Generate a logic grid puzzle with a unique solution and minimal constraint set.
 * Throws if generation fails after 100 retries (e.g. impossible difficulty for grid size).
 */
export function generate(options?: GenerateOptions): Puzzle {
  const size = options?.size ?? 4;
  const numCategories = options?.categories ?? 4;
  if (size < 3 || size > 8) throw new RangeError("size must be 3-8");
  if (numCategories < 3 || numCategories > 8)
    throw new RangeError("categories must be 3-8");
  const difficulty = options?.difficulty;
  const rng = createRng(options?.seed);

  const grid = buildGrid(size, numCategories, options);
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
    const clauseCache = filtered.map((c) => encodeConstraint(solverCtx.ctx, c));

    // Build ONE incremental solver with activation literals for all constraints
    const incSolver = buildIncrementalSolver(solverCtx, clauseCache);

    const minimal = minimizeConstraints(
      filtered,
      incSolver,
      rng,
      grid,
      difficulty !== "expert",
    );
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
      `Try a smaller size or easier difficulty.`,
  );
}

function buildGrid(
  size: number,
  numCategories: number,
  options?: GenerateOptions,
): Grid {
  const categoryNames = options?.categoryNames;
  if (options?.positionNoun !== undefined) {
    const [singular, plural] = options.positionNoun;
    if (!singular || !plural)
      throw new RangeError(
        "positionNoun singular and plural must be non-empty",
      );
  }
  if (
    options?.positionPreposition !== undefined &&
    !options.positionPreposition
  )
    throw new RangeError("positionPreposition must be non-empty");
  let categories: Category[];

  if (categoryNames) {
    if (categoryNames.length < 3 || categoryNames.length > 8) {
      throw new RangeError("categories must be 3-8");
    }
    for (const c of categoryNames) {
      if (c.values.length < size) {
        throw new RangeError(
          `Category "${c.name}" has ${c.values.length} values but size is ${size}`,
        );
      }
    }
    categories = categoryNames.map((c) => sliceCategory(c, size));
    // Ensure at least one ordered category; auto-prepend House if the user's
    // categories include none.
    if (!categories.some((c) => c.ordered === true)) {
      categories = [defaultHouseCategory(size), ...categories];
    }
  } else {
    // Default pool has no ordered category; House is always prepended as the
    // first ordered slot. Total category count is preserved.
    categories = [
      defaultHouseCategory(size),
      ...DEFAULT_CATEGORIES.slice(0, numCategories - 1).map((c) =>
        sliceCategory(c, size),
      ),
    ];
  }

  validateCategories(categories);

  const posNoun = options?.positionNoun ?? DEFAULT_POSITION_NOUN;
  const posPrep = options?.positionPreposition ?? DEFAULT_POSITION_PREPOSITION;

  // Derive spatialWords.atPosition from the custom preposition so that
  // "lives at the 3rd house" etc. flows from a non-default preposition.
  const spatialWords: typeof DEFAULT_SPATIAL_WORDS = {
    ...DEFAULT_SPATIAL_WORDS,
  };
  if (options?.positionPreposition !== undefined) {
    spatialWords.atPosition = [
      `${DEFAULT_SPATIAL_WORDS.verb[0]} ${posPrep}`,
      `${DEFAULT_SPATIAL_WORDS.verb[1]} ${posPrep}`,
    ];
  }

  const grid: Grid = {
    size,
    categories,
    positionNoun: posNoun,
    positionPreposition: posPrep,
    spatialWords,
    displayAxis: options?.displayAxis,
  };
  checkComparators("Grid spatialWords", grid.spatialWords.comparators);

  // Validate displayAxis references an ordered category if set.
  if (grid.displayAxis !== undefined) {
    resolveAxis(grid, grid.displayAxis);
  }
  return grid;
}

/** Copy a user-provided category, slicing values/numericValues to grid size. */
function sliceCategory(c: Category, size: number): Category {
  const noun = c.noun ?? "";
  const subjectPriority = c.subjectPriority ?? (noun === "" ? 2 : 0);
  const base = {
    name: c.name,
    values: c.values.slice(0, size),
    noun,
    verb: c.verb,
    subjectPriority,
  };
  // Spread optional valueSuffix/positionAdjective respecting the discriminated union.
  const withSuffix =
    c.valueSuffix !== undefined
      ? { valueSuffix: c.valueSuffix, positionAdjective: c.positionAdjective }
      : {};
  if (c.ordered === true) {
    return {
      ...base,
      ordered: true,
      numericValues: c.numericValues?.slice(0, size),
      orderingPhrases: c.orderingPhrases,
      ...withSuffix,
    } as Category;
  }
  return { ...base, ...withSuffix } as Category;
}

function randomSolution(grid: Grid, rng: () => number): Solution {
  // Phase 1: identity-assign the first ordered category so row = axis rank for
  // it. This keeps the still-row-based encoder semantically consistent with
  // the axis-tagged comparatives the generator emits. Phase 2 switches the
  // encoder to rank-forbidding and removes identity assignment.
  const firstOrdered = grid.categories.findIndex((c) => c.ordered === true);
  return grid.categories.map((cat, idx) => {
    if (idx === firstOrdered) {
      const assignment: Assignment = {};
      for (let i = 0; i < cat.values.length; i++) {
        assignment[cat.values[i]] = i;
      }
      return assignment;
    }
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

  // Default axis used for all comparative constraints in Phase 1. Phase 3
  // will loop over all ordered axes; for now every comparative is tagged
  // with the first ordered category's name so the existing encoder can
  // still consume it.
  const defaultAxis = orderedCategories(grid)[0];
  /* v8 ignore next 2 */
  if (!defaultAxis)
    throw new Error("Grid has no ordered category after buildGrid");
  const axisName = defaultAxis.name;

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

  // Cap negative pairwise types independently — a shared counter would starve not_next_to.
  const maxPerType = n * n;
  let notSameCount = 0;
  let notNextCount = 0;

  const numVals = defaultAxis.numericValues;

  for (let i = 0; i < allValues.length; i++) {
    const a = allValues[i];
    const posA = posArr[i];
    const catA = catArr[i];

    for (let j = i + 1; j < allValues.length; j++) {
      if (catArr[j] === catA) continue;
      const b = allValues[j];
      const posB = posArr[j];

      if (posA === posB) {
        constraints.push({ type: "same_position", a, b });
      } else if (notSameCount < maxPerType) {
        constraints.push({ type: "not_same_position", a, b });
        notSameCount++;
      }

      if (Math.abs(posA - posB) === 1) {
        constraints.push({ type: "next_to", a, b, axis: axisName });
      } else if (posA !== posB && notNextCount < maxPerType) {
        constraints.push({ type: "not_next_to", a, b, axis: axisName });
        notNextCount++;
      }

      if (posA === posB - 1) {
        constraints.push({ type: "left_of", a, b, axis: axisName });
      }
      if (posB === posA - 1) {
        constraints.push({ type: "left_of", a: b, b: a, axis: axisName });
      }

      // before: a is somewhere left of b (not necessarily adjacent)
      if (posA < posB) {
        constraints.push({ type: "before", a, b, axis: axisName });
      } else if (posB < posA) {
        constraints.push({ type: "before", a: b, b: a, axis: axisName });
      }

      // exact_distance: emit when meaningful (not redundant with other clue types).
      if (numVals) {
        // Value-based distance: emit any non-zero value gap. Even when positions
        // are adjacent, the constraint is more specific than next_to (it pins
        // the exact value pair, not just adjacency).
        const valDist = Math.abs(numVals[posA] - numVals[posB]);
        if (valDist > 0) {
          constraints.push({
            type: "exact_distance",
            a,
            b,
            distance: valDist,
            axis: axisName,
          });
        }
      } else {
        // Position-based: distance 1 is exactly equivalent to next_to, skip it.
        const dist = Math.abs(posA - posB);
        if (dist >= 2) {
          constraints.push({
            type: "exact_distance",
            a,
            b,
            distance: dist,
            axis: axisName,
          });
        }
      }
    }
  }

  // Between constraints (triples from different categories)
  // Cap loop iterations — O(n³) without bound
  const maxBetween = n * n;
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
          const [v1, v2] =
            vals[o0] < vals[o1] ? [vals[o0], vals[o1]] : [vals[o1], vals[o0]];
          if (positions[m] > lo && positions[m] < hi) {
            constraints.push({
              type: "between",
              outer1: v1,
              middle: vals[m],
              outer2: v2,
              axis: axisName,
            });
          } else {
            constraints.push({
              type: "not_between",
              outer1: v1,
              middle: vals[m],
              outer2: v2,
              axis: axisName,
            });
          }
          if (++betweenCount >= maxBetween) continue outer;
        }
      }
    }
  }

  // Position constraints. Skip values in the default axis category since their
  // positions are trivially known via identity assignment.
  const axisValues = new Set(defaultAxis.values);
  for (const [val, pos] of posOf) {
    if (axisValues.has(val)) continue;
    constraints.push({ type: "at_position", value: val, position: pos });
    for (let p = 0; p < n; p++) {
      if (p !== pos) {
        constraints.push({ type: "not_at_position", value: val, position: p });
      }
    }
  }

  return constraints;
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

// How many slots each type gets per round-robin cycle.
// same_position gets 4 to ensure it dominates (~40% of final puzzle).
const TYPE_SLOTS: Record<string, number> = { same_position: 4 };

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
): IncSolverCtx {
  const { numValues, numPositions } = solverCtx.ctx;
  const actBase = numValues * numPositions + 1;
  const total = clauseCache.length;

  const allClauses: number[][] = [...solverCtx.baseClauses];
  for (let i = 0; i < total; i++) {
    const actVar = actBase + i;
    for (const clause of clauseCache[i]) {
      allClauses.push([-actVar, ...clause]);
    }
  }

  const solver = new IncrementalSolver(allClauses);
  /* v8 ignore next */
  if (!solver.init()) throw new Error("base clauses contradictory");

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

function needsContradiction(constraints: Constraint[], grid: Grid): boolean {
  return deduce(constraints, grid).steps.some(
    (s) => s.technique === "contradiction",
  );
}

function minimizeConstraints(
  constraints: Constraint[],
  incSolver: IncSolverCtx,
  rng: () => number,
  grid: Grid,
  avoidContradiction: boolean,
): Constraint[] {
  const { solver, actBase, total } = incSolver;
  const active = new Array<boolean>(total).fill(false);

  // Group by type, shuffle within each group for variety
  const byType = new Map<string, number[]>();
  for (let i = 0; i < total; i++) {
    const t = constraints[i].type;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(i);
  }
  for (const arr of byType.values()) shuffle(arr, rng);

  // Build round-robin rotation: each type gets TYPE_SLOTS[type] (default 1)
  // slots per cycle, ensuring balanced representation
  const rotation: string[] = [];
  for (const type of byType.keys()) {
    const slots = TYPE_SLOTS[type] ?? 1;
    for (let s = 0; s < slots; s++) rotation.push(type);
  }
  shuffle(rotation, rng);

  // Phase 1: Constructive — add one constraint per rotation slot until unique
  const cursors = new Map<string, number>();
  for (const type of byType.keys()) cursors.set(type, 0);

  let unique = false;
  while (!unique) {
    let addedAny = false;
    for (const type of rotation) {
      const pool = byType.get(type)!;
      const cursor = cursors.get(type)!;
      /* v8 ignore next */
      if (cursor >= pool.length) continue;

      active[pool[cursor]] = true;
      cursors.set(type, cursor + 1);
      addedAny = true;

      if (checkUnique(solver, actBase, total, active)) {
        unique = true;
        break;
      }
    }
    /* v8 ignore next */
    if (!addedAny) break;
  }

  /* v8 ignore next */
  if (!unique) return [];

  // Phase 2: Destructive trim — remove redundant in random order,
  // but keep constraints needed to avoid proof-by-contradiction.
  const activeIndices: number[] = [];
  for (let i = 0; i < total; i++) if (active[i]) activeIndices.push(i);
  shuffle(activeIndices, rng);

  for (const idx of activeIndices) {
    active[idx] = false;
    // Short-circuit: needsContradiction only runs when the constraint is
    // SAT-redundant (checkUnique passed), which is the less common path.
    if (
      !checkUnique(solver, actBase, total, active) ||
      (avoidContradiction &&
        needsContradiction(
          constraints.filter((_, i) => active[i]),
          grid,
        ))
    ) {
      active[idx] = true;
    }
  }

  return constraints.filter((_, i) => active[i]);
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
