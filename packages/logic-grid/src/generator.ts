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
import { createSolverContext } from "./solver";
import { encodeConstraint, RankVarAllocator } from "./encoding";
import { IncrementalSolver } from "./sat";
import { renderClue } from "./clues/templates";
import { classify, typesUpToTier } from "./difficulty";
import { deduce } from "./deduce";
import {
  displayAxisCategory,
  isOrdered,
  orderedCategories,
  pinnedAxis,
  resolveAxis,
} from "./axis";
import { DEFAULT_CATEGORIES, defaultHouseCategory } from "./default-config";

const MAX_RETRIES = 100;

/**
 * Validate per-category invariants. Called by buildGrid before the grid is
 * used for anything, so downstream code can rely on these invariants.
 */
function validateCategories(categories: Category[]): void {
  const names = new Set<string>();
  // Values must be globally unique — the SAT variable mapping in
  // createContext is keyed by value name across all categories, so a
  // collision silently overwrites the earlier entry. Also affects
  // isAxisValue in deduce/state.ts which matches by name alone.
  const valueSource = new Map<string, string>();
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

    for (const v of c.values) {
      const existing = valueSource.get(v);
      if (existing !== undefined) {
        throw new RangeError(
          `Duplicate value "${v}" in categories "${existing}" and "${c.name}"`,
        );
      }
      valueSource.set(v, c.name);
    }

    if (isOrdered(c)) {
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
    const alloc = new RankVarAllocator(solverCtx.ctx);
    const clauseCache = filtered.map((c) =>
      encodeConstraint(solverCtx.ctx, c, alloc),
    );

    // Build ONE incremental solver with activation literals for all constraints
    const incSolver = buildIncrementalSolver(solverCtx, clauseCache, alloc);

    const minimal = minimizeConstraints(
      filtered,
      incSolver,
      rng,
      grid,
      difficulty !== "expert",
    );
    // minimizeConstraints returns [] when the constructive phase can't achieve
    // uniqueness. Unreachable for supported grid sizes with seeded RNG but
    // observed with Math.random on some platforms (CI flake).
    /* v8 ignore next */
    if (minimal.length === 0) continue;

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

  // Defensive failsafe: unreachable for supported grid sizes and difficulties
  // — `generate` can always find a matching puzzle within 100 attempts.
  /* v8 ignore next 4 */
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

  if (categoryNames && !categories.some((c) => c.ordered === true)) {
    throw new Error(
      "categoryNames must include at least one category with `ordered: true`. " +
        "Comparator constraints (before, next_to, between, …) require an ordered axis. " +
        "Use defaultHouseCategory(size) for a generic positional axis if the theme has none.",
    );
  }

  const grid: Grid = {
    size,
    categories,
    displayAxis: options?.displayAxis,
  };

  // Validate displayAxis references an ordered category if set.
  if (grid.displayAxis !== undefined) {
    resolveAxis(grid, grid.displayAxis);
  }
  return grid;
}

/** Copy a user-provided category, slicing values/numericValues to grid size.
 *  Preserves all fields via spread — future Category additions survive this
 *  step without per-field enumeration. Only the fields that need
 *  transformation (values → sliced, noun/subjectPriority → defaults,
 *  numericValues/displayLabels → sliced when ordered) are overridden. */
function sliceCategory(c: Category, size: number): Category {
  const noun = c.noun ?? "";
  const subjectPriority = c.subjectPriority ?? (noun === "" ? 2 : 0);
  const sliced = {
    ...c,
    values: c.values.slice(0, size),
    noun,
    subjectPriority,
  };
  if (isOrdered(sliced)) {
    return {
      ...sliced,
      numericValues: sliced.numericValues?.slice(0, size),
      displayLabels: sliced.displayLabels?.slice(0, size),
    } as Category; // spread loses union discrimination
  }
  return sliced as Category;
}

function randomSolution(grid: Grid, rng: () => number): Solution {
  // Pin the same axis encodeBase pins (the first ordered category) so the
  // generated solution matches what the SAT solver will canonicalize to.
  // grid.displayAxis is a UI hint and does not affect SAT pinning.
  const pinned = pinnedAxis(grid);
  return grid.categories.map((cat) => {
    if (cat === pinned) {
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

  const orderedCats = orderedCategories(grid);

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
  // Map from value name → its row position. Used for position constraints.
  const posOf = new Map<string, number>();
  for (let i = 0; i < allValues.length; i++) posOf.set(allValues[i], posArr[i]);

  // --- Axis-free constraints (same_position, not_same_position) ---
  // Cap negative pairwise types independently — a shared counter would
  // starve not_next_to (which is enumerated per-axis below).
  const maxPerType = n * n;
  let notSameCount = 0;

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
    }
  }

  // --- Per-axis comparative constraints ---
  // For each ordered category, compute each value's rank on that axis and
  // emit constraints whose semantics match. Values belonging to the axis
  // category itself are skipped — their rank is trivially their own index.
  for (const axis of orderedCats) {
    const axisName = axis.name;
    const axisCatIdx = grid.categories.indexOf(axis);
    // Rank lookup: for each row r in [0..n), which axis value index sits there?
    // (i.e. rankAtRow[r] = k means axis.values[k] is assigned to row r.)
    const rankAtRow = new Array<number>(n);
    for (let k = 0; k < axis.values.length; k++) {
      rankAtRow[solution[axisCatIdx][axis.values[k]]] = k;
    }
    const numVals = axis.numericValues;

    let nextCount = 0;
    let notNextCount = 0;
    for (let i = 0; i < allValues.length; i++) {
      if (catArr[i] === axisCatIdx) continue;
      const a = allValues[i];
      const rankA = rankAtRow[posArr[i]];
      const catA = catArr[i];
      for (let j = i + 1; j < allValues.length; j++) {
        if (catArr[j] === catA) continue;
        if (catArr[j] === axisCatIdx) continue;
        const b = allValues[j];
        const rankB = rankAtRow[posArr[j]];

        if (Math.abs(rankA - rankB) === 1 && nextCount < maxPerType) {
          constraints.push({ type: "next_to", a, b, axis: axisName });
          nextCount++;
        } else if (rankA !== rankB && notNextCount < maxPerType) {
          constraints.push({ type: "not_next_to", a, b, axis: axisName });
          notNextCount++;
        }

        if (rankA === rankB - 1) {
          constraints.push({ type: "left_of", a, b, axis: axisName });
        }
        if (rankB === rankA - 1) {
          constraints.push({ type: "left_of", a: b, b: a, axis: axisName });
        }

        // before: a's rank is strictly less than b's rank
        if (rankA < rankB) {
          constraints.push({ type: "before", a, b, axis: axisName });
        } else if (rankB < rankA) {
          constraints.push({ type: "before", a: b, b: a, axis: axisName });
        }

        // exact_distance
        if (numVals) {
          const valDist = Math.abs(numVals[rankA] - numVals[rankB]);
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
          const dist = Math.abs(rankA - rankB);
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

    // --- Per-axis between / not_between (triples) ---
    // Cap to O(n²) emissions per axis to match the single-axis budget.
    const maxBetween = n * n;
    let betweenCount = 0;
    betweenOuter: for (
      let i = 0;
      i < allValues.length && betweenCount < maxBetween;
      i++
    ) {
      if (catArr[i] === axisCatIdx) continue;
      const ai = allValues[i];
      const catAi = catArr[i];
      const rankAi = rankAtRow[posArr[i]];
      for (
        let j = i + 1;
        j < allValues.length && betweenCount < maxBetween;
        j++
      ) {
        if (catArr[j] === axisCatIdx) continue;
        if (catArr[j] === catAi) continue;
        const aj = allValues[j];
        const catAj = catArr[j];
        const rankAj = rankAtRow[posArr[j]];
        for (let k = j + 1; k < allValues.length; k++) {
          if (catArr[k] === axisCatIdx) continue;
          if (catArr[k] === catAi || catArr[k] === catAj) continue;
          const ak = allValues[k];
          const rankAk = rankAtRow[posArr[k]];
          const vals = [ai, aj, ak];
          const ranks = [rankAi, rankAj, rankAk];
          for (let m = 0; m < 3; m++) {
            const o0 = m === 0 ? 1 : 0;
            const o1 = m === 2 ? 1 : 2;
            const lo = Math.min(ranks[o0], ranks[o1]);
            const hi = Math.max(ranks[o0], ranks[o1]);
            const [v1, v2] =
              vals[o0] < vals[o1] ? [vals[o0], vals[o1]] : [vals[o1], vals[o0]];
            if (ranks[m] > lo && ranks[m] < hi) {
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
            if (++betweenCount >= maxBetween) continue betweenOuter;
          }
        }
      }
    }
  }

  // --- Position constraints (via display axis) ---
  // Express each value's position as same_position / not_same_position against
  // the display axis values, so clues read naturally ("Alice lives in the
  // first house" rather than "Alice is at position 0").
  const dispAxis = displayAxisCategory(grid);
  const dispValues = new Set(dispAxis.values);
  for (const [val, pos] of posOf) {
    if (dispValues.has(val)) continue;
    constraints.push({
      type: "same_position",
      a: val,
      b: dispAxis.values[pos],
    });
    for (let p = 0; p < n; p++) {
      if (p !== pos) {
        constraints.push({
          type: "not_same_position",
          a: val,
          b: dispAxis.values[p],
        });
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
      ? typesUpToTier("easy")
      : difficulty === "medium"
        ? typesUpToTier("medium")
        : null; // hard / expert: all types allowed

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
  alloc: RankVarAllocator,
): IncSolverCtx {
  // Activation literals must start above ALL variable ranges: position vars
  // AND rank auxiliary vars allocated during constraint encoding.
  const actBase = alloc.varCeiling;
  const total = clauseCache.length;

  const allClauses: number[][] = [...solverCtx.baseClauses];
  // Add rank channeling clauses (shared across constraints, not guarded)
  for (const clause of alloc.channeling) allClauses.push(clause);
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

  // Constructive phase: add one constraint per rotation slot until unique
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

  // Destructive trim: remove redundant in random order,
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
