import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { translate, LOCALE_RE } from "logic-grid-ai";
import type { Puzzle } from "logic-grid";
import { MissingEnvError } from "$lib/server/env";
import {
  getAnthropicClient,
  getAnthropicValidator,
} from "$lib/server/anthropic";

function isValidPuzzleShape(p: unknown): p is Puzzle {
  if (typeof p !== "object" || p === null) return false;
  const obj = p as Record<string, unknown>;
  if (!Array.isArray(obj.clues) || obj.clues.length === 0) return false;
  if (typeof obj.grid !== "object" || obj.grid === null) return false;
  const grid = obj.grid as Record<string, unknown>;
  if (!Array.isArray(grid.categories) || grid.categories.length === 0)
    return false;
  if (typeof grid.size !== "number") return false;
  return obj.clues.every((c: unknown) => {
    if (typeof c !== "object" || c === null) return false;
    const clue = c as Record<string, unknown>;
    if (typeof clue.text !== "string") return false;
    if (typeof clue.constraint !== "object" || clue.constraint === null)
      return false;
    // Reject before burning AI calls: a malformed constraint passes the
    // outer object check but causes the translator to drift; require a
    // string `type` so the translate pipeline gets meaningful input.
    const constraintObj = clue.constraint as Record<string, unknown>;
    if (typeof constraintObj.type !== "string") return false;
    return true;
  });
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
  // Locale is interpolated into the AI prompt verbatim, so the format
  // must be tight enough to prevent injection. Reuse `LOCALE_RE` from
  // the package (defense in depth without divergence risk). Trim first
  // so trailing spaces don't survive into the prompt.
  if (typeof locale !== "string") {
    return json({ error: "Invalid locale" }, { status: 400 });
  }
  const cleanLocale = locale.trim();
  if (!LOCALE_RE.test(cleanLocale)) {
    return json({ error: "Invalid locale" }, { status: 400 });
  }

  try {
    const client = getAnthropicClient();
    // Translator at the default temperature (0.8); validator at 0 for
    // deterministic verdicts — matches the recommended pattern from the
    // logic-grid-ai README. Production AOT pipelines should additionally
    // back the validator with a *different model* than the translator to
    // avoid correlated blind spots; the demo accepts that trade-off.
    const validator = getAnthropicValidator();
    const result = await translate({
      puzzle,
      locale: cleanLocale,
      client,
      validator,
    });
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
