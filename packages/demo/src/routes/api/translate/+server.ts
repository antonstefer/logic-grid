import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { translate } from "logic-grid-ai";
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
    const c2 = clue.constraint as Record<string, unknown>;
    if (typeof c2.type !== "string") return false;
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
  // Locale is interpolated into the AI prompt verbatim, so the format must
  // be tight enough to prevent injection. Allow plain language names
  // ("German", "Japanese") and BCP-47 codes ("de-DE", "zh-Hans"); reject
  // anything with newlines, quotes, brackets, or punctuation that could
  // break out of the prompt context. Letters, digits, hyphen, underscore,
  // and single internal spaces only; cap at 50 chars (real locales never
  // exceed ~30).
  const LOCALE_RE = /^[A-Za-z][A-Za-z0-9\-_ ]{0,49}$/;
  if (typeof locale !== "string" || !LOCALE_RE.test(locale)) {
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
    const result = await translate({ puzzle, locale, client, validator });
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
