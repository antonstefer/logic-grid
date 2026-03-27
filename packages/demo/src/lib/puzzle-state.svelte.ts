import { generate, type Puzzle, type Difficulty } from "logic-grid";

export type CellState = "empty" | "eliminated" | "confirmed";

export function createPuzzleState() {
  let puzzle = $state<Puzzle | null>(null);
  let grid = $state<CellState[][]>([]);
  let genTime = $state(0);
  let loading = $state(false);
  let message = $state<{ text: string; type: "success" | "error" | "info" } | null>(null);

  function newPuzzle(size: number, categories: number, difficulty?: Difficulty) {
    loading = true;
    message = null;

    // Defer so the UI can show the loading state before blocking
    setTimeout(() => {
      try {
        const t0 = performance.now();
        puzzle = generate({ size, categories, difficulty, seed: Date.now() });
        genTime = Math.round(performance.now() - t0);
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e));
        loading = false;
        return;
      }
      // grid[valueIndex][position] — one row per value across all categories
      const totalValues = puzzle.grid.categories.reduce((sum, c) => sum + c.values.length, 0);
      grid = Array.from({ length: totalValues }, () =>
        Array.from({ length: puzzle!.grid.size }, () => "empty" as CellState),
      );
      loading = false;
    }, 0);
  }

  function getValueIndex(categoryIndex: number, valueIndexInCategory: number): number {
    let offset = 0;
    for (let i = 0; i < categoryIndex; i++) {
      offset += puzzle!.grid.categories[i].values.length;
    }
    return offset + valueIndexInCategory;
  }

  function cycleCell(valueIdx: number, position: number) {
    const current = grid[valueIdx][position];
    if (current === "empty") {
      grid[valueIdx][position] = "eliminated";
    } else if (current === "eliminated") {
      grid[valueIdx][position] = "confirmed";
      autoEliminate(valueIdx, position);
    } else {
      grid[valueIdx][position] = "empty";
    }
    message = null;
  }

  function autoEliminate(confirmedValueIdx: number, confirmedPosition: number) {
    if (!puzzle) return;

    // Find which category this value belongs to
    let catStart = 0;
    let catEnd = 0;
    for (const cat of puzzle.grid.categories) {
      catEnd = catStart + cat.values.length;
      if (confirmedValueIdx >= catStart && confirmedValueIdx < catEnd) break;
      catStart = catEnd;
    }

    // Eliminate same value from other positions
    for (let p = 0; p < puzzle.grid.size; p++) {
      if (p !== confirmedPosition && grid[confirmedValueIdx][p] === "empty") {
        grid[confirmedValueIdx][p] = "eliminated";
      }
    }

    // Eliminate other values in same category from this position
    for (let v = catStart; v < catEnd; v++) {
      if (v !== confirmedValueIdx && grid[v][confirmedPosition] === "empty") {
        grid[v][confirmedPosition] = "eliminated";
      }
    }
  }

  function checkSolution(): boolean {
    if (!puzzle) return false;

    let correctCount = 0;
    let wrongCount = 0;
    const totalValues = puzzle.grid.categories.reduce(
      (sum, c) => sum + c.values.length,
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
      message = { text: "No cells confirmed yet. Click cells to mark your answers.", type: "info" };
      return false;
    }

    if (wrongCount > 0) {
      message = { text: "Not quite right. Some confirmed cells are incorrect.", type: "error" };
      return false;
    }

    if (correctCount < totalValues) {
      message = { text: `Looking good so far! ${totalValues - correctCount} values left to place.`, type: "info" };
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

  function hint() {
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

    const [valueIdx, pos] = candidates[Math.floor(Math.random() * candidates.length)];
    grid[valueIdx][pos] = "confirmed";
    autoEliminate(valueIdx, pos);
    message = { text: "Hint: one cell revealed.", type: "info" };
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
    get puzzle() { return puzzle; },
    get grid() { return grid; },
    get genTime() { return genTime; },
    get loading() { return loading; },
    get message() { return message; },
    newPuzzle,
    getValueIndex,
    cycleCell,
    clear,
    checkSolution,
    showSolution,
    hint,
  };
}
