# logic-grid-demo

SvelteKit browser demo for [`logic-grid`](../logic-grid#readme) and [`logic-grid-ai`](../logic-grid-ai#readme). Live at <https://logic-grid.stefer-anton.workers.dev>.

## Local dev

From the repo root:

```bash
npm run -w packages/demo dev
```

The AI endpoints for themed categories, clue rewriting and translation (`/api/theme`, `/api/rewrite-clues`, `/api/translate`) need `ANTHROPIC_API_KEY` in the env. Plain puzzle generation works without it.

## Deployment

Auto-deploys on push and PR via **Cloudflare Workers Builds** — the connection lives in the Cloudflare dashboard, not in this repo or `.github/workflows/`. Worker name: `logic-grid`.

Build: `npm run build` produces `.svelte-kit/cloudflare/`. Adapter: `@sveltejs/adapter-cloudflare`.

### Cloudflare config

- Set `ANTHROPIC_API_KEY` as a Worker secret (`wrangler secret put ANTHROPIC_API_KEY` or via the dashboard).
- Workers Logs are turned on by `observability.enabled` in [`wrangler.jsonc`](wrangler.jsonc), which every deploy applies; no dashboard step is needed. They show up in the Worker's Observability tab in the dashboard. If new events don't appear there, reload the page instead of using the tab's Refresh button.
