import { ANTHROPIC_API_KEY } from "$app/env/private";
import { createAnthropicClient } from "logic-grid-ai";
import type { AIClient } from "logic-grid-ai";
import { MissingEnvError } from "./env";

let cached: { key: string; client: AIClient } | undefined;

/**
 * Return a cached Anthropic AIClient, creating it on first call.
 *
 * `ANTHROPIC_API_KEY` is optional (see `src/env.ts`) so the demo runs without
 * it, which means it's checked here on each AI request rather than at
 * startup. The client is created on the first AI request in an isolate and
 * reused after that. If `ANTHROPIC_API_KEY` is unset, throws
 * {@link MissingEnvError} so the caller can surface a clear 503.
 *
 * The cache is keyed by the API key so a key rotation in dev (e.g. swapping
 * `.env`) replaces the client transparently.
 */
export function getAnthropicClient(): AIClient {
  if (ANTHROPIC_API_KEY === undefined) {
    throw new MissingEnvError("ANTHROPIC_API_KEY");
  }
  if (cached?.key !== ANTHROPIC_API_KEY) {
    cached = {
      key: ANTHROPIC_API_KEY,
      client: createAnthropicClient(ANTHROPIC_API_KEY),
    };
  }
  return cached.client;
}

/**
 * @internal Test-only. Clears the cached client so tests can re-exercise
 * the env check or simulate key rotation. Not part of the public surface —
 * do not call from production code.
 */
export function _resetAnthropicClientCache(): void {
  cached = undefined;
}
