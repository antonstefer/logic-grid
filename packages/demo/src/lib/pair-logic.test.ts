import { describe, it, expect } from "vitest";
import {
  deriveCrossSubgrids,
  recomputeAuto,
  replaceConfirm,
  subgridUniquenessRule,
  type Cell,
  type CellState,
  type DerivedWrite,
  type PairState,
} from "./pair-logic";

function emptyCell(): Cell {
  return { state: "empty", source: "user" };
}

function emptyPair(sizes: number[]): PairState {
  const N = sizes.length;
  const p: PairState = [];
  for (let a = 0; a < N; a++) {
    p[a] = [];
    for (let i = 0; i < sizes[a]; i++) {
      p[a][i] = [];
      for (let b = 0; b < N; b++) {
        p[a][i][b] = [];
        for (let j = 0; j < sizes[b]; j++) {
          p[a][i][b][j] = emptyCell();
        }
      }
    }
  }
  return p;
}

/** Apply a symmetric write (mirrors into pair[b][j][a][i]). */
function set(
  pair: PairState,
  a: number,
  i: number,
  b: number,
  j: number,
  state: CellState,
): void {
  pair[a][i][b][j] = { state, source: "user" };
  pair[b][j][a][i] = { state, source: "user" };
}

describe("subgridUniquenessRule", () => {
  it("returns no writes when the changed cell is not confirmed", () => {
    const pair = emptyPair([4, 4]);
    set(pair, 0, 0, 1, 0, "eliminated");
    const writes = subgridUniquenessRule.derive(pair, {
      a: 0,
      i: 0,
      b: 1,
      j: 0,
    });
    expect(writes).toHaveLength(0);
  });

  it("eliminates the rest of the sub-row and sub-col when a cell is confirmed", () => {
    const pair = emptyPair([4, 4]);
    set(pair, 0, 0, 1, 0, "confirmed");
    const writes = subgridUniquenessRule.derive(pair, {
      a: 0,
      i: 0,
      b: 1,
      j: 0,
    });
    // 3 other columns in the sub-row + 3 other rows in the sub-col = 6 eliminations
    expect(writes).toHaveLength(6);
    for (const w of writes) expect(w.state).toBe("eliminated");
    const coords = writes.map((w) => `${w.a},${w.i},${w.b},${w.j}`).sort();
    expect(coords).toEqual([
      "0,0,1,1",
      "0,0,1,2",
      "0,0,1,3",
      "0,1,1,0",
      "0,2,1,0",
      "0,3,1,0",
    ]);
  });

  it("skips already-non-empty cells", () => {
    const pair = emptyPair([4, 4]);
    set(pair, 0, 0, 1, 0, "confirmed");
    set(pair, 0, 0, 1, 1, "eliminated"); // pre-existing — should not be re-emitted
    const writes = subgridUniquenessRule.derive(pair, {
      a: 0,
      i: 0,
      b: 1,
      j: 0,
    });
    const coords = writes.map((w) => `${w.a},${w.i},${w.b},${w.j}`);
    expect(coords).not.toContain("0,0,1,1");
    expect(writes).toHaveLength(5);
  });
});

