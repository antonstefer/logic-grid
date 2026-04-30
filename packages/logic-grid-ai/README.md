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

### `translate(options)`

Translate every visible string of a logic-grid puzzle to a target locale using AI: clue text, category names, and category value labels. Intended for **ahead-of-time (AOT)** puzzle pipelines that produce localized corpora once and serve them statically — quality is the constraint, not latency. The package engine stays English-only; this is a post-processing layer that returns localization maps the renderer composes with the canonical puzzle.

```typescript
import { translate } from "logic-grid-ai";
import { generate } from "logic-grid";

const puzzle = generate({ size: 4, categories: 4, seed: 42 });
const localized = await translate({
  puzzle,
  locale: "German", // also accepts BCP-47 like "de-DE"
});
// localized = {
//   clues: [{ constraint, text: "Bob wohnt genau 2 Häuser vom gelben Haus entfernt." }, ...],
//   categoryNames: { "House": "Haus", "Color": "Farbe", ... },
//   valueLabels:   { "Yellow": "Gelb", "Cat": "Katze", "Alice": "Alice", ... },
// }
```

The original `puzzle.constraints` and `puzzle.grid` are passed through unchanged — the engine continues to operate on canonical English keys. Renderers compose `categoryNames` / `valueLabels` over the canonical grid to display localized headers. The structural validator guarantees every canonical key has a non-empty entry, so renderers can treat the maps as exhaustive and surface any missing key as an error rather than silently rendering a half-localized grid.

The function runs a two-stage AI flow:

1. **Translator** produces all three surfaces (localized clue text, category names, value labels) in a single batched call. The constraint JSON is shown alongside each English clue as ground truth — if the source clue text is ambiguous or has drifted (e.g. via `rewriteClues`), the constraint defines the meaning.
2. **Validator** round-trips each translated clue back to a constraint type and checks polarity, direction, numeric/unit preservation, and proper-noun preservation in the clue text. Failures are fed back to the translator on retry (up to 3 attempts). Completeness of `categoryNames` and `valueLabels` is enforced structurally.

```typescript
const localized = await translate({
  puzzle,
  locale: "ja-JP",
  client: createAnthropicClient(undefined, { model: "claude-sonnet-4-6" }),
  validator: createAnthropicClient(undefined, {
    model: "claude-opus-4-5",
    temperature: 0,
  }),
});
```

> **Validator best practice.** Single-model validation has correlated blind spots — the validator's mistakes overlap with the translator's. For production AOT pipelines, pass a `validator` client backed by a _different model_ than the translator. When both `client` and `validator` are omitted, the package creates two default Anthropic clients with `validator` at `temperature: 0` for deterministic verdicts.

> **Proper nouns stay verbatim.** People names, place names, brand names, and numeric/unit literals (`1972`, `8%`, `7am`) map to themselves in `valueLabels` and remain unchanged in clue text. Descriptive words (colors, animals, common-noun categories) translate, with grammatical inflection in clue text expected (`yellow` → bare label `gelb`, inflected forms `gelben` / `gelbe` are correct in clue context).

If validation fails on every attempt, `translate` throws a `TranslationError` carrying structured `errors` with stable codes:

| Code                       | Surface        | Meaning                                                                    |
| -------------------------- | -------------- | -------------------------------------------------------------------------- |
| `wrong_clue_count`         | clues          | AI returned a different number of clues than the source                    |
| `non_string_clue`          | clues          | A clue entry is not a string                                               |
| `empty_translation`        | clues          | A clue is empty or whitespace-only                                         |
| `long_translation`         | clues          | A clue exceeds the per-clue length budget                                  |
| `duplicate_translation`    | clues          | Two clues are identical (case-insensitive)                                 |
| `missing_category_name`    | categoryNames  | A canonical category from the source has no entry in `categoryNames`       |
| `empty_category_name`      | categoryNames  | A `categoryNames` entry is empty or non-string                             |
| `duplicate_category_name`  | categoryNames  | Two canonical categories map to the same localized name (case-insensitive) |
| `missing_value_label`      | valueLabels    | A canonical value from the source has no entry in `valueLabels`            |
| `empty_value_label`        | valueLabels    | A `valueLabels` entry is empty or non-string                               |
| `duplicate_value_label`    | valueLabels    | Two canonical values map to the same localized label (case-insensitive)    |
| `constraint_type_mismatch` | clue semantics | Validator round-trip parsed the translation as a different constraint      |
| `direction_flip`           | clue semantics | `before` / `left_of` subject/object reversed                               |
| `numeric_changed`          | clue semantics | Numbers or units in a clue differ from the source                          |
| `proper_noun_dropped`      | clue semantics | A proper noun in a clue was changed                                        |

```typescript
import { translate, TranslationError } from "logic-grid-ai";

try {
  const localized = await translate({ puzzle, locale: "German" });
} catch (err) {
  if (err instanceof TranslationError) {
    if (err.errors.some((e) => e.code === "direction_flip")) {
      // Translator flipped the subject/object on a `before` or `left_of` clue.
    }
  }
  throw err;
}
```

### `createAnthropicClient(apiKey?, options?)` temperature option

`AnthropicClientOptions` accepts an optional `temperature` (default `0.8`). Use `0` for deterministic responses — typically the right default for validator clients in `translate()`:

```typescript
const validator = createAnthropicClient(undefined, { temperature: 0 });
```

## How It Works

1. A detailed prompt describes the puzzle structure, category contract, and ordering semantics
2. The AI responds via tool_use with structured JSON matching a strict schema
3. The response is validated (category count, value uniqueness, noun consistency, ordered category presence, comparator completeness, etc.)
4. If validation fails, errors are fed back to the AI for up to 3 retries

## License

MIT
