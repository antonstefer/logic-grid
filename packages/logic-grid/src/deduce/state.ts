import type {
  Category,
  Grid,
  DeductionStep,
  DeductionTechnique,
} from "../types";

// --- Display utilities ---

/** Axis-derived phrasing for deduction explanations. */
export interface AxisTerms {
  noun: string;
  posLabel: (p: number) => string;
}

/** Compute axis terms for the grid's display axis. */
function computeAxisTerms(grid: Grid): AxisTerms {
  // createState throws if no ordered category exists, so axis is always defined here.
  const axis = grid.categories.find((c) => c.ordered === true)!;
  return {
    noun: axis.noun || "position",
    posLabel: (p) => axis.values[p],
  };
}

export function describeResult(
  terms: AxisTerms,
  assigns: { value: string; position: number }[],
  elims: { value: string; position: number }[],
): string {
  const { noun, posLabel } = terms;
  const parts: string[] = [];
  for (const a of assigns) {
    parts.push(`${a.value} must be in the ${posLabel(a.position)} ${noun}`);
  }
  // Group eliminations by value
  const byValue = new Map<string, number[]>();
  for (const e of elims) {
    // Skip eliminated positions for values that were also assigned
    if (assigns.some((a) => a.value === e.value)) continue;
    if (!byValue.has(e.value)) byValue.set(e.value, []);
    byValue.get(e.value)!.push(e.position);
  }
  for (const [value, positions] of byValue) {
    const posStr = positions.map((p) => posLabel(p)).join(" or ");
    parts.push(`${value} can't be in the ${posStr} ${noun}`);
  }
  return parts.join("; ");
}

export function clueRef(ci: number): string {
  return `Clue ${ci + 1}: `;
}

/** Describe what we know about a value's position — used for "because" context. */
export function describeKnown(state: DeduceState, value: string): string {
  const { noun, posLabel } = state.terms;
  const pos = getAssigned(state, value);
  if (pos !== null) return `${value} is in the ${posLabel(pos)} ${noun}`;
  const possible = getPossible(state, value);
  if (possible.size <= 3) {
    const posStr = [...possible].map((p) => posLabel(p)).join(" or ");
    return `${value} can only be in the ${posStr} ${noun}`;
  }
  return "";
}

// --- State ---

export interface DeduceState {
  grid: Grid;
  n: number;
  possible: Set<number>[][];
  valueInfo: Map<string, [number, number]>;
  /** Cached axis-aware terminology for deduction explanations. */
  terms: AxisTerms;
  /** When true, try* functions skip explanation building and return SILENT_STEP. */
  silent: boolean;
}

/**
 * Sentinel returned by try* functions in silent mode (state was mutated, no step details).
 * Only used as a truthy non-null return value — callers check `!== null`, never inspect fields.
 */
export const SILENT_STEP: DeductionStep = Object.freeze({
  technique: "same_position",
  clueIndices: [],
  eliminations: [],
  assignments: [],
  explanation: "",
});

export function createState(grid: Grid): DeduceState {
  const n = grid.size;
  const possible: Set<number>[][] = grid.categories.map((cat) =>
    cat.values.map(() => new Set(Array.from({ length: n }, (_, i) => i))),
  );
  const valueInfo = new Map<string, [number, number]>();
  for (let ci = 0; ci < grid.categories.length; ci++) {
    for (let vi = 0; vi < grid.categories[ci].values.length; vi++) {
      valueInfo.set(grid.categories[ci].values[vi], [ci, vi]);
    }
  }
  // Pin the display axis to match encodeBase and randomSolution: value[k]
  // is fixed at position k to break the n!-fold position symmetry.
  const firstOrderedIdx = grid.categories.findIndex((c) => c.ordered === true);
  if (firstOrderedIdx < 0) throw new Error("Grid has no ordered category");
  const pinCat = grid.categories[firstOrderedIdx];
  for (let vi = 0; vi < pinCat.values.length; vi++) {
    possible[firstOrderedIdx][vi].clear();
    possible[firstOrderedIdx][vi].add(vi);
  }
  return {
    grid,
    n,
    possible,
    valueInfo,
    terms: computeAxisTerms(grid),
    silent: false,
  };
}

export function getPossible(state: DeduceState, value: string): Set<number> {
  const info = state.valueInfo.get(value);
  if (!info) throw new Error(`Unknown value: ${value}`);
  return state.possible[info[0]][info[1]];
}

export function getAssigned(state: DeduceState, value: string): number | null {
  const ps = getPossible(state, value);
  return ps.size === 1 ? first(ps) : null;
}

export function isSolved(state: DeduceState): boolean {
  for (const cat of state.possible) {
    for (const ps of cat) {
      if (ps.size !== 1) return false;
    }
  }
  return true;
}

export function cloneState(state: DeduceState): DeduceState {
  return {
    grid: state.grid,
    n: state.n,
    possible: state.possible.map((cat) => cat.map((ps) => new Set(ps))),
    valueInfo: state.valueInfo,
    terms: state.terms,
    silent: state.silent,
  };
}

// --- Step builder ---

export function step(
  technique: DeductionTechnique,
  clueIndices: number[],
  eliminations: { value: string; position: number }[],
  assignments: { value: string; position: number }[],
  explanation: string,
): DeductionStep {
  return { technique, clueIndices, eliminations, assignments, explanation };
}

/** Extract the single element from a size-1 set without allocating an array. */
export function first(set: Set<number>): number {
  return set.values().next().value!;
}

// --- Helpers ---

export function collectAssigns(
  state: DeduceState,
  elims: { value: string; position: number }[],
): { value: string; position: number }[] {
  const assigns: { value: string; position: number }[] = [];
  const checked = new Set<string>();
  for (const e of elims) {
    if (checked.has(e.value)) continue;
    checked.add(e.value);
    const ps = getPossible(state, e.value);
    if (ps.size === 1) assigns.push({ value: e.value, position: first(ps) });
  }
  return assigns;
}

// --- Rank-space helpers for multi-axis deduction ---

/**
 * Compute the set of ranks `value` could occupy on `axis`. A rank k is
 * possible iff there exists a position p where both `value` and
 * `axis.values[k]` are currently possible.
 */
export function axisRankDomain(
  state: DeduceState,
  value: string,
  axis: Category,
): Set<number> {
  const ps = getPossible(state, value);
  const ranks = new Set<number>();
  for (const p of ps) {
    for (let k = 0; k < axis.values.length; k++) {
      if (getPossible(state, axis.values[k]).has(p)) {
        ranks.add(k);
      }
    }
  }
  return ranks;
}

/**
 * Project rank eliminations back to position eliminations. For each position
 * currently possible for `value`, if the ONLY axis rank still possible at
 * that position is in `eliminatedRanks`, then that position is eliminated.
 */
export function projectRanksToPositions(
  state: DeduceState,
  value: string,
  axis: Category,
  eliminatedRanks: Set<number>,
): { value: string; position: number }[] {
  const elims: { value: string; position: number }[] = [];
  const ps = getPossible(state, value);
  for (const p of ps) {
    // Find all axis ranks still possible at position p.
    let allEliminated = true;
    for (let k = 0; k < axis.values.length; k++) {
      if (getPossible(state, axis.values[k]).has(p)) {
        if (!eliminatedRanks.has(k)) {
          allEliminated = false;
          break;
        }
      }
    }
    if (allEliminated) {
      elims.push({ value, position: p });
    }
  }
  return elims;
}
