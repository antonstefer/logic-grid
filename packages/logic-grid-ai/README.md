# logic-grid-ai

AI-powered themed category generation for [logic-grid](https://www.npmjs.com/package/logic-grid) puzzles. Uses the Anthropic API to turn a theme description into fully structured puzzle categories.

## Install

```bash
npm install logic-grid-ai logic-grid
```

Requires `logic-grid` as a peer dependency and an [Anthropic API key](https://console.anthropic.com/settings/keys).

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
//     { name: "Ship", values: ["Revenge", "Kraken", ...], noun: "captain", verb: ["commands the", ...] },
//     ...
//   ],
//   positionNoun: ["cove", "coves"],
//   positionPreposition: "at"
// }

const puzzle = generate({
  size: 4,
  categories: 4,
  categoryNames: theme.categories,
  positionNoun: theme.positionNoun,
  positionPreposition: theme.positionPreposition,
});
// Clues like: "Blackbeard commands the Revenge."
// "The gold seeker is at the first cove."
```

## API

### `generateTheme(options)`

Generate themed categories for a logic grid puzzle.

```typescript
const result = await generateTheme({
  theme: "space exploration", // theme description (required)
  size: 5,                    // values per category, 3-8 (required)
  categories: 4,              // number of categories, 3-8 (required)
  constraints: ["kid-friendly"], // optional hints for the AI
  client: myClient,           // optional custom AIClient
});
```

Returns a `ThemeResult`:

```typescript
interface ThemeResult {
  categories: Category[];          // from logic-grid
  positionNoun: [string, string];  // [singular, plural], e.g. ["planet", "planets"]
  positionPreposition: string;     // e.g. "on" -> "lives on the first planet"
}
```

The result is validated against structural and semantic rules (value uniqueness, noun consistency, category count, etc.). If validation fails, the AI is retried with error feedback up to 3 times.

### `createAnthropicClient(apiKey?)`

Create the default AI client backed by the Anthropic SDK. If no key is provided, reads from `ANTHROPIC_API_KEY`.

```typescript
import { createAnthropicClient } from "logic-grid-ai";

const client = createAnthropicClient("sk-ant-...");
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

Validate AI output against structural and semantic rules. Returns an array of error messages (empty = valid). Used internally by `generateTheme`, but exported for custom pipelines.

```typescript
import { validateThemeResult } from "logic-grid-ai";

const errors = validateThemeResult(result, 4, 4);
if (errors.length > 0) {
  console.error("Invalid theme:", errors);
}
```

## How It Works

1. A detailed prompt describes the puzzle structure, category contract, and position noun semantics
2. The AI responds via tool_use with structured JSON matching a strict schema
3. The response is validated (category count, value uniqueness, noun consistency, etc.)
4. If validation fails, errors are fed back to the AI for up to 3 retries

## License

MIT
