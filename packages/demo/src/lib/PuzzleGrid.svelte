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
  let touchMoved = false;
  let startX = 0;
  let startY = 0;
  const MOVE_THRESHOLD = 10; // px — cancel tap if finger moves further

  function handleTouchStart(e: TouchEvent, valueIdx: number, p: number) {
    longPressed = false;
    touchMoved = false;
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    pressTimer = setTimeout(() => {
      if (!touchMoved) {
        longPressed = true;
        onEliminate(valueIdx, p);
      }
    }, 400);
  }

  function handleTouchMove(e: TouchEvent) {
    if (touchMoved) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
      touchMoved = true;
      if (pressTimer) clearTimeout(pressTimer);
    }
  }

  function handleTouchEnd() {
    if (pressTimer) clearTimeout(pressTimer);
  }

  function handleClick(valueIdx: number, p: number) {
    if (longPressed) {
      longPressed = false;
      return; // Already handled by long-press
    }
    if (touchMoved) return; // Was a scroll, not a tap
    onConfirm(valueIdx, p);
  }
</script>

<div class="grid-wrapper">
  <table class="puzzle-grid">
    <thead>
      <tr>
        <th class="category-header"></th>
        <th class="value-header"></th>
        <th class="position-noun-header" colspan={grid.size}>{grid.positionNoun?.[0] ?? "house"}</th>
      </tr>
      <tr>
        <th class="category-header"></th>
        <th class="value-header"></th>
        {#each Array(grid.size) as _, p}
          <th class="position-number">{p + 1}</th>
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
                class="cell"
                class:eliminated={state === "eliminated"}
                class:confirmed={state === "confirmed"}
                onclick={() => handleClick(valueIdx, p)}
                ontouchstart={(e) => handleTouchStart(e, valueIdx, p)}
                ontouchmove={handleTouchMove}
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

  .category-header, .value-header {
    padding: 0.375rem 0.5rem;
    text-align: center;
    font-weight: 600;
    color: #475569;
  }

  .value-header {
    border-right: 2px solid #94a3b8;
  }

  .position-noun-header {
    padding: 0.375rem 0.5rem;
    text-align: center;
    font-weight: 600;
    color: #475569;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    text-transform: capitalize;
  }

  .position-number {
    padding: 0.375rem 0.5rem;
    text-align: center;
    font-weight: 600;
    color: #475569;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-bottom: 2px solid #94a3b8;
  }

  .category-label {
    padding: 0.375rem 0.75rem;
    font-weight: 600;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    vertical-align: middle;
    white-space: nowrap;
    text-transform: capitalize;
  }

  .value-label {
    padding: 0.375rem 0.75rem;
    border: 1px solid #cbd5e1;
    border-right: 2px solid #94a3b8;
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
