import { env } from "$env/dynamic/private";
import { createAnthropicClient } from "logic-grid-ai";
import type { AIClient } from "logic-grid-ai";
import { requireEnv } from "./env";

let cached: { key: string; client: AIClient } | undefined;

/**
 * Return a cached Anthropic AIClient, creating it on first call.
 *
 * The Cloudflare Workers runtime binds env vars per isolate at request time
 * (`$env/dynamic/private` is a proxy, not a static value), so we can't validate
 * at module load. This factory is the next best thing: the validation runs once
 * per isolate on the first AI request, and the resulting client is reused for
 * subsequent requests in that isolate. If `ANTHROPIC_API_KEY` is missing or
 * empty, throws {@link MissingEnvError} so the caller can surface a clear 503.
 *
 * The cache is keyed by the API key so a key rotation in dev (e.g. swapping
 * `.env`) replaces the client transparently.
 */
export function getAnthropicClient(): AIClient {
  const apiKey = requireEnv("ANTHROPIC_API_KEY", env.ANTHROPIC_API_KEY);
  if (cached?.key !== apiKey) {
    cached = { key: apiKey, client: createAnthropicClient(apiKey) };
  }
  return cached.client;
}

/** Test-only: clear the cached client so tests can re-exercise the env check. */
export function _resetAnthropicClientCache(): void {
  cached = undefined;
}
