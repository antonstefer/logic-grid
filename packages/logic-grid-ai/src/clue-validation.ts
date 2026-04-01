import type { RewriteCluesResult } from "./types";

/**
 * Validate AI-generated rewritten clues against structural rules.
 *
 * Returns an array of error messages. Empty array means the result is valid.
 * Used internally by rewriteClues to decide whether to retry.
 */
export function validateRewrittenClues(
  result: RewriteCluesResult,
  expectedCount: number,
): string[] {
  const errors: string[] = [];

  if (result.clues.length !== expectedCount) {
    errors.push(`Expected ${expectedCount} clues, got ${result.clues.length}.`);
  }

  const seen = new Set<string>();

  for (let i = 0; i < result.clues.length; i++) {
    const text = result.clues[i];

    if (!text || text.trim() === "") {
      errors.push(`Clue ${i + 1} is empty.`);
      continue;
    }

    if (text.length > 500) {
      errors.push(`Clue ${i + 1} is too long (${text.length} chars, max 500).`);
    }

    const lower = text.toLowerCase();
    if (seen.has(lower)) {
      errors.push(`Clue ${i + 1} is a duplicate of an earlier clue.`);
    }
    seen.add(lower);
  }

  return errors;
}
