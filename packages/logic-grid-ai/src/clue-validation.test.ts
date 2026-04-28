import { describe, it, expect } from "vitest";
import { validateRewrittenClues } from "./clue-validation";
import type { RewriteCluesResult, RewriteCluesValidationCode } from "./types";

function validResult(count: number = 3): RewriteCluesResult {
  return {
    clues: Array.from(
      { length: count },
      (_, i) => `Rewritten clue number ${i + 1}.`,
    ),
  };
}

function hasCode(
  errors: { code: string }[],
  code: RewriteCluesValidationCode,
): boolean {
  return errors.some((e) => e.code === code);
}

describe("validateRewrittenClues", () => {
  it("accepts valid rewritten clues", () => {
    expect(validateRewrittenClues(validResult(), 3)).toEqual([]);
  });

  it("rejects wrong clue count (too few)", () => {
    const errors = validateRewrittenClues(validResult(2), 3);
    expect(hasCode(errors, "wrong_clue_count")).toBe(true);
    expect(
      errors.find((e) => e.code === "wrong_clue_count")?.message,
    ).toContain("Expected 3 clues, got 2");
  });

  it("rejects wrong clue count (too many)", () => {
    const errors = validateRewrittenClues(validResult(4), 3);
    expect(hasCode(errors, "wrong_clue_count")).toBe(true);
  });

  it("rejects empty clue text", () => {
    const r = validResult();
    r.clues[1] = "";
    const errors = validateRewrittenClues(r, 3);
    expect(hasCode(errors, "empty_clue")).toBe(true);
    expect(errors.find((e) => e.code === "empty_clue")?.clueIndex).toBe(2);
  });

  it("rejects whitespace-only clue text", () => {
    const r = validResult();
    r.clues[0] = "   ";
    const errors = validateRewrittenClues(r, 3);
    expect(hasCode(errors, "empty_clue")).toBe(true);
    expect(errors.find((e) => e.code === "empty_clue")?.clueIndex).toBe(1);
  });

  it("rejects clue exceeding max length", () => {
    const r = validResult();
    r.clues[2] = "A".repeat(501);
    const errors = validateRewrittenClues(r, 3);
    expect(hasCode(errors, "long_clue")).toBe(true);
    expect(errors.find((e) => e.code === "long_clue")?.clueIndex).toBe(3);
  });

  it("rejects duplicate rewritten clues (case-insensitive)", () => {
    const r = validResult();
    r.clues[2] = r.clues[0].toLowerCase();
    const errors = validateRewrittenClues(r, 3);
    expect(hasCode(errors, "duplicate_clue")).toBe(true);
    expect(errors.find((e) => e.code === "duplicate_clue")?.clueIndex).toBe(3);
  });

  it("reports multiple errors at once", () => {
    const r: RewriteCluesResult = {
      clues: ["", "A".repeat(501), "Valid clue."],
    };
    const errors = validateRewrittenClues(r, 3);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects non-string clue item", () => {
    const r = { clues: ["Valid clue.", 42 as unknown as string, "Another."] };
    const errors = validateRewrittenClues(r, 3);
    expect(hasCode(errors, "non_string_clue")).toBe(true);
    expect(errors.find((e) => e.code === "non_string_clue")?.clueIndex).toBe(2);
  });

  it("accepts single clue", () => {
    expect(validateRewrittenClues(validResult(1), 1)).toEqual([]);
  });

  it("omits clueIndex on count-level errors", () => {
    const errors = validateRewrittenClues(validResult(2), 3);
    const e = errors.find((x) => x.code === "wrong_clue_count");
    expect(e).toBeDefined();
    expect("clueIndex" in (e as object)).toBe(false);
  });
});
