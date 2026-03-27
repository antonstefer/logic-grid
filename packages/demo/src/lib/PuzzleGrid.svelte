<script lang="ts">
  import type { Grid } from "logic-grid";
  import type { CellState } from "./puzzle-state.svelte";

  let {
    grid,
    puzzleGrid,
    cellStates,
    onConfirm,
    onEliminate,
  }: {
    grid: Grid;
    puzzleGrid: Grid;
    cellStates: CellState[][];
    onConfirm: (valueIdx: number, position: number) => void;
    onEliminate: (valueIdx: number, position: number) => void;
  } = $props();

  function getValueIndex(catIdx: number, valIdx: number): number {
    let offset = 0;
    for (let i = 0; i < catIdx; i++) {
      offset += puzzleGrid.categories[i].values.length;
    }
    return offset + valIdx;
  }

  function cellSymbol(state: CellState): string {
    if (state === "eliminated") return "\u2717";
    if (state === "confirmed") return "\u2713";
    return "";
  }

  // Touch long-press detection: long-press = eliminate, tap = confirm.
  // Desktop: left-click = confirm, right-click = eliminate.
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressed = false;

  function handleTouchStart(valueIdx: number, p: number) {
    longPressed = false;
    pressTimer = setTimeout(() => {
      longPressed = true;
      onEliminate(valueIdx, p);
    }, 400);
  }

  function handleTouchEnd() {
    if (pressTimer) clearTimeout(pressTimer);
  }

  function handleClick(valueIdx: number, p: number) {
    if (longPressed) {
      longPressed = false;
      return; // Already handled by long-press
    }
    onConfirm(valueIdx, p);
  }
</script>

<div class="grid-wrapper">
  <table class="puzzle-grid">
    <thead>
      <tr>
        <th class="category-header"></th>
        <th class="value-header"></th>
        {#each Array(grid.size) as _, p}
          <th class="position-header">{p + 1}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each puzzleGrid.categories as cat, catIdx}
        {#each cat.values as value, valIdx}
          {@const valueIdx = getValueIndex(catIdx, valIdx)}
          <tr class:category-first={valIdx === 0}>
            {#if valIdx === 0}
              <td class="category-label" rowspan={cat.values.length}>{cat.name}</td>
            {/if}
            <td class="value-label">{value}</td>
            {#each Array(grid.size) as _, p}
              {@const state = cellStates[valueIdx]?.[p] ?? "empty"}
              <td
                class="cell {state}"
                onclick={() => handleClick(valueIdx, p)}
                ontouchstart={() => handleTouchStart(valueIdx, p)}
                ontouchend={handleTouchEnd}
                oncontextmenu={(e) => e.preventDefault()}
                onmouseup={(e) => { if (e.button === 2) onEliminate(valueIdx, p); }}
                role="button"
                tabindex="0"
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onConfirm(valueIdx, p);
                  if (e.key === 'Delete' || e.key === 'Backspace') onEliminate(valueIdx, p);
                }}
              >
                {cellSymbol(state)}
              </td>
            {/each}
          </tr>
        {/each}
      {/each}
    </tbody>
  </table>
</div>

<style>
  .grid-wrapper {
    overflow-x: auto;
  }

  .puzzle-grid {
    border-collapse: collapse;
    font-size: 0.875rem;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
  }

  .category-header, .value-header, .position-header {
    padding: 0.375rem 0.5rem;
    text-align: center;
    font-weight: 600;
    color: #475569;
  }

  .category-label {
    padding: 0.375rem 0.75rem;
    font-weight: 600;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    vertical-align: middle;
    white-space: nowrap;
  }

  .value-label {
    padding: 0.375rem 0.75rem;
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    white-space: nowrap;
  }

  .cell {
    width: 2.5rem;
    height: 2.5rem;
    text-align: center;
    vertical-align: middle;
    border: 1px solid #cbd5e1;
    cursor: pointer;
    user-select: none;
    font-size: 1.125rem;
    transition: background-color 0.1s;
  }

  .cell:hover {
    background: #e2e8f0;
  }

  .cell.eliminated {
    background: #fef2f2;
    color: #dc2626;
  }

  .cell.confirmed {
    background: #dcfce7;
    color: #16a34a;
    font-weight: 700;
  }

  .category-first td {
    border-top: 2px solid #94a3b8;
  }
</style>
