import { ANTHROPIC_API_KEY } from "$app/env/private";
import { createAnthropicClient } from "logic-grid-ai";
import type { AIClient } from "logic-grid-ai";
import { MissingEnvError } from "./env";

let client: AIClient | undefined;

/**
 * Return the Anthropic AIClient, creating it on the first call.
 *
 * `ANTHROPIC_API_KEY` is optional (see `src/env.ts`) so the demo runs without
 * it, which means it's checked here on each AI request rather than at
 * startup. If it's unset, throws {@link MissingEnvError} so the caller can
 * surface a clear 503.
 *
 * SvelteKit reads the key once, when `$app/env/private` loads, so a single
 * client serves the whole isolate.
 */
export function getAnthropicClient(): AIClient {
  if (ANTHROPIC_API_KEY === undefined) {
    throw new MissingEnvError("ANTHROPIC_API_KEY");
  }
  client ??= createAnthropicClient(ANTHROPIC_API_KEY);
  return client;
}
