import { json } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";
import { generateTheme, createAnthropicClient } from "logic-grid-ai";

export const POST: RequestHandler = async ({ request }) => {
  let theme: unknown, size: unknown, categories: unknown;
  try {
    ({ theme, size, categories } = await request.json());
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

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
    console.error("Theme generation failed:", e);
    return json({ error: "Theme generation failed" }, { status: 500 });
  }
};
