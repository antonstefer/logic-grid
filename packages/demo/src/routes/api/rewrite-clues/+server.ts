import type { RequestHandler } from "./$types";
import { rewriteClues } from "logic-grid-ai";
import type { Clue } from "logic-grid";
import { MissingEnvError } from "#lib/server/env.js";
import { getAnthropicClient } from "#lib/server/anthropic.js";

export const POST: RequestHandler = async ({ request }) => {
  let clues: unknown, style: unknown;
  try {
    ({ clues, style } = await request.json());
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
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
    return Response.json({ error: "Invalid clues" }, { status: 400 });
  }
  if (typeof style !== "string" || !style.trim() || style.length > 100) {
    return Response.json({ error: "Invalid style" }, { status: 400 });
  }

  try {
    const client = getAnthropicClient();
    const result = await rewriteClues({
      clues: clues as Clue[],
      style,
      client,
    });
    return Response.json({ clues: result });
  } catch (e) {
    if (e instanceof MissingEnvError) {
      console.error(`${e.variable} is not configured`);
      return Response.json(
        {
          error:
            "AI clue rewriting is unavailable: the server is missing required configuration.",
          code: "missing_api_key",
        },
        { status: 503 },
      );
    }
    console.error("Clue rewriting failed:", e);
    return Response.json({ error: "Clue rewriting failed" }, { status: 500 });
  }
};
