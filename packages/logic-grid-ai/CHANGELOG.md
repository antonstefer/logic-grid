# Changelog

## [2.0.0](https://github.com/antonstefer/logic-grid/compare/logic-grid-ai-v1.0.0...logic-grid-ai-v2.0.0) (2026-10-30)


### ⚠ BREAKING CHANGES

* **logic-grid-ai:** The default model is claude-sonnet-5-5 (was claude-sonnet-4-6). Requests no longer set temperature (1.0.0 always sent 0.8), because the API version the SDK uses rejects it; createAnthropicClient accepts a new effort option instead. validateThemeResult rejects ordered categories that don't define all 7 comparators in the shapes logic-grid renders. The SDK sends the API key as Authorization: Bearer instead of X-Api-Key, which matters if a proxy or gateway checks that header.
* logic-grid and logic-grid-ai now require Node.js 22 or newer. Migration: upgrade to Node.js 22+.
* **logic-grid-ai:** validateThemeResult and validateRewrittenClues now return structured ValidationError objects instead of strings. Migration: read e.message for the human-readable text (same content as before), or switch to e.code for stable, machine-readable identifiers. generateTheme and rewriteClues now throw ThemeGenerationError / RewriteCluesError subclasses instead of plain Error; existing instanceof Error checks still match.

### Features

* AI puzzle translation (clues + category names + value labels) ([#28](https://github.com/antonstefer/logic-grid/issues/28)) ([0f83bf1](https://github.com/antonstefer/logic-grid/commit/0f83bf1494e795a3d8fe58014e0a5d47e9067b5f))
* **logic-grid-ai:** accept logic-grid 3.x as a peer dependency ([8f7a989](https://github.com/antonstefer/logic-grid/commit/8f7a989d6a9ac38ff45d7617136c097d1cf12c51))
* **logic-grid-ai:** move to @anthropic-ai/sdk 1.x and Claude Sonnet 5.5 ([ba0a446](https://github.com/antonstefer/logic-grid/commit/ba0a446d5439b452cb03e2d2cda5b2928d58df78))
* **logic-grid-ai:** structured validation errors + model option ([#23](https://github.com/antonstefer/logic-grid/issues/23)) ([2d10193](https://github.com/antonstefer/logic-grid/commit/2d1019351795e9272ad3a20e48d6f838c909e537))
* require Node.js 22 or newer ([fc4ba28](https://github.com/antonstefer/logic-grid/commit/fc4ba28d5509cef2734604e2bbea45d07b432638))
