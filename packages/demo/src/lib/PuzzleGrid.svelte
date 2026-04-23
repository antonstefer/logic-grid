<script lang="ts">
  import type { Grid } from "logic-grid";
  import type { PairState, CellState } from "./puzzle-state.svelte";

  let {
    puzzleGrid,
    pair,
    onConfirm,
    onEliminate,
  }: {
    puzzleGrid: Grid;
    pair: PairState;
    onConfirm: (a: number, i: number, b: number, j: number) => void;
    onEliminate: (a: number, i: number, b: number, j: number) => void;
  } = $props();

  const S = $derived(puzzleGrid.size);
  const cats = $derived(puzzleGrid.categories);
  const N = $derived(cats.length);

  // Classic "staircase from upper-left" with the first category (typically the
  // ordered/pinned axis like House 1..N) on the TOP — its values read left-to-
  // right matching "right of" / "left of" clue phrasing. Row axis holds the
  // remaining categories reversed so sub-grid (p, q) renders a unique pair
  // whenever p + q <= N - 2. For N=4 (A,B,C,D): top = [A,B,C]; rowCats = [D,C,B].
  const rowCats = $derived.by(() => {
    const list: { cat: (typeof cats)[number]; idx: number }[] = [];
    for (let i = cats.length - 1; i >= 1; i--) {
      list.push({ cat: cats[i], idx: i });
    }
    return list;
  });

  function valueLabel(catIdx: number, valIdx: number): string {
    const cat = cats[catIdx];
    if (cat.ordered === true && cat.displayLabels) {
      return cat.displayLabels[valIdx] ?? cat.values[valIdx];
    }
    return cat.values[valIdx];
  }

  function cellSymbol(state: CellState): string {
    if (state === "eliminated") return "\u2717";
    if (state === "confirmed") return "\u2713";
    return "";
  }

  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressed = false;
  let touchMoved = false;
  let startX = 0;
  let startY = 0;
  const MOVE_THRESHOLD = 10;

  function handleTouchStart(
    e: TouchEvent,
    a: number,
    i: number,
    b: number,
    j: number,
  ) {
    longPressed = false;
    touchMoved = false;
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    pressTimer = setTimeout(() => {
      if (!touchMoved) {
        longPressed = true;
        onEliminate(a, i, b, j);
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

  function handleClick(a: number, i: number, b: number, j: number) {
    if (longPressed) {
      longPressed = false;
      return;
    }
    if (touchMoved) return;
    onConfirm(a, i, b, j);
  }
</script>

<div
  class="grid-wrapper"
  style:--cell-size="clamp(1.4rem, calc(92vw / (2 + {S} * ({N} - 1))), 2.5rem)"
>
  <table class="puzzle-grid">
    <thead>
      <tr>
        <th class="corner"></th>
        <th class="corner"></th>
        {#each cats.slice(0, -1) as topCat}
          <th class="top-cat-label" colspan={S}>{topCat.name}</th>
        {/each}
      </tr>
      <tr>
        <th class="corner"></th>
        <th class="corner"></th>
        {#each cats.slice(0, -1) as topCat, q}
          {#each topCat.values as _, tvi}
            <th
              class="top-value"
              class:sub-start={tvi === 0}
              class:sub-end={tvi === S - 1}
            >
              <span>{valueLabel(q, tvi)}</span>
            </th>
          {/each}
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rowCats as { cat: rowCat, idx: rowCatIdx }, p}
        {#each rowCat.values as _, rvi}
          <tr>
            {#if rvi === 0}
              <th class="left-cat-label" rowspan={S}>{rowCat.name}</th>
            {/if}
            <th
              class="left-value"
              class:sub-start={rvi === 0}
              class:sub-end={rvi === S - 1}
            >
              {valueLabel(rowCatIdx, rvi)}
            </th>
            {#each cats.slice(0, -1) as topCat, q}
              {#if p + q <= N - 2}
                {#each topCat.values as _, tvi}
                  {@const cell = pair[rowCatIdx][rvi][q][tvi]}
                  <td
                    class="cell"
                    class:eliminated={cell.state === "eliminated"}
                    class:confirmed={cell.state === "confirmed"}
                    class:sub-start-col={tvi === 0}
                    class:sub-end-col={tvi === S - 1}
                    class:sub-start-row={rvi === 0}
                    class:sub-end-row={rvi === S - 1}
                    onclick={() => handleClick(rowCatIdx, rvi, q, tvi)}
                    ontouchstart={(e) =>
                      handleTouchStart(e, rowCatIdx, rvi, q, tvi)}
                    ontouchmove={handleTouchMove}
                    ontouchend={handleTouchEnd}
                    oncontextmenu={(e) => e.preventDefault()}
                    onmouseup={(e) => {
                      if (e.button === 2) onEliminate(rowCatIdx, rvi, q, tvi);
                    }}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        onConfirm(rowCatIdx, rvi, q, tvi);
                      if (e.key === "Delete" || e.key === "Backspace")
                        onEliminate(rowCatIdx, rvi, q, tvi);
                    }}
                  >
                    {cellSymbol(cell.state)}
                  </td>
                {/each}
              {:else if rvi === 0}
                <td class="blank" colspan={S} rowspan={S}></td>
              {/if}
            {/each}
          </tr>
        {/each}
      {/each}
    </tbody>
  </table>
</div>

<style>
  .grid-wrapper {
    /* No internal scroll — let the page scroll horizontally when needed. */
  }

  .puzzle-grid {
    border-collapse: collapse;
    font-size: 0.875rem;
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
  }

  /* Upper-left free area: no borders. */
  .corner {
    background: transparent;
    border: none;
  }

  .top-cat-label {
    padding: 0.375rem 0.5rem;
    text-align: center;
    font-weight: 600;
    color: #475569;
    background: #f1f5f9;
    border: 2px solid #94a3b8;
    text-transform: capitalize;
  }

  .top-value {
    padding: 0.25rem 0;
    text-align: center;
    font-weight: 600;
    color: #475569;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-bottom: 2px solid #94a3b8;
    width: var(--cell-size);
    max-width: var(--cell-size);
    height: auto;
    vertical-align: bottom;
  }

  .top-value span {
    display: inline-block;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    padding: 0.25rem 0;
    white-space: nowrap;
    font-size: 0.75rem;
  }

  .top-value.sub-start {
    border-left: 2px solid #94a3b8;
  }

  .top-value.sub-end {
    border-right: 2px solid #94a3b8;
  }

  .left-cat-label {
    padding: 0.375rem 0.75rem;
    font-weight: 600;
    background: #f1f5f9;
    border: 2px solid #94a3b8;
    vertical-align: middle;
    white-space: nowrap;
    text-transform: capitalize;
  }

  .left-value {
    padding: 0.25rem 0.5rem;
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    font-weight: 500;
    white-space: nowrap;
    text-align: right;
    font-size: 0.75rem;
    color: #475569;
  }

  .left-value.sub-start {
    border-top: 2px solid #94a3b8;
  }

  .left-value.sub-end {
    border-bottom: 2px solid #94a3b8;
  }

  .cell {
    width: var(--cell-size);
    height: var(--cell-size);
    min-width: 1.4rem;
    min-height: 1.4rem;
    text-align: center;
    vertical-align: middle;
    border: 1px solid #cbd5e1;
    cursor: pointer;
    user-select: none;
    font-size: 1rem;
    transition: background-color 0.1s;
    padding: 0;
  }

  .cell.sub-start-col {
    border-left: 2px solid #94a3b8;
  }

  .cell.sub-end-col {
    border-right: 2px solid #94a3b8;
  }

  .cell.sub-start-row {
    border-top: 2px solid #94a3b8;
  }

  .cell.sub-end-row {
    border-bottom: 2px solid #94a3b8;
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

  .blank {
    background: repeating-linear-gradient(
      45deg,
      #f8fafc 0 6px,
      #eef2f7 6px 12px
    );
    border: 2px solid #94a3b8;
  }
</style>
