# logic-grid

Generate and solve logic grid puzzles (zebra puzzles / Einstein's riddles) in TypeScript. Zero-dependency core with optional AI-themed category generation.

[![logic-grid](https://img.shields.io/npm/v/logic-grid?label=logic-grid)](https://www.npmjs.com/package/logic-grid)
[![logic-grid-ai](https://img.shields.io/npm/v/logic-grid-ai?label=logic-grid-ai)](https://www.npmjs.com/package/logic-grid-ai)
[![license](https://img.shields.io/npm/l/logic-grid)](LICENSE)

**[→ Try the live demo](https://logic-grid.stefer-anton.workers.dev)**

## Quick start

```bash
npm install logic-grid
```

```typescript
import { generate, solve } from "logic-grid";

const puzzle = generate({ size: 4, difficulty: "medium" });

console.log(puzzle.clues.map((c) => c.text));
// ["Alice owns the dog.", "The fish owner lives in the red house.", ...]

const solution = solve(puzzle.constraints, puzzle.grid);
```

For AI-generated themed puzzles (requires an Anthropic API key):

```bash
npm install logic-grid-ai logic-grid
```

```typescript
import { generateTheme } from "logic-grid-ai";
import { generate } from "logic-grid";

const theme = await generateTheme({
  theme: "pirate adventure",
  size: 4,
  categories: 4,
});

const puzzle = generate({
  size: 4,
  categoryNames: theme.categories,
});
// Clues like: "Blackbeard commands the Revenge."
```

## Features

- **SAT-based** — DPLL solver with watched literals, puzzles encoded as CNF
- **Zero dependencies** — ~15kb gzipped (core)
- **Step-by-step deduction** — explain solutions in human terms with named techniques (naked single, hidden pair, contradiction, …)
- **Multi-axis ordered categories** — comparators (`before`, `next_to`, `between`, `exact_distance`, …) on any ordered axis
- **Custom categories** — bring your own values, nouns, and verb phrases
- **AI-themed generation** — describe a theme, get fully structured puzzle categories with consistent comparator phrasing (via [`logic-grid-ai`](packages/logic-grid-ai#readme))
- **Difficulty classification** — easy / medium / hard / expert
- **Sizes 3–8** — generate up to 8×8 grids in <100ms

See the [`logic-grid` README](packages/logic-grid#readme) for the full API.

## Packages

- [`logic-grid`](packages/logic-grid#readme) — Generator, SAT solver, and step-by-step deduction. Zero dependencies. ([npm](https://www.npmjs.com/package/logic-grid))
- [`logic-grid-ai`](packages/logic-grid-ai#readme) — AI-themed category generation backed by the Anthropic API. ([npm](https://www.npmjs.com/package/logic-grid-ai))
- [`logic-grid-demo`](packages/demo#readme) — SvelteKit browser demo exercising both packages, deployed at the [live demo](https://logic-grid.stefer-anton.workers.dev).

## Development

```bash
npm install
npm run check    # typecheck + lint + format + test
npm run build    # build all packages
```

## License

MIT
