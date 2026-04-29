import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { translate } from "logic-grid-ai";
import type { Clue } from "logic-grid";
import { MissingEnvError } from "$lib/server/env";
import { getAnthropicClient } from "$lib/server/anthropic";

export const POST: RequestHandler = async ({ request }) => {
  let clues: unknown, locale: unknown;
  try {
    ({ clues, locale } = await request.json());
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    !Array.isArray(clues) ||
    clues.length === 0 ||
    !clues.every(
      (c: unknown) =>
        typeof c === "object" &&
        c !== null &&
        "text" in c &&
        typeof (c as Record<string, unknown>).text === "string" &&
        "constraint" in c &&
        typeof (c as Record<string, unknown>).constraint === "object",
    )
  ) {
    return json({ error: "Invalid clues" }, { status: 400 });
  }
  if (typeof locale !== "string" || !locale.trim() || locale.length > 100) {
    return json({ error: "Invalid locale" }, { status: 400 });
  }

  try {
    const client = getAnthropicClient();
    const result = await translate({
      clues: clues as Clue[],
      locale,
      client,
    });
    return json({ clues: result });
  } catch (e) {
    if (e instanceof MissingEnvError) {
      console.error(`${e.variable} is not configured`);
      return json(
        {
          error:
            "AI translation is unavailable: the server is missing required configuration.",
          code: "missing_api_key",
        },
        { status: 503 },
      );
    }
    console.error("Translation failed:", e);
    return json({ error: "Translation failed" }, { status: 500 });
  }
};
