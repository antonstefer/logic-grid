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

## Commit conventions

Releases are driven by release-please from Conventional Commits, strictly: only types that ship to users trigger releases or appear in CHANGELOG.

- Triggers a release (and shows in CHANGELOG): `feat:` (minor), `fix:` / `perf:` / `revert:` (patch). Major requires `!` after the type or a `BREAKING CHANGE:` footer.
- Internal hygiene (no release, no CHANGELOG entry): `refactor`, `docs`, `deps`, `chore`, `test`, `ci`, `build`, `style`. Use these freely; they don't propose Release PRs.
- Path-scoped: a commit only triggers a Release PR for the package whose files it touches (e.g. `packages/logic-grid/**` → `logic-grid` PR). Commits touching both packages trigger both.
- After a `logic-grid` major release, bump `logic-grid-ai`'s peerDep with a follow-up commit that includes `BREAKING CHANGE:` so a corresponding `logic-grid-ai` major is cut.
