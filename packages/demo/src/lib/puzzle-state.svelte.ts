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
  recomputeAuto as recomputeAutoPure,
  replaceConfirm,
  setPair,
  type CellCoord,
  type CellState,
  type PairState,
} from "./pair-logic";

export type { Cell, CellCoord, CellState, PairState } from "./pair-logic";

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
   *
   * The library's positions are always relative to `pinnedAxis`, so hints land
   * in the pinned sub-grids. PuzzleGrid renders the staircase anchored on
   * `displayAxisCategory` instead. In the default config these coincide; when
   * `grid.displayAxis` is explicitly set to a non-pinned axis, the horizontal
   * anchor in the UI and the sub-grids hints write into diverge — deduce()
   * output will still render correctly, just not along the user's chosen
   * visual anchor.
   *
   * Throws if the library emits a fact about the pinned axis itself (should
   * be impossible given identity pinning — if we see one, it's a library
   * regression worth surfacing loudly rather than silently skipping).
   */
  function libEffToPair(
    e: { value: string; position: number },
    pi: number,
  ): CellCoord {
    const [catV, viOfV] = findCatValOf(e.value);
    if (catV === pi) {
      throw new Error(
        `Library emitted a positional fact about the pinned axis itself ` +
          `(value="${e.value}", position=${e.position}). This should be ` +
          `tautological under identity pinning — library regression.`,
      );
    }
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

  function recomputeAuto() {
    if (!puzzle) throw new Error("No active puzzle");
    recomputeAutoPure(pair, pinIdx());
  }

  function toggleConfirm(coord: CellCoord) {
    if (coord.a === coord.b) return;
    const cur = pair[coord.a][coord.i][coord.b][coord.j];
    if (cur.state === "confirmed") {
      setPair(pair, coord, "empty", "user");
    } else {
      // replaceConfirm handles the "clicking a new cell replaces the old
      // guess on the same line" classic UX. Scope is this sub-grid's
      // sub-row/sub-col only — a cross-confirm that contradicts pinned-axis
      // state elsewhere is still allowed (matches Puzzle Baron / Brainzilla;
      // Check catches it at verify time).
      replaceConfirm(pair, coord);
    }
    recomputeAuto();
    message = null;
  }

  function toggleEliminate(coord: CellCoord) {
    if (coord.a === coord.b) return;
    const cur = pair[coord.a][coord.i][coord.b][coord.j];
    setPair(
      pair,
      coord,
      cur.state === "eliminated" ? "empty" : "eliminated",
      "user",
    );
    recomputeAuto();
    message = null;
  }

  /** Iterate each unique (catA < catB) sub-grid and every cell inside it. */
  function forEachPair(fn: (coord: CellCoord) => void) {
    if (!puzzle) throw new Error("No active puzzle");
    const N = puzzle.grid.categories.length;
    for (let a = 0; a < N; a++) {
      const aSize = puzzle.grid.categories[a].values.length;
      for (let b = a + 1; b < N; b++) {
        const bSize = puzzle.grid.categories[b].values.length;
        for (let i = 0; i < aSize; i++) {
          for (let j = 0; j < bSize; j++) {
            fn({ a, i, b, j });
          }
        }
      }
    }
  }

  function checkSolution(): boolean {
    if (!puzzle) throw new Error("No active puzzle");
    let correct = 0;
    let wrong = 0;
    forEachPair(({ a, i, b, j }) => {
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
        text: `Looking good so far! ${totalTruePairs - correct} cell${totalTruePairs - correct === 1 ? "" : "s"} left.`,
        type: "info",
      };
      return false;
    }
    message = { text: "Correct! Puzzle solved!", type: "success" };
    return true;
  }

  function showSolution() {
    forEachPair((coord) => {
      const { a, i, b, j } = coord;
      setPair(pair, coord, solutionPair(a, i, b, j), "user");
    });
    message = { text: "Solution revealed.", type: "info" };
  }

  function hasWrongMoves(): boolean {
    let wrong = false;
    forEachPair(({ a, i, b, j }) => {
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
    forEachPair((coord) => {
      const { a, i, b, j } = coord;
      const cur = pair[a][i][b][j];
      if (cur.source !== "user") return;
      const sol = solutionPair(a, i, b, j);
      if (cur.state === "confirmed" && sol !== "confirmed") {
        wrongs.push(coord);
      } else if (cur.state === "eliminated" && sol === "confirmed") {
        wrongs.push(coord);
      }
    });
    for (const w of wrongs) {
      setPair(pair, w, "empty", "user");
    }
    if (wrongs.length > 0) recomputeAuto();
    return wrongs.length > 0;
  }

  function findNextStep(): DeductionStep | null {
    if (!puzzle) throw new Error("No active puzzle");
    if (hintSteps.length === 0) {
      hintSteps = deduce(puzzle.constraints, puzzle.grid).steps;
    }
    const pi = pinIdx();
    for (const candidate of hintSteps) {
      const newElims = candidate.eliminations.filter((e) => {
        const coord = libEffToPair(e, pi);
        return pair[coord.a][coord.i][coord.b][coord.j].state === "empty";
      });
      const newAssigns = candidate.assignments.filter((a) => {
        const coord = libEffToPair(a, pi);
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
    // Library facts write with source: "user" — once the user clicks a hint,
    // we treat the deduction as committed guesses (same as clicking the cell
    // themselves). Trade-off: clearWrongMoves can't distinguish hint-applied
    // cells from user-typed ones, which is fine because they should never be
    // wrong anyway (the library only produces valid deductions).
    const pi = pinIdx();
    for (const e of step.eliminations) {
      const coord = libEffToPair(e, pi);
      if (pair[coord.a][coord.i][coord.b][coord.j].state === "empty") {
        setPair(pair, coord, "eliminated", "user");
      }
    }
    for (const a of step.assignments) {
      const coord = libEffToPair(a, pi);
      if (pair[coord.a][coord.i][coord.b][coord.j].state !== "confirmed") {
        setPair(pair, coord, "confirmed", "user");
      }
    }
    recomputeAuto();
    const prefix = hadWrongMoves ? "Incorrect moves cleared. " : "";
    message = { text: prefix + step.explanation, type: "info" };
  }

  function revealCell() {
    const candidates: CellCoord[] = [];
    forEachPair((coord) => {
      const { a, i, b, j } = coord;
      if (solutionPair(a, i, b, j) !== "confirmed") return;
      if (pair[a][i][b][j].state !== "confirmed") candidates.push(coord);
    });
    if (candidates.length === 0) {
      message = { text: "All pairs are already confirmed!", type: "info" };
      return;
    }
    const c = candidates[Math.floor(Math.random() * candidates.length)];
    setPair(pair, c, "confirmed", "user");
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
