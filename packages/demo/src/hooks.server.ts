import { env } from "$env/dynamic/private";
import type { ServerInit } from "@sveltejs/kit";

/**
 * Runs once per server isolate before its first request (SvelteKit ≥2.10).
 *
 * Plain puzzle generation works without `ANTHROPIC_API_KEY`, so we don't throw
 * here — that would break the entire demo for users without an API key. We do
 * log a warning so the misconfiguration is loud in worker logs, and AI
 * endpoints will return 503 with a clear "missing_api_key" code on demand.
 */
export const init: ServerInit = () => {
  if (!env.ANTHROPIC_API_KEY) {
    console.warn(
      "ANTHROPIC_API_KEY is not configured — AI theme generation and clue rewriting will return 503. " +
        "Plain puzzle generation continues to work.",
    );
  }
};
