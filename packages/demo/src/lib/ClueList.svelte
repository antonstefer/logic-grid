<script lang="ts">
  import type { Clue } from "logic-grid";

  let { clues }: { clues: Clue[] } = $props();
</script>

<div class="clue-list">
  <h2>Clues</h2>
  <ol>
    {#each clues as clue}
      <li>{clue.text}</li>
    {/each}
  </ol>
</div>

<style>
  .clue-list {
    max-width: 28rem;
  }

  h2 {
    font-size: 1.125rem;
    font-weight: 600;
    margin: 0 0 0.75rem;
    color: #1e293b;
  }

  ol {
    padding-left: 1.5rem;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  li {
    line-height: 1.5;
    color: #334155;
  }
</style>
