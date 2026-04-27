# logic-grid-demo

SvelteKit browser demo for [`logic-grid`](../logic-grid#readme). Live at <https://logic-grid.stefer-anton.workers.dev>.

## Local dev

From the repo root:

```bash
npm run -w packages/demo dev
```

The AI-themed category and clue-rewrite endpoints (`/api/theme`, `/api/rewrite-clues`) need `ANTHROPIC_API_KEY` in the env. Plain puzzle generation works without it.

## Deployment

Auto-deploys on push and PR via **Cloudflare Workers Builds** — the connection lives in the Cloudflare dashboard, not in this repo or `.github/workflows/`. Worker name: `logic-grid`.

Build: `npm run build` produces `.svelte-kit/cloudflare/`. Adapter: `@sveltejs/adapter-cloudflare`.

### Cloudflare config

- Set `ANTHROPIC_API_KEY` as a Worker secret (`wrangler secret put ANTHROPIC_API_KEY` or via the dashboard).
- Workers Observability must be enabled in the dashboard — the `observability` block in [`wrangler.jsonc`](wrangler.jsonc) is not sufficient on its own.
