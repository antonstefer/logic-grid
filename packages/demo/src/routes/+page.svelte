<script lang="ts">
  import type { Category, Difficulty } from "logic-grid";
  import PuzzleGrid from "$lib/PuzzleGrid.svelte";
  import ClueList from "$lib/ClueList.svelte";
  import { createPuzzleState } from "$lib/puzzle-state.svelte";

  const puzzleState = createPuzzleState();

  interface Preset {
    label: string;
    size: number;
    categories: Category[];
    positionNoun: [string, string];
    positionPreposition: string;
  }

  const presets: Record<string, Preset> = {
    "hedge-fund": {
      label: "Hedge Fund Returns",
      size: 4,
      categories: [
        { name: "Manager", values: ["Alice", "Bob", "Carol", "Dan"], noun: "", subjectPriority: 2 },
        {
          name: "YTD Return",
          values: ["3%", "5%", "8%", "12%"],
          noun: "fund",
          verb: ["has a return of", "does not have a return of"],
          subjectPriority: -1,
          isPosition: true,
          numericValues: [3, 5, 8, 12],
          orderingPhrases: {
            unit: ["percentage point", "percentage points"],
            comparators: {
              before: "has a lower return than",
              left_of: "has the next lower return than",
              next_to: "has an adjacent return to",
              not_next_to: "does not have an adjacent return to",
              between: "has a return somewhere between",
              not_between: "does not have a return between",
              exact_distance: "is exactly",
            },
          },
        },
        { name: "Strategy", values: ["Long/Short", "Macro", "Quant", "Event-Driven"], noun: "strategist", subjectPriority: 1, verb: ["uses", "does not use"] },
        { name: "City", values: ["New York", "London", "Tokyo", "Zurich"], noun: "office", subjectPriority: 1, verb: ["is based in", "is not based in"] },
      ],
      positionNoun: ["fund", "funds"],
      positionPreposition: "at",
    },
    "morning-schedule": {
      label: "Morning Schedule",
      size: 4,
      categories: [
        { name: "Person", values: ["Emma", "Liam", "Noah", "Olivia"], noun: "", subjectPriority: 2 },
        {
          name: "Time",
          values: ["7am", "8am", "9am", "10am"],
          noun: "slot",
          verb: ["has an appointment at", "does not have an appointment at"],
          subjectPriority: -1,
          isPosition: true,
          numericValues: [7, 8, 9, 10],
          orderingPhrases: {
            unit: ["hour", "hours"],
            comparators: {
              before: "has an earlier appointment than",
              left_of: "has an appointment exactly one hour before",
              next_to: "has an appointment within one hour of",
              not_next_to: "does not have an appointment within one hour of",
              between: "has an appointment somewhere between",
              not_between: "does not have an appointment between",
              exact_distance: "has an appointment exactly",
            },
          },
        },
        { name: "Activity", values: ["Dentist", "Barber", "Therapist", "Optician"], noun: "attendee", subjectPriority: 1, verb: ["visits the", "does not visit the"] },
        { name: "Transport", values: ["Bus", "Bike", "Car", "Walk"], noun: "commuter", subjectPriority: 1, verb: ["takes the", "does not take the"] },
      ],
      positionNoun: ["slot", "slots"],
      positionPreposition: "at",
    },
  };

  let size = $state(4);
  let categories = $state(4);
  let difficulty = $state<Difficulty | "any">("any");
  let theme = $state("");
  let clueStyle = $state("");
  let preset = $state("none");

  function handleNewPuzzle() {
    const p = presets[preset];
    const diff = difficulty === "any" ? undefined : difficulty;
    const style = clueStyle.trim() || undefined;
    if (p) {
      puzzleState.newPuzzle({
        size: p.size,
        categories: p.categories.length,
        difficulty: diff,
        clueStyle: style,
        customCategories: p.categories,
        positionNoun: p.positionNoun,
        positionPreposition: p.positionPreposition,
      });
    } else {
      puzzleState.newPuzzle({
        size,
        categories,
        difficulty: diff,
        theme: theme.trim() || undefined,
        clueStyle: style,
      });
    }
  }

  // Generate initial puzzle with hedge fund preset to showcase position categories
  preset = "hedge-fund";
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
      Preset
      <select bind:value={preset}>
        <option value="none">Default</option>
        {#each Object.entries(presets) as [key, p]}
          <option value={key}>{p.label}</option>
        {/each}
      </select>
    </label>

    {#if preset === "none"}
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
    {/if}

    <label>
      Difficulty
      <select bind:value={difficulty}>
        <option value="any">Any</option>
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
        <option value="expert">Expert</option>
      </select>
    </label>

    {#if preset === "none"}
      <label>
        Theme
        <input type="text" bind:value={theme} placeholder="e.g. pirate adventure" maxlength={200} />
      </label>
    {/if}

    <label>
      Clue style
      <input type="text" bind:value={clueStyle} placeholder="e.g. formal, casual" maxlength={100} />
    </label>

    <button class="btn primary" onclick={handleNewPuzzle} disabled={puzzleState.loading}>
      {puzzleState.loading ? puzzleState.loadingMessage : "New Puzzle"}
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
          onConfirm={(v, p) => puzzleState.toggleConfirm(v, p)}
          onEliminate={(v, p) => puzzleState.toggleEliminate(v, p)}
        />

        <div class="actions">
          <button class="btn" onclick={() => puzzleState.nudge()}>Nudge</button>
          <button class="btn" onclick={() => puzzleState.hint()}>Explain Next Step</button>
          <button class="btn" onclick={() => puzzleState.revealCell()}>Reveal a Cell</button>
          <button class="btn" onclick={() => puzzleState.checkSolution()}>Check</button>
          <button class="btn" onclick={() => puzzleState.showSolution()}>Show Solution</button>
          <button class="btn" onclick={() => puzzleState.clear()}>Clear</button>
        </div>

        {#if puzzleState.message}
          <div
            class="message"
            class:success={puzzleState.message.type === "success"}
            class:error={puzzleState.message.type === "error"}
            class:info={puzzleState.message.type === "info"}
          >
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

  select,
  input[type="text"] {
    padding: 0.5rem 0.75rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: white;
    color: #1e293b;
  }

  input[type="text"] {
    width: 14rem;
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
