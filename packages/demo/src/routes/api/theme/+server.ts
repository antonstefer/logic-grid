import { json } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";
import { generateTheme, createAnthropicClient } from "logic-grid-ai";

export const POST: RequestHandler = async ({ request }) => {
  const { theme, size, categories } = await request.json();

  try {
    const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
    }
    const client = createAnthropicClient(ANTHROPIC_API_KEY);
    const result = await generateTheme({ theme, size, categories, client });
    return json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, { status: 500 });
  }
};
