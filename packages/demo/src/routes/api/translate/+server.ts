import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { translate } from "logic-grid-ai";
import type { Puzzle } from "logic-grid";
import { MissingEnvError } from "$lib/server/env";
import { getAnthropicClient } from "$lib/server/anthropic";

function isValidPuzzleShape(p: unknown): p is Puzzle {
  if (typeof p !== "object" || p === null) return false;
  const obj = p as Record<string, unknown>;
  if (!Array.isArray(obj.clues) || obj.clues.length === 0) return false;
  if (typeof obj.grid !== "object" || obj.grid === null) return false;
  const grid = obj.grid as Record<string, unknown>;
  if (!Array.isArray(grid.categories) || grid.categories.length === 0)
    return false;
  if (typeof grid.size !== "number") return false;
  return obj.clues.every(
    (c: unknown) =>
      typeof c === "object" &&
      c !== null &&
      "text" in c &&
      typeof (c as Record<string, unknown>).text === "string" &&
      "constraint" in c &&
      typeof (c as Record<string, unknown>).constraint === "object",
  );
}

export const POST: RequestHandler = async ({ request }) => {
  let puzzle: unknown, locale: unknown;
  try {
    ({ puzzle, locale } = await request.json());
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidPuzzleShape(puzzle)) {
    return json({ error: "Invalid puzzle" }, { status: 400 });
  }
  if (typeof locale !== "string" || !locale.trim() || locale.length > 100) {
    return json({ error: "Invalid locale" }, { status: 400 });
  }

  try {
    const client = getAnthropicClient();
    const result = await translate({ puzzle, locale, client });
    return json(result);
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
