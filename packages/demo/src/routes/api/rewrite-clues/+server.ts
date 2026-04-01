import { json } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";
import { rewriteClues, createAnthropicClient } from "logic-grid-ai";
import type { Clue } from "logic-grid";

export const POST: RequestHandler = async ({ request }) => {
  let clues: unknown, style: unknown;
  try {
    ({ clues, style } = await request.json());
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
  if (typeof style !== "string" || !style.trim() || style.length > 200) {
    return json({ error: "Invalid style" }, { status: 400 });
  }

  try {
    const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY not configured");
      return json({ error: "Clue rewriting failed" }, { status: 500 });
    }
    const client = createAnthropicClient(ANTHROPIC_API_KEY);
    const result = await rewriteClues({
      clues: clues as Clue[],
      style,
      client,
    });
    return json({ clues: result });
  } catch (e) {
    console.error("Clue rewriting failed:", e);
    return json({ error: "Clue rewriting failed" }, { status: 500 });
  }
};
