import {
  generate,
  deduce,
  type Puzzle,
  type Difficulty,
  type DeductionStep,
} from "logic-grid";
import type { ThemeResult } from "logic-grid-ai";
import { buildNudgeText } from "./nudge-text";

export type CellState = "empty" | "eliminated" | "confirmed";

export function createPuzzleState() {
  let puzzle = $state<Puzzle | null>(null);
  let grid = $state<CellState[][]>([]);
  let genTime = $state(0);
  let loading = $state(false);
  let loadingMessage = $state("Generating…");
  let message = $state<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);
  let hintSteps = $state<DeductionStep[]>([]);

  function newPuzzle(
    size: number,
    categories: number,
    difficulty?: Difficulty,
    theme?: string,
    clueStyle?: string,
  ) {
    loading = true;
    loadingMessage = theme ? "Generating theme…" : "Generating…";
    message = null;

    // Defer so the UI can show the loading state before blocking
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
              positionNoun: themeResult.positionNoun,
              positionPreposition: themeResult.positionPreposition,
            });
          } else {
            puzzle = generate({
              size,
              categories,
              difficulty,
              seed: Date.now(),
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
        // grid[valueIndex][position] — one row per value across all categories
        const totalValues = puzzle.grid.categories.reduce(
          (sum: number, c) => sum + c.values.length,
          0,
        );
        grid = Array.from({ length: totalValues }, () =>
          Array.from({ length: puzzle!.grid.size }, () => "empty" as CellState),
        );
        hintSteps = [];
        loading = false;
      })();
    }, 0);
  }

  function getValueIndex(
    categoryIndex: number,
    valueIndexInCategory: number,
  ): number {
    let offset = 0;
    for (let i = 0; i < categoryIndex; i++) {
      offset += puzzle!.grid.categories[i].values.length;
    }
    return offset + valueIndexInCategory;
  }

  function findValueIdx(value: string): number {
    if (!puzzle) throw new Error("No active puzzle");
    for (let ci = 0; ci < puzzle.grid.categories.length; ci++) {
      const vi = puzzle.grid.categories[ci].values.indexOf(value);
      if (vi !== -1) return getValueIndex(ci, vi);
    }
    throw new Error(`Unknown value: ${value}`);
  }

  /** Click: toggle confirmed (empty ↔ ✓). Auto-eliminates/restores. */
  function toggleConfirm(valueIdx: number, position: number) {
    if (grid[valueIdx][position] === "confirmed") {
      // Un-confirm: restore auto-eliminated cells
      grid[valueIdx][position] = "empty";
      autoRestore(valueIdx, position);
    } else {
      // Confirm: set ✓ and auto-eliminate row/category
      grid[valueIdx][position] = "confirmed";
      autoEliminate(valueIdx, position);
    }
    message = null;
  }

  /** Right-click: toggle eliminated. Confirmed → eliminated (un-confirms first). */
  function toggleEliminate(valueIdx: number, position: number) {
    if (grid[valueIdx][position] === "eliminated") {
      grid[valueIdx][position] = "empty";
    } else {
      if (grid[valueIdx][position] === "confirmed") {
        grid[valueIdx][position] = "empty"; // un-confirm before restore
        autoRestore(valueIdx, position);
      }
      grid[valueIdx][position] = "eliminated";
    }
    message = null;
  }

  function categoryRange(valueIdx: number): [number, number] {
    if (!puzzle) return [0, 0];
    let start = 0;
    for (const cat of puzzle.grid.categories) {
      const end = start + cat.values.length;
      if (valueIdx >= start && valueIdx < end) return [start, end];
      start = end;
    }
    return [0, 0];
  }

  function autoEliminate(confirmedValueIdx: number, confirmedPosition: number) {
    if (!puzzle) return;
    const [catStart, catEnd] = categoryRange(confirmedValueIdx);

    // Eliminate same value from other positions (flip existing ✓ to ✗, cascading)
    for (let p = 0; p < puzzle.grid.size; p++) {
      if (p !== confirmedPosition) {
        if (grid[confirmedValueIdx][p] === "confirmed") {
          grid[confirmedValueIdx][p] = "empty";
          autoRestore(confirmedValueIdx, p);
          grid[confirmedValueIdx][p] = "eliminated";
        } else if (grid[confirmedValueIdx][p] === "empty") {
          grid[confirmedValueIdx][p] = "eliminated";
        }
      }
    }

    // Eliminate other values in same category from this position
    for (let v = catStart; v < catEnd; v++) {
      if (v !== confirmedValueIdx) {
        if (grid[v][confirmedPosition] === "confirmed") {
          grid[v][confirmedPosition] = "empty";
          autoRestore(v, confirmedPosition);
          grid[v][confirmedPosition] = "eliminated";
        } else if (grid[v][confirmedPosition] === "empty") {
          grid[v][confirmedPosition] = "eliminated";
        }
      }
    }
  }

  function autoRestore(valueIdx: number, position: number) {
    if (!puzzle) return;
    const [catStart, catEnd] = categoryRange(valueIdx);

    // Restore same value's other positions — only if NO confirm forces the cross
    // (check both: another confirm in the same row, OR a confirm in that column)
    for (let p = 0; p < puzzle.grid.size; p++) {
      if (p !== position && grid[valueIdx][p] === "eliminated") {
        if (
          !hasConfirmInRow(valueIdx) &&
          !hasConfirmInColumn(valueIdx, p, catStart, catEnd)
        ) {
          grid[valueIdx][p] = "empty";
        }
      }
    }

    // Restore other values in same category at this position — only if NO confirm forces it
    // (check both: a confirm in that column, OR a confirm in that value's row)
    for (let v = catStart; v < catEnd; v++) {
      if (v !== valueIdx && grid[v][position] === "eliminated") {
        if (
          !hasConfirmInColumn(v, position, catStart, catEnd) &&
          !hasConfirmInRow(v)
        ) {
          grid[v][position] = "empty";
        }
      }
    }
  }

  function hasConfirmInRow(valueIdx: number): boolean {
    if (!puzzle) return false;
    for (let p = 0; p < puzzle.grid.size; p++) {
      if (grid[valueIdx][p] === "confirmed") return true;
    }
    return false;
  }

  function hasConfirmInColumn(
    valueIdx: number,
    position: number,
    catStart: number,
    catEnd: number,
  ): boolean {
    for (let v = catStart; v < catEnd; v++) {
      if (v !== valueIdx && grid[v][position] === "confirmed") return true;
    }
    return false;
  }

  function checkSolution(): boolean {
    if (!puzzle) return false;

    let correctCount = 0;
    let wrongCount = 0;
    const totalValues = puzzle.grid.categories.reduce(
      (sum: number, c) => sum + c.values.length,
      0,
    );

    for (let ci = 0; ci < puzzle.grid.categories.length; ci++) {
      const cat = puzzle.grid.categories[ci];
      for (let vi = 0; vi < cat.values.length; vi++) {
        const valueIdx = getValueIndex(ci, vi);
        const expectedPos = puzzle.solution[ci][cat.values[vi]];

        for (let p = 0; p < puzzle.grid.size; p++) {
          if (grid[valueIdx][p] === "confirmed") {
            if (p === expectedPos) correctCount++;
            else wrongCount++;
          }
        }
      }
    }

    if (correctCount === 0 && wrongCount === 0) {
      message = {
        text: "No cells confirmed yet. Click cells to mark your answers.",
        type: "info",
      };
      return false;
    }

    if (wrongCount > 0) {
      message = {
        text: "Not quite right. Some confirmed cells are incorrect.",
        type: "error",
      };
      return false;
    }

    if (correctCount < totalValues) {
      message = {
        text: `Looking good so far! ${totalValues - correctCount} values left to place.`,
        type: "info",
      };
      return false;
    }

    message = { text: "Correct! Puzzle solved!", type: "success" };
    return true;
  }

  function showSolution() {
    if (!puzzle) return;

    for (let ci = 0; ci < puzzle.grid.categories.length; ci++) {
      const cat = puzzle.grid.categories[ci];
      for (let vi = 0; vi < cat.values.length; vi++) {
        const valueIdx = getValueIndex(ci, vi);
        const correctPos = puzzle.solution[ci][cat.values[vi]];
        for (let p = 0; p < puzzle.grid.size; p++) {
          grid[valueIdx][p] = p === correctPos ? "confirmed" : "eliminated";
        }
      }
    }
    message = { text: "Solution revealed.", type: "info" };
  }

  /** Check whether any user move contradicts the solution (without clearing). */
  function hasWrongMoves(): boolean {
    if (!puzzle) return false;
    for (let ci = 0; ci < puzzle.grid.categories.length; ci++) {
      const cat = puzzle.grid.categories[ci];
      for (let vi = 0; vi < cat.values.length; vi++) {
        const valueIdx = getValueIndex(ci, vi);
        const correctPos = puzzle.solution[ci][cat.values[vi]];
        for (let p = 0; p < puzzle.grid.size; p++) {
          if (grid[valueIdx][p] === "confirmed" && p !== correctPos)
            return true;
        }
        if (grid[valueIdx][correctPos] === "eliminated") return true;
      }
    }
    return false;
  }

  /** Undo every user move that contradicts the solution. Returns true if anything was cleared. */
  function clearWrongMoves(): boolean {
    if (!puzzle) return false;
    let cleared = false;
    // Undo wrong confirmations first (triggers autoRestore to clean up cascades)
    for (let ci = 0; ci < puzzle.grid.categories.length; ci++) {
      const cat = puzzle.grid.categories[ci];
      for (let vi = 0; vi < cat.values.length; vi++) {
        const valueIdx = getValueIndex(ci, vi);
        const correctPos = puzzle.solution[ci][cat.values[vi]];
        for (let p = 0; p < puzzle.grid.size; p++) {
          if (grid[valueIdx][p] === "confirmed" && p !== correctPos) {
            grid[valueIdx][p] = "empty";
            autoRestore(valueIdx, p);
            cleared = true;
          }
        }
      }
    }
    // Restore cells where the user eliminated the correct answer
    for (let ci = 0; ci < puzzle.grid.categories.length; ci++) {
      const cat = puzzle.grid.categories[ci];
      for (let vi = 0; vi < cat.values.length; vi++) {
        const valueIdx = getValueIndex(ci, vi);
        const correctPos = puzzle.solution[ci][cat.values[vi]];
        if (grid[valueIdx][correctPos] === "eliminated") {
          grid[valueIdx][correctPos] = "empty";
          cleared = true;
        }
      }
    }
    return cleared;
  }

  /**
   * Find the next deduction step whose effects haven't been applied yet.
   * Returns a shallow copy with only the unapplied eliminations/assignments,
   * so nudge text and hint application only reference remaining work.
   */
  function findNextStep(): DeductionStep | null {
    if (!puzzle) return null;

    // Lazily compute deduction steps on first request.
    if (hintSteps.length === 0) {
      hintSteps = deduce(puzzle.constraints, puzzle.grid).steps;
    }

    for (const candidate of hintSteps) {
      const newElims = candidate.eliminations.filter((e) => {
        const cell = grid[findValueIdx(e.value)][e.position];
        return cell === "empty" || cell === "confirmed";
      });
      const newAssigns = candidate.assignments.filter((a) => {
        return grid[findValueIdx(a.value)][a.position] !== "confirmed";
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
    if (!puzzle) return;

    const hadWrongMoves = clearWrongMoves();
    const step = findNextStep();

    if (!step) {
      message = { text: "No more logical deductions available.", type: "info" };
      return;
    }

    // Apply the hint's eliminations and assignments to the grid
    for (const e of step.eliminations) {
      const valueIdx = findValueIdx(e.value);
      if (grid[valueIdx][e.position] === "empty") {
        grid[valueIdx][e.position] = "eliminated";
      }
    }
    for (const a of step.assignments) {
      const valueIdx = findValueIdx(a.value);
      if (grid[valueIdx][a.position] !== "confirmed") {
        grid[valueIdx][a.position] = "confirmed";
        autoEliminate(valueIdx, a.position);
      }
    }

    const prefix = hadWrongMoves ? "Incorrect moves cleared. " : "";
    message = { text: prefix + step.explanation, type: "info" };
  }

  function revealCell() {
    if (!puzzle) return;

    // Find all unconfirmed correct cells
    const candidates: [number, number][] = [];
    for (let ci = 0; ci < puzzle.grid.categories.length; ci++) {
      const cat = puzzle.grid.categories[ci];
      for (let vi = 0; vi < cat.values.length; vi++) {
        const valueIdx = getValueIndex(ci, vi);
        const correctPos = puzzle.solution[ci][cat.values[vi]];
        if (grid[valueIdx][correctPos] !== "confirmed") {
          candidates.push([valueIdx, correctPos]);
        }
      }
    }

    if (candidates.length === 0) {
      message = { text: "All cells are already confirmed!", type: "info" };
      return;
    }

    const [valueIdx, pos] =
      candidates[Math.floor(Math.random() * candidates.length)];
    grid[valueIdx][pos] = "confirmed";
    autoEliminate(valueIdx, pos);
    message = { text: "One cell revealed.", type: "info" };
  }

  function clear() {
    if (!puzzle) return;
    for (let v = 0; v < grid.length; v++) {
      for (let p = 0; p < grid[v].length; p++) {
        grid[v][p] = "empty";
      }
    }
    message = null;
  }

  return {
    get puzzle() {
      return puzzle;
    },
    get grid() {
      return grid;
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
    getValueIndex,
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
