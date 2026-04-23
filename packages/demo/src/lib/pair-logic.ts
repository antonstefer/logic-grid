export type CellState = "empty" | "eliminated" | "confirmed";
export type CellSource = "user" | "auto";
export interface Cell {
  state: CellState;
  source: CellSource;
}
/** pair[catA][valA][catB][valB] — symmetric: pair[a][i][b][j] mirrors pair[b][j][a][i] */
export type PairState = Cell[][][][];

export interface CellCoord {
  a: number;
  i: number;
  b: number;
  j: number;
}

export interface DerivedWrite extends CellCoord {
  state: CellState;
}

/**
 * Observes a just-changed cell and returns implied writes. Pure — must not
 * mutate state. New rules (triangle, last-cell, etc.) plug into `rules[]`
 * without touching call sites.
 */
export interface PropagationRule {
  name: string;
  derive(pair: PairState, changed: CellCoord): DerivedWrite[];
}

/** When (a,i,b,j) is confirmed, eliminate the rest of that sub-row/sub-col in sub-grid (a,b). */
export const subgridUniquenessRule: PropagationRule = {
  name: "subgridUniqueness",
  derive(pair, { a, i, b, j }) {
    const writes: DerivedWrite[] = [];
    if (pair[a][i][b][j].state !== "confirmed") return writes;
    const aSize = pair[a].length;
    const bSize = pair[a][i][b].length;
    for (let jp = 0; jp < bSize; jp++) {
      if (jp !== j && pair[a][i][b][jp].state === "empty") {
        writes.push({ a, i, b, j: jp, state: "eliminated" });
      }
    }
    for (let ip = 0; ip < aSize; ip++) {
      if (ip !== i && pair[a][ip][b][j].state === "empty") {
        writes.push({ a, i: ip, b, j, state: "eliminated" });
      }
    }
    return writes;
  },
};

/**
 * Derive cross-sub-grid writes from pinned-axis knowledge. Library positional
 * facts only touch pinned sub-grids directly; this translates them into the
 * non-pinned sub-grids:
 *  - If a[i] and b[j] are both confirmed at the same pinned position → confirmed pair.
 *  - If every pinned position has at least one of them eliminated → eliminated pair.
 * Only returns writes for currently-empty cells so existing user/auto state isn't clobbered.
 */
export function deriveCrossSubgrids(
  pair: PairState,
  pinIdx: number,
  sizes: number[],
): DerivedWrite[] {
  const writes: DerivedWrite[] = [];
  const N = sizes.length;
  const S = sizes[pinIdx];
  for (let a = 0; a < N; a++) {
    if (a === pinIdx) continue;
    for (let b = a + 1; b < N; b++) {
      if (b === pinIdx) continue;
      const aSize = sizes[a];
      const bSize = sizes[b];
      for (let i = 0; i < aSize; i++) {
        for (let j = 0; j < bSize; j++) {
          if (pair[a][i][b][j].state !== "empty") continue;
          // Scan pinned positions: if any has both values confirmed, the pair
          // is forced confirmed. If none leaves both still possible, the pair
          // is forced eliminated. Otherwise, leave it empty.
          let bothConfirmedSomewhere = false;
          let couldShareAPosition = false;
          for (let p = 0; p < S; p++) {
            const aState = pair[a][i][pinIdx][p].state;
            const bState = pair[b][j][pinIdx][p].state;
            if (aState === "confirmed" && bState === "confirmed") {
              bothConfirmedSomewhere = true;
              break;
            }
            if (aState !== "eliminated" && bState !== "eliminated") {
              couldShareAPosition = true;
            }
          }
          if (bothConfirmedSomewhere) {
            writes.push({ a, i, b, j, state: "confirmed" });
          } else if (!couldShareAPosition) {
            writes.push({ a, i, b, j, state: "eliminated" });
          }
        }
      }
    }
  }
  return writes;
}

/** Symmetric write: always mirrors into pair[b][j][a][i] so the tensor stays consistent. */
export function setPair(
  pair: PairState,
  a: number,
  i: number,
  b: number,
  j: number,
  state: CellState,
  source: CellSource,
): void {
  if (a === b) return;
  pair[a][i][b][j] = { state, source };
  pair[b][j][a][i] = { state, source };
}

/** Reset every auto-derived cell to empty so rules can re-run cleanly. */
export function clearAutoCells(pair: PairState): void {
  for (let a = 0; a < pair.length; a++) {
    for (let i = 0; i < pair[a].length; i++) {
      for (let b = 0; b < pair[a][i].length; b++) {
        for (let j = 0; j < pair[a][i][b].length; j++) {
          if (pair[a][i][b][j].source === "auto") {
            pair[a][i][b][j] = { state: "empty", source: "user" };
          }
        }
      }
    }
  }
}

const rules: PropagationRule[] = [subgridUniquenessRule];

/** Run the rules engine starting from a changed cell, in-place, fixpoint. */
function applyRulesFrom(pair: PairState, start: CellCoord): void {
  const queue: CellCoord[] = [start];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const c = queue.shift()!;
    const key = `${c.a}:${c.i}:${c.b}:${c.j}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const rule of rules) {
      for (const w of rule.derive(pair, c)) {
        const cur = pair[w.a][w.i][w.b][w.j];
        if (cur.state === w.state) continue;
        // Don't clobber user-set non-empty cells; other auto writes are fine to overwrite.
        if (cur.state !== "empty" && cur.source === "user") continue;
        setPair(pair, w.a, w.i, w.b, w.j, w.state, "auto");
        queue.push({ a: w.a, i: w.i, b: w.b, j: w.j });
      }
    }
  }
}

/**
 * Re-derive every auto cell from scratch based on current user cells. Call
 * after any user mutation so un-confirms cleanly retract all dependent auto
 * propagation without per-rule undo bookkeeping.
 *
 * Two passes:
 *   1. Sub-grid uniqueness from each user-confirmed cell (pinned AND cross).
 *   2. Cross-sub-grid derivation from pinned-axis knowledge.
 */
export function recomputeAuto(
  pair: PairState,
  pinIdx: number,
  sizes: number[],
): void {
  clearAutoCells(pair);
  const N = sizes.length;
  for (let a = 0; a < N; a++) {
    for (let i = 0; i < sizes[a]; i++) {
      for (let b = 0; b < N; b++) {
        if (a === b) continue;
        for (let j = 0; j < sizes[b]; j++) {
          if (pair[a][i][b][j].state === "confirmed") {
            applyRulesFrom(pair, { a, i, b, j });
          }
        }
      }
    }
  }
  for (const w of deriveCrossSubgrids(pair, pinIdx, sizes)) {
    setPair(pair, w.a, w.i, w.b, w.j, w.state, "auto");
  }
}
