import {
  generate,
  deduce,
  pinnedAxis,
  type Category,
  type Puzzle,
  type Difficulty,
  type DeductionStep,
} from "logic-grid";
import type { ThemeResult } from "logic-grid-ai";
import { buildNudgeText } from "./nudge-text";
import {
  deriveCrossSubgrids,
  subgridUniquenessRule,
  type CellCoord,
  type CellSource,
  type CellState,
  type PairState,
  type PropagationRule,
} from "./pair-logic";

export type { Cell, CellState, PairState } from "./pair-logic";

const rules: PropagationRule[] = [subgridUniquenessRule];

export function createPuzzleState() {
  let puzzle = $state<Puzzle | null>(null);
  let pair = $state<PairState>([]);
  let genTime = $state(0);
  let loading = $state(false);
  let loadingMessage = $state("Generating…");
  let message = $state<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);
  let hintSteps = $state<DeductionStep[]>([]);

  interface NewPuzzleOptions {
    size: number;
    categories: number;
    difficulty?: Difficulty;
    theme?: string;
    clueStyle?: string;
    customCategories?: Category[];
  }

  function initPair(categories: Category[]): PairState {
    const N = categories.length;
    const p: PairState = [];
    for (let a = 0; a < N; a++) {
      p[a] = [];
      for (let i = 0; i < categories[a].values.length; i++) {
        p[a][i] = [];
        for (let b = 0; b < N; b++) {
          p[a][i][b] = [];
          for (let j = 0; j < categories[b].values.length; j++) {
            p[a][i][b][j] = { state: "empty", source: "user" };
          }
        }
      }
    }
    return p;
  }

  function newPuzzle(opts: NewPuzzleOptions) {
    const { size, categories, difficulty, theme, clueStyle, customCategories } =
      opts;
    loading = true;
    loadingMessage = theme ? "Generating theme…" : "Generating…";
    message = null;

    setTimeout(() => {
      void (async () => {
        try {
          const t0 = performance.now();
          if (theme) {
            const res = await fetch("/api/theme", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ theme, size, categories }),
            });
            if (!res.ok) {
              let errorMsg = "Theme generation failed";
              try {
                const body = (await res.json()) as { error: string };
                if (body.error) errorMsg = body.error;
              } catch {
                // non-JSON response (e.g. HTML error page)
              }
              throw new Error(errorMsg);
            }
            const themeResult = (await res.json()) as ThemeResult;
            puzzle = generate({
              size,
              categories,
              difficulty,
              seed: Date.now(),
              categoryNames: themeResult.categories,
            });
          } else {
            puzzle = generate({
              size,
              categories,
              difficulty,
              seed: Date.now(),
              categoryNames: customCategories,
            });
          }
          if (clueStyle && puzzle) {
            loadingMessage = "Rewriting clues…";
            const res = await fetch("/api/rewrite-clues", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                clues: puzzle.clues,
                style: clueStyle,
              }),
            });
            if (!res.ok) {
              let errorMsg = "Clue rewriting failed";
              try {
                const body = (await res.json()) as { error: string };
                if (body.error) errorMsg = body.error;
              } catch {
                // non-JSON response (e.g. HTML error page)
              }
              throw new Error(errorMsg);
            }
            const rewriteBody = (await res.json()) as {
              clues: typeof puzzle.clues;
            };
            puzzle = { ...puzzle, clues: rewriteBody.clues };
          }
          genTime = Math.round(performance.now() - t0);
        } catch (e) {
          message = {
            text: e instanceof Error ? e.message : String(e),
            type: "error",
          };
          loading = false;
          loadingMessage = "Generating…";
          return;
        }
        pair = initPair(puzzle.grid.categories);
        hintSteps = [];
        loading = false;
        loadingMessage = "Generating…";
      })();
    }, 0);
  }

  function findCatValOf(value: string): [number, number] {
    if (!puzzle) throw new Error("No active puzzle");
    for (let ci = 0; ci < puzzle.grid.categories.length; ci++) {
      const vi = puzzle.grid.categories[ci].values.indexOf(value);
      if (vi !== -1) return [ci, vi];
    }
    throw new Error(`Unknown value: ${value}`);
  }

  function pinIdx(): number {
    if (!puzzle) throw new Error("No active puzzle");
    const pin = pinnedAxis(puzzle.grid);
    if (!pin) throw new Error("Grid has no pinned axis");
    return puzzle.grid.categories.indexOf(pin);
  }

  /**
   * Translate a library-produced positional fact {value, position} to a pairwise coord.
   * Position p means "index p on the pinned axis" — so the cell is (catOfValue, pinnedAxis).
   * Returns null if the value belongs to the pinned axis itself (tautological by identity).
   */
  function libEffToPair(e: {
    value: string;
    position: number;
  }): CellCoord | null {
    const [catV, viOfV] = findCatValOf(e.value);
    const pi = pinIdx();
    if (catV === pi) return null;
    return { a: catV, i: viOfV, b: pi, j: e.position };
  }

  /** Expected state for pair (a,i,b,j) given the puzzle's solution. */
  function solutionPair(a: number, i: number, b: number, j: number): CellState {
    if (!puzzle) throw new Error("No active puzzle");
    const aVal = puzzle.grid.categories[a].values[i];
    const bVal = puzzle.grid.categories[b].values[j];
    const aPos = puzzle.solution[a][aVal];
    const bPos = puzzle.solution[b][bVal];
    return aPos === bPos ? "confirmed" : "eliminated";
  }

  /** Single writer: always mirrors to preserve pair[a][i][b][j] === pair[b][j][a][i]. */
  function setPair(
    a: number,
    i: number,
    b: number,
    j: number,
    state: CellState,
    source: CellSource,
  ) {
    if (a === b) return;
    pair[a][i][b][j] = { state, source };
    pair[b][j][a][i] = { state, source };
  }

  /** Fixed-point runner. New rules plug in via `rules[]` without touching call sites. */
  function applyRules(start: CellCoord) {
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
          // Don't clobber user-set non-empty cells; allow overwriting other auto writes.
          if (cur.state !== "empty" && cur.source === "user") continue;
          setPair(w.a, w.i, w.b, w.j, w.state, "auto");
          queue.push({ a: w.a, i: w.i, b: w.b, j: w.j });
        }
      }
    }
  }

  /**
   * Derive cross-sub-grid pair state from pinned-axis knowledge. Translates
   * library positional facts (which only touch pinned sub-grids) into their
   * implications for non-pinned sub-grids:
   *  - If a[i] and b[j] are both confirmed at the same pinned position → confirmed pair.
   *  - If every pinned position has at least one of them eliminated → eliminated pair.
   */
  function syncCrossSubgrids() {
    if (!puzzle) throw new Error("No active puzzle");
    const sizes = puzzle.grid.categories.map((c) => c.values.length);
    for (const w of deriveCrossSubgrids(pair, pinIdx(), sizes)) {
      setPair(w.a, w.i, w.b, w.j, w.state, "auto");
    }
  }

  /** Reset every auto-derived cell to empty so rules can re-run cleanly. */
  function clearAutoCells() {
    if (!puzzle) throw new Error("No active puzzle");
    const N = puzzle.grid.categories.length;
    for (let a = 0; a < N; a++) {
      for (let i = 0; i < pair[a].length; i++) {
        for (let b = 0; b < N; b++) {
          for (let j = 0; j < pair[a][i][b].length; j++) {
            if (pair[a][i][b][j].source === "auto") {
              pair[a][i][b][j] = { state: "empty", source: "user" };
            }
          }
        }
      }
    }
  }

  /**
   * Re-derive every auto cell from scratch based on current user cells. Called
   * after any user modification so un-confirms cleanly retract all dependent
   * auto propagation without per-rule undo bookkeeping.
   */
  function recomputeAuto() {
    clearAutoCells();
    forEachPair((a, i, b, j) => {
      if (pair[a][i][b][j].state === "confirmed") {
        applyRules({ a, i, b, j });
      }
    });
    syncCrossSubgrids();
  }

  function toggleConfirm(a: number, i: number, b: number, j: number) {
    if (a === b) return;
    const cur = pair[a][i][b][j];
    if (cur.state === "confirmed") {
      setPair(a, i, b, j, "empty", "user");
    } else {
      setPair(a, i, b, j, "confirmed", "user");
    }
    recomputeAuto();
    message = null;
  }

  function toggleEliminate(a: number, i: number, b: number, j: number) {
    if (a === b) return;
    const cur = pair[a][i][b][j];
    if (cur.state === "eliminated") {
      setPair(a, i, b, j, "empty", "user");
    } else {
      if (cur.state === "confirmed") {
        setPair(a, i, b, j, "empty", "user");
      }
      setPair(a, i, b, j, "eliminated", "user");
    }
    recomputeAuto();
    message = null;
  }

  /** Iterate each unique (catA < catB) sub-grid and every cell inside it. */
  function forEachPair(
    fn: (a: number, i: number, b: number, j: number) => void,
  ) {
    if (!puzzle) throw new Error("No active puzzle");
    const N = puzzle.grid.categories.length;
    for (let a = 0; a < N; a++) {
      const aSize = puzzle.grid.categories[a].values.length;
      for (let b = a + 1; b < N; b++) {
        const bSize = puzzle.grid.categories[b].values.length;
        for (let i = 0; i < aSize; i++) {
          for (let j = 0; j < bSize; j++) {
            fn(a, i, b, j);
          }
        }
      }
    }
  }

  function checkSolution(): boolean {
    if (!puzzle) throw new Error("No active puzzle");
    let correct = 0;
    let wrong = 0;
    forEachPair((a, i, b, j) => {
      if (pair[a][i][b][j].state !== "confirmed") return;
      if (solutionPair(a, i, b, j) === "confirmed") correct++;
      else wrong++;
    });
    const N = puzzle.grid.categories.length;
    const S = puzzle.grid.size;
    const totalTruePairs = ((N * (N - 1)) / 2) * S;

    if (correct === 0 && wrong === 0) {
      message = {
        text: "No cells confirmed yet. Click cells to mark your answers.",
        type: "info",
      };
      return false;
    }
    if (wrong > 0) {
      message = {
        text: "Not quite right. Some confirmed cells are incorrect.",
        type: "error",
      };
      return false;
    }
    if (correct < totalTruePairs) {
      message = {
        text: `Looking good so far! ${totalTruePairs - correct} pair${totalTruePairs - correct === 1 ? "" : "s"} left.`,
        type: "info",
      };
      return false;
    }
    message = { text: "Correct! Puzzle solved!", type: "success" };
    return true;
  }

  function showSolution() {
    forEachPair((a, i, b, j) => {
      setPair(a, i, b, j, solutionPair(a, i, b, j), "user");
    });
    message = { text: "Solution revealed.", type: "info" };
  }

  function hasWrongMoves(): boolean {
    let wrong = false;
    forEachPair((a, i, b, j) => {
      if (wrong) return;
      const cur = pair[a][i][b][j].state;
      const sol = solutionPair(a, i, b, j);
      if (cur === "confirmed" && sol !== "confirmed") wrong = true;
      if (cur === "eliminated" && sol === "confirmed") wrong = true;
    });
    return wrong;
  }

  function clearWrongMoves(): boolean {
    const wrongs: CellCoord[] = [];
    forEachPair((a, i, b, j) => {
      const cur = pair[a][i][b][j];
      if (cur.source !== "user") return;
      const sol = solutionPair(a, i, b, j);
      if (cur.state === "confirmed" && sol !== "confirmed") {
        wrongs.push({ a, i, b, j });
      } else if (cur.state === "eliminated" && sol === "confirmed") {
        wrongs.push({ a, i, b, j });
      }
    });
    for (const w of wrongs) {
      setPair(w.a, w.i, w.b, w.j, "empty", "user");
    }
    if (wrongs.length > 0) recomputeAuto();
    return wrongs.length > 0;
  }

  function findNextStep(): DeductionStep | null {
    if (!puzzle) throw new Error("No active puzzle");
    if (hintSteps.length === 0) {
      hintSteps = deduce(puzzle.constraints, puzzle.grid).steps;
    }
    for (const candidate of hintSteps) {
      const newElims = candidate.eliminations.filter((e) => {
        const coord = libEffToPair(e);
        if (!coord) return false;
        return pair[coord.a][coord.i][coord.b][coord.j].state === "empty";
      });
      const newAssigns = candidate.assignments.filter((a) => {
        const coord = libEffToPair(a);
        if (!coord) return false;
        return pair[coord.a][coord.i][coord.b][coord.j].state !== "confirmed";
      });
      if (newElims.length > 0 || newAssigns.length > 0) {
        return {
          ...candidate,
          eliminations: newElims,
          assignments: newAssigns,
        };
      }
    }
    return null;
  }

  function nudge() {
    if (hasWrongMoves()) {
      message = {
        text: "You have some incorrect moves. Try fixing those first, or use Explain Next Step.",
        type: "error",
      };
      return;
    }
    const step = findNextStep();
    if (!step) {
      message = { text: "No more logical deductions available.", type: "info" };
      return;
    }
    message = { text: buildNudgeText(step), type: "info" };
  }

  function hint() {
    const hadWrongMoves = clearWrongMoves();
    const step = findNextStep();
    if (!step) {
      message = { text: "No more logical deductions available.", type: "info" };
      return;
    }
    for (const e of step.eliminations) {
      const coord = libEffToPair(e);
      if (!coord) continue;
      if (pair[coord.a][coord.i][coord.b][coord.j].state === "empty") {
        setPair(coord.a, coord.i, coord.b, coord.j, "eliminated", "user");
      }
    }
    for (const a of step.assignments) {
      const coord = libEffToPair(a);
      if (!coord) continue;
      if (pair[coord.a][coord.i][coord.b][coord.j].state !== "confirmed") {
        setPair(coord.a, coord.i, coord.b, coord.j, "confirmed", "user");
      }
    }
    recomputeAuto();
    const prefix = hadWrongMoves ? "Incorrect moves cleared. " : "";
    message = { text: prefix + step.explanation, type: "info" };
  }

  function revealCell() {
    const candidates: CellCoord[] = [];
    forEachPair((a, i, b, j) => {
      if (solutionPair(a, i, b, j) !== "confirmed") return;
      if (pair[a][i][b][j].state !== "confirmed")
        candidates.push({ a, i, b, j });
    });
    if (candidates.length === 0) {
      message = { text: "All pairs are already confirmed!", type: "info" };
      return;
    }
    const c = candidates[Math.floor(Math.random() * candidates.length)];
    setPair(c.a, c.i, c.b, c.j, "confirmed", "user");
    recomputeAuto();
    message = { text: "One cell revealed.", type: "info" };
  }

  function clear() {
    if (!puzzle) throw new Error("No active puzzle");
    pair = initPair(puzzle.grid.categories);
    message = null;
  }

  return {
    get puzzle() {
      return puzzle;
    },
    get pair() {
      return pair;
    },
    get genTime() {
      return genTime;
    },
    get loading() {
      return loading;
    },
    get loadingMessage() {
      return loadingMessage;
    },
    get message() {
      return message;
    },
    newPuzzle,
    toggleConfirm,
    toggleEliminate,
    clear,
    checkSolution,
    showSolution,
    nudge,
    hint,
    revealCell,
  };
}
