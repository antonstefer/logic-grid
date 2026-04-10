import type {
  Category,
  Grid,
  DeductionStep,
  DeductionTechnique,
} from "../types";
import { ordinal, posNoun, posPrep } from "../grid-utils";

// --- Display utilities ---

export function describeResult(
  grid: Grid,
  assigns: { value: string; position: number }[],
  elims: { value: string; position: number }[],
): string {
  const noun = posNoun(grid);
  const prep = posPrep(grid);
  const parts: string[] = [];
  for (const a of assigns) {
    parts.push(`${a.value} must be ${prep} the ${ordinal(a.position)} ${noun}`);
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
    const posStr = positions.map((p) => ordinal(p)).join(" or ");
    parts.push(`${value} can't be ${prep} the ${posStr} ${noun}`);
  }
  return parts.join("; ");
}

export function clueRef(ci: number): string {
  return `Clue ${ci + 1}: `;
}

/** Describe what we know about a value's position — used for "because" context. */
export function describeKnown(state: DeduceState, value: string): string {
  const { grid } = state;
  const noun = posNoun(grid);
  const prep = posPrep(grid);
  const pos = getAssigned(state, value);
  if (pos !== null) return `${value} is ${prep} the ${ordinal(pos)} ${noun}`;
  const possible = getPossible(state, value);
  if (possible.size <= 3) {
    const posStr = [...possible].map((p) => ordinal(p)).join(" or ");
    return `${value} can only be ${prep} the ${posStr} ${noun}`;
  }
  return "";
}

// --- State ---

export interface DeduceState {
  grid: Grid;
  n: number;
  possible: Set<number>[][];
  valueInfo: Map<string, [number, number]>;
  /** When true, try* functions skip explanation building and return SILENT_STEP. */
  silent: boolean;
}

/**
 * Sentinel returned by try* functions in silent mode (state was mutated, no step details).
 * Only used as a truthy non-null return value — callers check `!== null`, never inspect fields.
 */
export const SILENT_STEP: DeductionStep = Object.freeze({
  technique: "direct" as DeductionTechnique,
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
  // Phase 1: identity-pin the first ordered category to match randomSolution
  // and encodeBase behavior. Phase 2 removes this.
  const firstOrderedIdx = grid.categories.findIndex((c) => c.ordered === true);
  if (firstOrderedIdx >= 0) {
    const cat = grid.categories[firstOrderedIdx];
    for (let vi = 0; vi < cat.values.length; vi++) {
      possible[firstOrderedIdx][vi].clear();
      possible[firstOrderedIdx][vi].add(vi);
    }
  }
  return { grid, n, possible, valueInfo, silent: false };
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

export function dedup(
  elims: { value: string; position: number }[],
): { value: string; position: number }[] {
  const seen = new Set<string>();
  return elims.filter((e) => {
    const key = `${e.value}:${e.position}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
