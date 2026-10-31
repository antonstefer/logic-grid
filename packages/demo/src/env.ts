import { defineEnvVars } from "@sveltejs/kit/env";

export const variables = defineEnvVars({
  // Optional: plain puzzle generation works without it, and the AI endpoints
  // return 503 until it's set.
  ANTHROPIC_API_KEY: { schema: (value) => value },
});
