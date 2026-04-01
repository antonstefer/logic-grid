# Logic Grid

Monorepo for logic grid puzzle generation and solving.

## Structure

- `packages/logic-grid` — Core library (TypeScript, zero dependencies)
- `packages/logic-grid-ai` — AI-powered themed category generation
- `packages/demo` — Browser demo (SvelteKit)

## Commands

- `npm run check` — Runs typecheck + lint + format + test for all packages
- `npm run build` — Builds all packages
- `npm test` — Runs tests across all workspaces

## Rules

- Never use `npx` — use `node_modules/.bin/` or npm scripts
- Commit often — after each logical change, not batched at the end
- Always run `npm run check` before committing
- Keep the library zero-dependency
- Supported grid sizes: 3–8
- Throw on errors — never silently swallow or use fallback values
- Prefer simple solutions — don't over-engineer
- Never add Co-Authored-By lines or any AI/Claude references to commits or outputs
