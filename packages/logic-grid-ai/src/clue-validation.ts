import type {
  RewriteCluesResult,
  RewriteCluesValidationCode,
  RewriteCluesValidationError,
} from "./types";

function err(
  code: RewriteCluesValidationCode,
  message: string,
  clueIndex?: number,
): RewriteCluesValidationError {
  return clueIndex !== undefined
    ? { code, message, clueIndex }
    : { code, message };
}

/**
 * Validate AI-generated rewritten clues against structural rules.
 *
 * Returns an array of structured errors. Empty array means the result is valid.
 * Each error has a stable `code` (machine-readable) and `message` (human-readable);
 * `clueIndex` is the 1-indexed position when the error is scoped to a single clue.
 */
export function validateRewrittenClues(
  result: RewriteCluesResult,
  expectedCount: number,
): RewriteCluesValidationError[] {
  const errors: RewriteCluesValidationError[] = [];

  if (result.clues.length !== expectedCount) {
    errors.push(
      err(
        "wrong_clue_count",
        `Expected ${expectedCount} clues, got ${result.clues.length}.`,
      ),
    );
  }

  const seen = new Set<string>();

  for (let i = 0; i < result.clues.length; i++) {
    const text = result.clues[i];
    const pos = i + 1;

    if (typeof text !== "string") {
      errors.push(err("non_string_clue", `Clue ${pos} is not a string.`, pos));
      continue;
    }

    if (!text || text.trim() === "") {
      errors.push(err("empty_clue", `Clue ${pos} is empty.`, pos));
      continue;
    }

    if (text.length > 500) {
      errors.push(
        err(
          "long_clue",
          `Clue ${pos} is too long (${text.length} chars, max 500).`,
          pos,
        ),
      );
    }

    const lower = text.toLowerCase();
    if (seen.has(lower)) {
      errors.push(
        err(
          "duplicate_clue",
          `Clue ${pos} is a duplicate of an earlier clue.`,
          pos,
        ),
      );
    }
    seen.add(lower);
  }

  return errors;
}
