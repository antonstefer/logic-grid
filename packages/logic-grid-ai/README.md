# logic-grid-ai

AI-powered themed category generation for [logic-grid](https://www.npmjs.com/package/logic-grid) puzzles. Uses the Anthropic API (Claude Sonnet 4.6 by default) to turn a theme description into fully structured puzzle categories.

[![npm](https://img.shields.io/npm/v/logic-grid-ai)](https://www.npmjs.com/package/logic-grid-ai)
[![license](https://img.shields.io/npm/l/logic-grid-ai)](../../LICENSE)

## Install

```bash
npm install logic-grid-ai logic-grid
```

`logic-grid` is a peer dependency. Requires an [Anthropic API key](https://console.anthropic.com/settings/keys) when using the default client.

## Quick Start

```typescript
import { generateTheme } from "logic-grid-ai";
import { generate } from "logic-grid";

const theme = await generateTheme({
  theme: "pirate adventure",
  size: 4,
  categories: 4,
});
// {
//   categories: [
//     { name: "Pirate", values: ["Blackbeard", "Redbeard", ...], noun: "" },
//     { name: "Ship", values: ["Revenge", "Kraken", ...], noun: "captain",
//       verb: ["commands the", ...], ordered: true, orderingPhrases: { comparators: {...} } },
//     ...
//   ]
// }

const puzzle = generate({
  size: 4,
  categories: 4,
  categoryNames: theme.categories,
});
// Clues like: "Blackbeard commands the Revenge."
```

## API

### `generateTheme(options)`

Generate themed categories for a logic grid puzzle.

```typescript
const result = await generateTheme({
  theme: "space exploration", // theme description (required)
  size: 5, // values per category, 3-8 (required)
  categories: 4, // number of categories, 3-8 (required)
  constraints: ["kid-friendly"], // optional hints for the AI
  client: myClient, // optional custom AIClient
});
```

Returns a `ThemeResult`:

```typescript
interface ThemeResult {
  categories: Category[]; // from logic-grid
}
```

At least one category must have `ordered: true` with `orderingPhrases.comparators` defining all 7 comparator phrases. The result is validated against structural and semantic rules (value uniqueness, noun consistency, category count, ordered category presence, etc.). If validation fails, the AI is retried with error feedback up to 3 times.

If all retries fail, `generateTheme` throws a `ThemeGenerationError`. The error carries an `errors` array of structured `ThemeValidationError` objects (each with a stable `code` like `"no_ordered_category"` or `"duplicate_value"` and a human-readable `message`), so callers can branch on the failure mode:

```typescript
import { generateTheme, ThemeGenerationError } from "logic-grid-ai";

try {
  const theme = await generateTheme({ theme: "...", size: 4, categories: 4 });
} catch (err) {
  if (err instanceof ThemeGenerationError) {
    if (err.errors.some((e) => e.code === "no_ordered_category")) {
      // Show a hint about ordered categories
    }
  }
  throw err;
}
```

> Transport-level retries (429s, 5xx, network errors) are already handled inside the Anthropic SDK with exponential backoff — they don't consume one of the 3 semantic-retry attempts.

### `createAnthropicClient(apiKey?, options?)`

Create the default AI client backed by the Anthropic SDK. If no key is provided, reads from `ANTHROPIC_API_KEY`. Pass `{ model }` to override the default model (`claude-sonnet-4-6`):

```typescript
import { createAnthropicClient } from "logic-grid-ai";

const fast = createAnthropicClient(undefined, { model: "claude-haiku-4-5" });
const explicit = createAnthropicClient("sk-ant-...");
```

### Custom AI Client

Implement the `AIClient` interface to use a different provider:

```typescript
import type { AIClient } from "logic-grid-ai";

const myClient: AIClient = {
  async completeJSON(prompt, schema) {
    // Call your preferred API, return JSON matching the schema
  },
};

const theme = await generateTheme({
  theme: "cooking competition",
  size: 4,
  categories: 4,
  client: myClient,
});
```

### `validateThemeResult(result, size, categories)`

Validate AI output against structural and semantic rules. Returns `ThemeValidationError[]` (empty = valid). Each error has a stable `code`, a human-readable `message`, and an optional `category` field naming the offending category. Used internally by `generateTheme`, but exported for custom pipelines.

```typescript
import { validateThemeResult } from "logic-grid-ai";

const errors = validateThemeResult(result, 4, 4);
if (errors.length > 0) {
  for (const e of errors) console.error(`[${e.code}] ${e.message}`);
}
```

### `rewriteClues(options)`

Rewrite an existing set of puzzle clues in a different voice or style. Constraint semantics are preserved — only the surface phrasing changes. Useful for re-skinning the default clue text after generation.

```typescript
import { rewriteClues } from "logic-grid-ai";

const rewritten = await rewriteClues({
  clues: puzzle.clues, // Clue[] from logic-grid
  style: "pirate storytelling", // optional — describes the desired voice
  client: myClient, // optional — custom AIClient
});
// Returns Clue[] with the same constraints and replaced text fields.
```

All clues are rewritten in a single batched AI call. Each clue is sent alongside its constraint JSON so the AI has ground-truth semantics. Output is validated against duplicate / empty / overlong text rules; retries up to 3 times before throwing a `RewriteCluesError` (parallel to `ThemeGenerationError` — carries `errors: RewriteCluesValidationError[]` with codes like `"empty_clue"`, `"long_clue"`, `"duplicate_clue"`).

### `validateRewrittenClues(result, expectedCount)`

Validate raw AI output for `rewriteClues`. Returns `RewriteCluesValidationError[]` (empty = valid). Each error has a `code`, a `message`, and an optional 1-indexed `clueIndex`.

```typescript
import { validateRewrittenClues } from "logic-grid-ai";

const errors = validateRewrittenClues({ clues: ["..."] }, puzzle.clues.length);
```

## How It Works

1. A detailed prompt describes the puzzle structure, category contract, and ordering semantics
2. The AI responds via tool_use with structured JSON matching a strict schema
3. The response is validated (category count, value uniqueness, noun consistency, ordered category presence, comparator completeness, etc.)
4. If validation fails, errors are fed back to the AI for up to 3 retries

## License

MIT