describe("deriveCrossSubgrids", () => {
  const sizes = [4, 4, 4]; // pinCat=0, catA=1, catB=2

  it("returns no writes when pinned-axis knowledge is empty", () => {
    const pair = emptyPair(sizes);
    expect(deriveCrossSubgrids(pair, 0, sizes)).toHaveLength(0);
  });

  it("confirms a cross pair when both values share a confirmed pinned position", () => {
    const pair = emptyPair(sizes);
    // catA value 0 at pin 1; catB value 2 also at pin 1 → cross pair (catA=0, catB=2) must be confirmed
    set(pair, 1, 0, 0, 1, "confirmed");
    set(pair, 2, 2, 0, 1, "confirmed");
    const writes = deriveCrossSubgrids(pair, 0, sizes);
    const confirms = writes.filter((w) => w.state === "confirmed");
    expect(confirms).toContainEqual({
      a: 1,
      i: 0,
      b: 2,
      j: 2,
      state: "confirmed",
    });
  });

  it("eliminates a cross pair when every pinned position rules one out", () => {
    const pair = emptyPair(sizes);
    // catA value 0 MUST be at pin 0 (confirmed there), catB value 0 MUST be at pin 1 → incompatible
    set(pair, 1, 0, 0, 0, "confirmed");
    set(pair, 2, 0, 0, 1, "confirmed");
    // Sub-grid uniqueness would normally fill the rest; simulate by eliminating the other positions
    for (let p = 1; p < 4; p++) set(pair, 1, 0, 0, p, "eliminated");
    for (let p = 0; p < 4; p++)
      if (p !== 1) set(pair, 2, 0, 0, p, "eliminated");
    const writes = deriveCrossSubgrids(pair, 0, sizes);
    expect(writes).toContainEqual({
      a: 1,
      i: 0,
      b: 2,
      j: 0,
      state: "eliminated",
    });
  });

  it("leaves a cross pair alone when pinned-axis knowledge is ambiguous", () => {
    const pair = emptyPair(sizes);
    // catA value 0 could be at pin 0 or 1; catB value 0 could be at pin 0 or 2
    // Both could still share pin 0 → not forced-eliminated; neither confirmed → not forced-confirmed.
    set(pair, 1, 0, 0, 2, "eliminated");
    set(pair, 1, 0, 0, 3, "eliminated");
    set(pair, 2, 0, 0, 1, "eliminated");
    set(pair, 2, 0, 0, 3, "eliminated");
    const writes = deriveCrossSubgrids(pair, 0, sizes);
    const forThisPair = writes.filter(
      (w) => w.a === 1 && w.i === 0 && w.b === 2 && w.j === 0,
    );
    expect(forThisPair).toHaveLength(0);
  });

  it("retracts a cross-sub-grid derivation when the supporting pinned fact is removed", () => {
    // Simulates the recomputeAuto flow: on un-confirm, auto cells are cleared and
    // deriveCrossSubgrids runs again against the remaining user state. The previously
    // derived cross pair must NOT be re-derived once its support is gone.
    function derive(pair: PairState): DerivedWrite[] {
      return deriveCrossSubgrids(pair, 0, sizes);
    }

    const pair = emptyPair(sizes);
    set(pair, 1, 0, 0, 1, "confirmed"); // catA=0 at pin 1
    set(pair, 2, 2, 0, 1, "confirmed"); // catB=2 at pin 1
    const before = derive(pair);
    expect(before).toContainEqual({
      a: 1,
      i: 0,
      b: 2,
      j: 2,
      state: "confirmed",
    });

    // User un-confirms catA=0 at pin 1 — cross pair should no longer be derivable.
    set(pair, 1, 0, 0, 1, "empty");
    const after = derive(pair);
    const forCrossPair = after.filter(
      (w) => w.a === 1 && w.i === 0 && w.b === 2 && w.j === 2,
    );
    expect(forCrossPair).toHaveLength(0);
  });
});

