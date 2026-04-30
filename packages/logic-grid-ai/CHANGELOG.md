# Changelog

## [2.0.0](https://github.com/antonstefer/logic-grid/compare/logic-grid-ai-v1.0.0...logic-grid-ai-v2.0.0) (2026-04-30)


### ⚠ BREAKING CHANGES

* **logic-grid-ai:** validateThemeResult and validateRewrittenClues now return structured ValidationError objects instead of strings. Migration: read e.message for the human-readable text (same content as before), or switch to e.code for stable, machine-readable identifiers. generateTheme and rewriteClues now throw ThemeGenerationError / RewriteCluesError subclasses instead of plain Error; existing instanceof Error checks still match.

### Features

* AI puzzle translation (clues + category names + value labels) ([#28](https://github.com/antonstefer/logic-grid/issues/28)) ([0f83bf1](https://github.com/antonstefer/logic-grid/commit/0f83bf1494e795a3d8fe58014e0a5d47e9067b5f))
* **logic-grid-ai:** structured validation errors + model option ([#23](https://github.com/antonstefer/logic-grid/issues/23)) ([2d10193](https://github.com/antonstefer/logic-grid/commit/2d1019351795e9272ad3a20e48d6f838c909e537))
