import { json } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";
import { generateTheme, createAnthropicClient } from "logic-grid-ai";

export const POST: RequestHandler = async ({ request }) => {
  const { theme, size, categories } = await request.json();

  if (typeof theme !== "string" || !theme.trim() || theme.length > 200) {
    return json({ error: "Invalid theme" }, { status: 400 });
  }
  if (typeof size !== "number" || typeof categories !== "number") {
    return json({ error: "Invalid size or categories" }, { status: 400 });
  }

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
