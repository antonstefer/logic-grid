import type {
  Category,
  Grid,
  DeductionStep,
  DeductionTechnique,
} from "../types";
import { pinnedAxis } from "../axis";
import { formatAtMulti, formatAtSingle, pluralize } from "../clues/templates";

// --- Display utilities ---

/** Axis-derived phrasing for deduction explanations. */
export interface AxisTerms {
  /** Lowercased name of the pinned axis category — the *concept* being measured.
   * Used in structural phrasings ("no other possible X", "in the A and B Xs"),
   * where the row-entity `noun` can semantically overlap with the subject
   * (e.g. `noun: "fugitive"` clashes with pirate subjects). The concept word
   * (`name: "Bounty"` → "bounty") reads uniformly across themes. */
  axisName: string;
  /** Pluralized `axisName` ("bounties", "houses", "years"). */
  axisNames: string;
  posLabel: (p: number) => string;
  /** True when `value` is a display-axis value (e.g. "first" on the House axis). */
  isAxisValue: (value: string) => boolean;
}

/** Compute axis terms for the grid's pinned axis (the row anchor). */
function computeAxisTerms(grid: Grid): AxisTerms {
  // createState throws if no ordered category exists, so axis is always defined here.
  const axis = pinnedAxis(grid)!;
  // isAxisValue below matches by value name alone — correct because
  // validateCategories enforces globally unique value names across all
  // categories. If that invariant weakens, this lookup silently
  // misclassifies cross-category collisions.
  const axisValues = new Set(axis.values);
  const axisName = axis.name.toLowerCase();
  return {
    axisName,
    axisNames: pluralize(axisName),
    posLabel: (p) => axis.values[p],
    isAxisValue: (value) => axisValues.has(value),
  };
}

export function describeResult(
  grid: Grid,
  assigns: { value: string; position: number }[],
  elims: { value: string; position: number }[],
): string {
  const parts: string[] = [];
  for (const a of assigns) {
    parts.push(formatAtSingle(a.value, a.position, grid, false));
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
    if (positions.length === 1) {
      parts.push(formatAtSingle(value, positions[0], grid, true));
    } else {
      parts.push(formatAtMulti(value, positions, grid, true));
    }
  }
  return parts.join("; ");
}

export function clueRef(ci: number): string {
  return `Clue ${ci + 1}: `;
}

/** Describe what we know about a value's position — used for "because" context. */
export function describeKnown(state: DeduceState, value: string): string {
  const { posLabel } = state.terms;
  const pos = getAssigned(state, value);
  if (pos !== null) {
    // Display-axis values are pinned to their own index — "first is in the
    // first house" is tautological and shadows more informative operands.
    if (posLabel(pos) === value) return "";
    return formatAtSingle(value, pos, state.grid, false);
  }
  const possible = getPossible(state, value);
  // Only useful when the domain is both small enough to enumerate AND
  // genuinely narrowed — on a 3-grid with nothing eliminated, "can only be
  // in the first or second or third house" is true but useless and would
  // shadow more informative operands in callers like trySamePosition.
  if (possible.size <= 3 && possible.size < state.n) {
    return formatAtMulti(value, [...possible], state.grid, false);
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
 * The `technique` value here is an arbitrary placeholder; nothing reads it.
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
  // Pin the first ordered axis to match encodeBase and randomSolution:
  // value[k] is fixed at position k to break the n!-fold position symmetry.
  const pinCat = pinnedAxis(grid);
  if (!pinCat) throw new Error("Grid has no ordered category");
  const pinCatIdx = grid.categories.indexOf(pinCat);
  for (let vi = 0; vi < pinCat.values.length; vi++) {
    possible[pinCatIdx][vi].clear();
    possible[pinCatIdx][vi].add(vi);
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
