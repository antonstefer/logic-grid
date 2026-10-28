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
- A `logic-grid` major needs a matching `logic-grid-ai` peerDep by the time its Release PR merges, or `npm ci` fails with `ERESOLVE` on main and the publish job breaks:
  - Widen the range to include the new major (e.g. `^2.0.0 || ^3.0.0`) only if the `logic-grid` types `logic-grid-ai` imports are unchanged — nothing tests against the old major.
  - Commit it as `feat:` or `fix:` so it ships, and release `logic-grid-ai` before the `logic-grid` major; otherwise npm's latest `logic-grid-ai` rejects the new `logic-grid`.
  - If the imported types changed, don't widen: the narrowed range (with `BREAKING CHANGE:`) has to land in the same merge as the `logic-grid` version bump. That bump only exists on release-please's PR branch, which release-please rewrites whenever it updates the PR, so push the narrowing commit there as the very last step before merging.
