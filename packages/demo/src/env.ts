import { defineEnvVars } from "@sveltejs/kit/env";

export const variables = defineEnvVars({
  // Optional: plain puzzle generation works without it, and the AI endpoints
  // return 503 until it's set. An empty value counts as unset, so code that
  // reads the key only checks for undefined.
  ANTHROPIC_API_KEY: { schema: (value) => value || undefined },
});
