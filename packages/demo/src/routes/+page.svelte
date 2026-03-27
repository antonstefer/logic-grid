<script lang="ts">
  import type { Difficulty } from "logic-grid";
  import PuzzleGrid from "$lib/PuzzleGrid.svelte";
  import ClueList from "$lib/ClueList.svelte";
  import { createPuzzleState } from "$lib/puzzle-state.svelte.ts";

  const puzzleState = createPuzzleState();

  let size = $state(4);
  let categories = $state(4);
  let difficulty = $state<Difficulty | "any">("any");

  function handleNewPuzzle() {
    puzzleState.newPuzzle(size, categories, difficulty === "any" ? undefined : difficulty);
  }

  // Generate initial puzzle
  handleNewPuzzle();
</script>

<main>
  <header>
    <h1>Logic Grid Puzzle</h1>
    <p class="subtitle">
      Powered by <a href="https://github.com/antonstefer/logic-grid" target="_blank" rel="noopener">logic-grid</a>
    </p>
  </header>

  <div class="controls">
    <label>
      Size
      <select bind:value={size}>
        {#each [3, 4, 5, 6, 7, 8] as s}
          <option value={s}>{s}</option>
        {/each}
      </select>
    </label>

    <label>
      Categories
      <select bind:value={categories}>
        {#each [3, 4, 5, 6, 7, 8] as c}
          <option value={c}>{c}</option>
        {/each}
      </select>
    </label>

    <label>
      Difficulty
      <select bind:value={difficulty}>
        <option value="any">Any</option>
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
      </select>
    </label>

    <button class="btn primary" onclick={handleNewPuzzle} disabled={puzzleState.loading}>
      {puzzleState.loading ? "Generating…" : "New Puzzle"}
    </button>
  </div>

  {#if puzzleState.puzzle}
    <div class="puzzle-layout">
      <ClueList clues={puzzleState.puzzle.clues} />

      <div class="grid-section">
        <PuzzleGrid
          grid={puzzleState.puzzle.grid}
          puzzleGrid={puzzleState.puzzle.grid}
          cellStates={puzzleState.grid}
          onCellClick={(v, p) => puzzleState.cycleCell(v, p)}
        />

        <div class="actions">
          <button class="btn" onclick={() => puzzleState.clear()}>Clear</button>
          <button class="btn" onclick={() => puzzleState.hint()}>Hint</button>
          <button class="btn" onclick={() => puzzleState.checkSolution()}>Check</button>
          <button class="btn" onclick={() => puzzleState.showSolution()}>Reveal</button>
        </div>

        {#if puzzleState.message}
          <div class="message {puzzleState.message.type}">
            {puzzleState.message.text}
          </div>
        {/if}
      </div>
    </div>

    <p class="meta">
      {puzzleState.puzzle.constraints.length} clues &middot;
      {puzzleState.puzzle.grid.size}&times;{puzzleState.puzzle.grid.categories.length} grid &middot;
      {puzzleState.puzzle.difficulty} &middot;
      {puzzleState.genTime}ms
    </p>
  {/if}
</main>

<style>
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    margin: 0;
    padding: 1.5rem;
    background: #f8fafc;
    color: #1e293b;
  }

  main {
    max-width: 64rem;
    margin: 0 auto;
  }

  header {
    margin-bottom: 1.5rem;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0;
  }

  .subtitle {
    color: #64748b;
    margin: 0.25rem 0 0;
    font-size: 0.875rem;
  }

  .subtitle a {
    color: #2563eb;
    text-decoration: none;
  }

  .controls {
    display: flex;
    gap: 1rem;
    align-items: end;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  select {
    padding: 0.5rem 0.75rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: white;
    color: #1e293b;
  }

  .btn {
    padding: 0.5rem 1rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: white;
    cursor: pointer;
    color: #1e293b;
    transition: background-color 0.1s;
  }

  .btn:hover {
    background: #f1f5f9;
  }

  .btn.primary {
    background: #2563eb;
    color: white;
    border-color: #2563eb;
  }

  .btn.primary:hover {
    background: #1d4ed8;
  }

  .puzzle-layout {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .grid-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .message {
    padding: 0.75rem 1rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .message.success {
    background: #dcfce7;
    color: #166534;
    border: 1px solid #bbf7d0;
  }

  .message.error {
    background: #fef2f2;
    color: #991b1b;
    border: 1px solid #fecaca;
  }

  .message.info {
    background: #eff6ff;
    color: #1e40af;
    border: 1px solid #bfdbfe;
  }

  .meta {
    margin-top: 1.5rem;
    font-size: 0.75rem;
    color: #94a3b8;
  }
</style>
