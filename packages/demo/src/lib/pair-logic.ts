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
 *
 * NB: derivation is pinned→cross only. Two gaps follow:
 *   1. Cross-only transitives: user confirming (A,B) and (B,C) in cross
 *      sub-grids does NOT imply (A,C) — we never look at cross cells.
 *   2. Cross→pinned inference: user confirming (A,B) cross and (A,pin=p)
 *      does NOT imply (B,pin=p) — we only write to non-pinned cells.
 * Clicks made purely in pinned sub-grids propagate everywhere via this pass;
 * anything else stays local to the sub-grids it touches.
 */
export function deriveCrossSubgrids(
  pair: PairState,
  pinIdx: number,
): DerivedWrite[] {
  const writes: DerivedWrite[] = [];
  const N = pair.length;
  const S = pair[pinIdx].length;
  for (let a = 0; a < N; a++) {
    if (a === pinIdx) continue;
    for (let b = a + 1; b < N; b++) {
      if (b === pinIdx) continue;
      const aSize = pair[a].length;
      const bSize = pair[b].length;
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
  { a, i, b, j }: CellCoord,
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

/**
 * Run the rules engine starting from a changed cell, in-place, fixpoint.
 *
 * Multi-rule caveat for future work: `seen` prevents re-processing the same
 * cell, so if rule A confirms (a,i,b,j) and a later rule B overwrites it
 * with a different state, B's write succeeds silently (auto→auto is
 * allowed) but B's state does NOT re-run A's derivations because the cell
 * is already in `seen`. Benign with one rule (subgridUniqueness only fires
 * on `confirmed` cells and only produces `eliminated` writes, so no two
 * rules ever disagree). When a second rule lands, decide the policy: detect
 * the conflict and throw, or drop `seen` and rely on the "state already
 * equal" skip above to terminate.
 */
function applyRulesFrom(pair: PairState, start: CellCoord): void {
  // Head-index queue instead of Array.shift() so dequeue is O(1). At current
  // grid sizes this barely matters; it keeps scaling honest as more rules land.
  const queue: CellCoord[] = [start];
  let head = 0;
  const seen = new Set<string>();
  // Normalize seen keys so mirror coords (a,i,b,j) and (b,j,a,i) dedup — same
  // logical cell in the symmetric tensor. Keeps asymmetric rules (if they ever
  // land) from silently bypassing the guard because they wrote the mirror.
  const keyOf = (c: CellCoord) =>
    c.a < c.b ? `${c.a}:${c.i}:${c.b}:${c.j}` : `${c.b}:${c.j}:${c.a}:${c.i}`;
  while (head < queue.length) {
    const c = queue[head++];
    const key = keyOf(c);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const rule of rules) {
      for (const w of rule.derive(pair, c)) {
        const cur = pair[w.a][w.i][w.b][w.j];
        if (cur.state === w.state) continue;
        // Don't clobber user-set non-empty cells; other auto writes are fine to overwrite.
        if (cur.state !== "empty" && cur.source === "user") continue;
        setPair(pair, w, w.state, "auto");
        queue.push({ a: w.a, i: w.i, b: w.b, j: w.j });
      }
    }
  }
}

/**
 * Assert a user confirm at (a, i, b, j), auto-clearing any existing user
 * confirm in the same sub-row/sub-col of this sub-grid. Classic logic-grid
 * UX: clicking a new cell replaces the prior guess on that line so the user
 * can freely move their guess without first clearing the old one. Does NOT
 * run recomputeAuto — callers are responsible for that afterwards.
 */
export function replaceConfirm(
  pair: PairState,
  { a, i, b, j }: CellCoord,
): void {
  if (a === b) return;
  const aSize = pair[a].length;
  const bSize = pair[b].length;
  for (let jp = 0; jp < bSize; jp++) {
    const c = pair[a][i][b][jp];
    if (jp !== j && c.state === "confirmed" && c.source === "user") {
      setPair(pair, { a, i, b, j: jp }, "empty", "user");
    }
  }
  for (let ip = 0; ip < aSize; ip++) {
    const c = pair[a][ip][b][j];
    if (ip !== i && c.state === "confirmed" && c.source === "user") {
      setPair(pair, { a, i: ip, b, j }, "empty", "user");
    }
  }
  setPair(pair, { a, i, b, j }, "confirmed", "user");
}

/**
 * Re-derive every auto cell from scratch based on current user cells. Call
 * after any user mutation so un-confirms cleanly retract all dependent auto
 * propagation without per-rule undo bookkeeping.
 *
 * Two passes:
 *   1. Sub-grid uniqueness from each user-confirmed cell (pinned AND cross).
 *   2. Cross-sub-grid derivation from pinned-axis knowledge.
 *
 * Sub-grid uniqueness does NOT re-run over the cross confirms produced by
 * pass 2. This is safe because `deriveCrossSubgrids` reads the pinned state
 * directly: whenever it confirms (a,i,b,j), the same scan also emits the
 * eliminations subgrid uniqueness would derive from that confirm (every
 * other (a,i,b,j') has some pinned position where one of the two is
 * eliminated). If a future rule produces cross confirms not backed by
 * pinned-axis state (e.g. a generic triangle rule), feed its output back
 * through `applyRulesFrom` or wrap this in a fixpoint loop.
 */
export function recomputeAuto(pair: PairState, pinIdx: number): void {
  clearAutoCells(pair);
  const N = pair.length;
  // Iterate each unordered (a, b) sub-grid once. `subgridUniquenessRule` is
  // symmetric — running applyRulesFrom from either direction derives the same
  // eliminations inside the (a, b) sub-grid, so visiting the mirror is
  // redundant work. Mirrors the `b = a + 1` convention in deriveCrossSubgrids.
  // If an asymmetric rule lands, revisit this alongside the `seen` normalization
  // noted in applyRulesFrom.
  for (let a = 0; a < N; a++) {
    for (let i = 0; i < pair[a].length; i++) {
      for (let b = a + 1; b < N; b++) {
        for (let j = 0; j < pair[b].length; j++) {
          if (pair[a][i][b][j].state === "confirmed") {
            applyRulesFrom(pair, { a, i, b, j });
          }
        }
      }
    }
  }
  for (const w of deriveCrossSubgrids(pair, pinIdx)) {
    setPair(pair, w, w.state, "auto");
  }
}
