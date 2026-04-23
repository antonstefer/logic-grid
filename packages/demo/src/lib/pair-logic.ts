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
          let bothConfirmed = false;
          let anyBothPossible = false;
          for (let p = 0; p < S; p++) {
            const aState = pair[a][i][pinIdx][p].state;
            const bState = pair[b][j][pinIdx][p].state;
            if (aState === "confirmed" && bState === "confirmed") {
              bothConfirmed = true;
              break;
            }
            if (aState !== "eliminated" && bState !== "eliminated") {
              anyBothPossible = true;
            }
          }
          if (bothConfirmed) {
            writes.push({ a, i, b, j, state: "confirmed" });
          } else if (!anyBothPossible) {
            writes.push({ a, i, b, j, state: "eliminated" });
          }
        }
      }
    }
  }
  return writes;
}
