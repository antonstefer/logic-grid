import { describe, it, expect } from "vitest";
import { validateRewrittenClues } from "./clue-validation";
import type { RewriteCluesResult } from "./types";

function validResult(count: number = 3): RewriteCluesResult {
  return {
    clues: Array.from(
      { length: count },
      (_, i) => `Rewritten clue number ${i + 1}.`,
    ),
  };
}

describe("validateRewrittenClues", () => {
  it("accepts valid rewritten clues", () => {
    expect(validateRewrittenClues(validResult(), 3)).toEqual([]);
  });

  it("rejects wrong clue count (too few)", () => {
    const errors = validateRewrittenClues(validResult(2), 3);
    expect(errors).toContainEqual(
      expect.stringContaining("Expected 3 clues, got 2"),
    );
  });

  it("rejects wrong clue count (too many)", () => {
    const errors = validateRewrittenClues(validResult(4), 3);
    expect(errors).toContainEqual(
      expect.stringContaining("Expected 3 clues, got 4"),
    );
  });

  it("rejects empty clue text", () => {
    const r = validResult();
    r.clues[1] = "";
    const errors = validateRewrittenClues(r, 3);
    expect(errors).toContainEqual(expect.stringContaining("Clue 2 is empty"));
  });

  it("rejects whitespace-only clue text", () => {
    const r = validResult();
    r.clues[0] = "   ";
    const errors = validateRewrittenClues(r, 3);
    expect(errors).toContainEqual(expect.stringContaining("Clue 1 is empty"));
  });

  it("rejects clue exceeding max length", () => {
    const r = validResult();
    r.clues[2] = "A".repeat(501);
    const errors = validateRewrittenClues(r, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("Clue 3 is too long (501 chars, max 500)"),
    );
  });

  it("rejects duplicate rewritten clues (case-insensitive)", () => {
    const r = validResult();
    r.clues[2] = r.clues[0].toLowerCase();
    const errors = validateRewrittenClues(r, 3);
    expect(errors).toContainEqual(
      expect.stringContaining("Clue 3 is a duplicate"),
    );
  });

  it("reports multiple errors at once", () => {
    const r: RewriteCluesResult = {
      clues: ["", "A".repeat(501), "Valid clue."],
    };
    const errors = validateRewrittenClues(r, 3);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it("accepts single clue", () => {
    expect(validateRewrittenClues(validResult(1), 1)).toEqual([]);
  });
});
