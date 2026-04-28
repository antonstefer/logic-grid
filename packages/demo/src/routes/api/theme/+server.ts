import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { generateTheme } from "logic-grid-ai";
import { MissingEnvError } from "$lib/server/env";
import { getAnthropicClient } from "$lib/server/anthropic";

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
    const client = getAnthropicClient();
    const result = await generateTheme({ theme, size, categories, client });
    return json(result);
  } catch (e) {
    if (e instanceof MissingEnvError) {
      console.error(`${e.variable} is not configured`);
      return json(
        {
          error: `${e.variable} is not configured on the server. AI theme generation is unavailable.`,
          code: "missing_api_key",
        },
        { status: 503 },
      );
    }
    console.error("Theme generation failed:", e);
    return json({ error: "Theme generation failed" }, { status: 500 });
  }
};