describe("recomputeAuto", () => {
  const sizes = [4, 4, 4]; // pinCat=0, catA=1, catB=2

  it("runs sub-grid uniqueness AND cross-sub-grid derivation in one pass", () => {
    const pair = emptyPair(sizes);
    // User confirms catA=0 at pin 1, catB=2 at pin 1.
    set(pair, 1, 0, 0, 1, "confirmed");
    set(pair, 2, 2, 0, 1, "confirmed");

    recomputeAuto(pair, 0, sizes);

    // Sub-grid uniqueness in the (pin, catA) sub-grid:
    // other pinned positions for catA=0 are eliminated
    for (let p = 0; p < 4; p++) {
      if (p !== 1) expect(pair[1][0][0][p].state).toBe("eliminated");
    }
    // and other catA values at pin=1 are eliminated
    for (let v = 1; v < 4; v++) {
      expect(pair[1][v][0][1].state).toBe("eliminated");
    }

    // Cross sub-grid (catA, catB): catA=0 and catB=2 both at pin=1 → confirmed pair
    expect(pair[1][0][2][2].state).toBe("confirmed");
    expect(pair[1][0][2][2].source).toBe("auto");
    // ...which in turn should eliminate the rest of that sub-row/sub-col
    // (these are auto-confirm propagations — still valid after this single recompute)
    for (let v = 0; v < 4; v++) {
      if (v !== 2) expect(pair[1][0][2][v].state).toBe("eliminated");
    }
  });

  it("retracts every dependent auto cell when a user confirm is removed", () => {
    const pair = emptyPair(sizes);
    set(pair, 1, 0, 0, 1, "confirmed");
    set(pair, 2, 2, 0, 1, "confirmed");
    recomputeAuto(pair, 0, sizes);
    expect(pair[1][0][2][2].state).toBe("confirmed"); // sanity

    // User un-confirms catA=0 at pin 1.
    set(pair, 1, 0, 0, 1, "empty");
    recomputeAuto(pair, 0, sizes);

    // catA has no user confirms left — its pinned sub-grid should be all empty,
    // and the cross pair it supported should be back to empty.
    expect(pair[1][0][2][2].state).toBe("empty");
    for (let p = 0; p < 4; p++) expect(pair[1][0][0][p].state).toBe("empty");
    // catB's confirm is untouched; its pinned sub-grid still has its forced eliminations.
    expect(pair[2][2][0][1].state).toBe("confirmed");
    expect(pair[2][2][0][0].state).toBe("eliminated");
  });

  it("never clobbers a user-set eliminate even if a rule would derive the same cell", () => {
    const pair = emptyPair(sizes);
    set(pair, 1, 0, 0, 1, "confirmed"); // user confirm
    set(pair, 1, 0, 0, 2, "eliminated"); // user elim (sub-grid uniqueness would derive this)
    recomputeAuto(pair, 0, sizes);
    // The cell stays user-sourced, not overwritten to auto.
    expect(pair[1][0][0][2]).toEqual({ state: "eliminated", source: "user" });
  });

  it("cross-only user confirms stay local — no derivation without pinned-axis support", () => {
    // Mirror Issue 2 from code review: user manually confirms (catA=0, catB=0)
    // and (catB=0, catC=0) entirely in cross sub-grids, never touching the
    // pinned axis. The transitive (catA=0, catC=0) must NOT be derived, since
    // deriveCrossSubgrids only reads pinned-axis state.
    const pair = emptyPair(sizes);
    // catA × catB cross-confirm (no pinned facts involved)
    set(pair, 1, 0, 2, 0, "confirmed");
    recomputeAuto(pair, 0, sizes);
    // Cross-sub-grid effects stay within (catA, catB); pinned sub-grids untouched.
    expect(pair[1][0][0][0].state).toBe("empty"); // catA=0 pinned state unknown
    expect(pair[2][0][0][0].state).toBe("empty"); // catB=0 pinned state unknown
    // Sub-grid uniqueness inside (catA, catB) still applies.
    expect(pair[1][0][2][1].state).toBe("eliminated");
    expect(pair[1][1][2][0].state).toBe("eliminated");
  });
});

describe("replaceConfirm", () => {
  const sizes = [4, 4, 4];

  it("wipes user confirms in the same sub-row before asserting the new one", () => {
    const pair = emptyPair(sizes);
    set(pair, 1, 0, 0, 0, "confirmed"); // user confirm: catA=0 at pin 0
    replaceConfirm(pair, 1, 0, 0, 1); // user now asserts catA=0 at pin 1
    expect(pair[1][0][0][0]).toEqual({ state: "empty", source: "user" });
    expect(pair[1][0][0][1]).toEqual({ state: "confirmed", source: "user" });
  });

  it("wipes user confirms in the same sub-col before asserting the new one", () => {
    const pair = emptyPair(sizes);
    set(pair, 1, 0, 0, 1, "confirmed"); // user confirm: catA=0 at pin 1
    replaceConfirm(pair, 1, 2, 0, 1); // user now asserts catA=2 at pin 1
    expect(pair[1][0][0][1]).toEqual({ state: "empty", source: "user" });
    expect(pair[1][2][0][1]).toEqual({ state: "confirmed", source: "user" });
  });

  it("leaves auto-sourced confirms alone in the same sub-row", () => {
    const pair = emptyPair(sizes);
    // Prime the pinned state so (catA=0, catB=0) gets auto-confirmed by
    // deriveCrossSubgrids, then simulate replacing it with a user click on
    // (catA=0, catB=1). The auto cell shouldn't be touched by replaceConfirm
    // itself — recomputeAuto will sort it out afterward.
    set(pair, 1, 0, 0, 1, "confirmed");
    set(pair, 2, 0, 0, 1, "confirmed");
    recomputeAuto(pair, 0, sizes);
    expect(pair[1][0][2][0].state).toBe("confirmed"); // auto
    expect(pair[1][0][2][0].source).toBe("auto");
    replaceConfirm(pair, 1, 0, 2, 1);
    expect(pair[1][0][2][0]).toEqual({ state: "confirmed", source: "auto" });
    expect(pair[1][0][2][1]).toEqual({ state: "confirmed", source: "user" });
  });
});
