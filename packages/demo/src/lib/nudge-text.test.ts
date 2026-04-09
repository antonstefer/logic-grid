import { describe, it, expect } from "vitest";
import type { DeductionStep } from "logic-grid";
import { buildNudgeText, TECHNIQUE_HINTS } from "./nudge-text";

function makeStep(
  overrides: Partial<DeductionStep> & Pick<DeductionStep, "technique">,
): DeductionStep {
  return {
    clueIndices: [],
    eliminations: [],
    assignments: [],
    explanation: "",
    ...overrides,
  };
}

describe("buildNudgeText", () => {
  it("clue-based elimination uses technique template with target", () => {
    const text = buildNudgeText(
      makeStep({
        technique: "same_position",
        clueIndices: [2],
        eliminations: [{ value: "Alice", position: 0 }],
      }),
    );
    expect(text).toBe(
      "Try looking at Clue 3 \u2014 what positions can you rule out for Alice?",
    );
  });

  it("clue-based assignment uses placement phrasing", () => {
    const text = buildNudgeText(
      makeStep({
        technique: "same_position",
        clueIndices: [4],
        assignments: [{ value: "Dog", position: 1 }],
        eliminations: [{ value: "Dog", position: 0 }],
      }),
    );
    expect(text).toBe("Try looking at Clue 5 \u2014 where must Dog go?");
  });

  it("direct technique uses placement phrasing", () => {
    const text = buildNudgeText(
      makeStep({
        technique: "direct",
        clueIndices: [0],
        assignments: [{ value: "Red", position: 2 }],
        eliminations: [
          { value: "Red", position: 0 },
          { value: "Red", position: 1 },
        ],
      }),
    );
    expect(text).toBe("Try looking at Clue 1 \u2014 where must Red go?");
  });

  it("structural technique uses plain statement", () => {
    const text = buildNudgeText(
      makeStep({
        technique: "naked_single",
        assignments: [{ value: "Cat", position: 3 }],
      }),
    );
    expect(text).toBe(
      "Try a different approach \u2014 look for a value that can only go in one position.",
    );
  });

  it("structural hidden_single uses correct phrasing", () => {
    const text = buildNudgeText(
      makeStep({
        technique: "hidden_single",
        assignments: [{ value: "Blue", position: 0 }],
      }),
    );
    expect(text).toBe(
      "Try a different approach \u2014 look for a position that can only hold one value.",
    );
  });

  it("contradiction technique names the target value", () => {
    const text = buildNudgeText(
      makeStep({
        technique: "contradiction",
        eliminations: [{ value: "Bob", position: 0 }],
      }),
    );
    expect(text).toBe(
      "Try a different approach \u2014 what happens if you assume where Bob goes?",
    );
  });

  it("contradiction with assignment names the assigned value", () => {
    const text = buildNudgeText(
      makeStep({
        technique: "contradiction",
        eliminations: [{ value: "Bob", position: 0 }],
        assignments: [{ value: "Bob", position: 2 }],
      }),
    );
    expect(text).toBe(
      "Try a different approach \u2014 what happens if you assume where Bob goes?",
    );
  });

  it("joins multiple clue indices with 'and'", () => {
    const text = buildNudgeText(
      makeStep({
        technique: "elimination",
        clueIndices: [0, 3],
        eliminations: [{ value: "Tea", position: 1 }],
      }),
    );
    expect(text).toContain("Clue 1 and Clue 4");
  });

  it("includes all assigned values in nudge text", () => {
    const text = buildNudgeText(
      makeStep({
        technique: "same_position",
        clueIndices: [1],
        assignments: [
          { value: "Alice", position: 0 },
          { value: "Red", position: 0 },
        ],
      }),
    );
    expect(text).toBe(
      "Try looking at Clue 2 \u2014 where must Alice and Red go?",
    );
  });

  it("includes all eliminated values in nudge text", () => {
    const text = buildNudgeText(
      makeStep({
        technique: "not_same_position",
        clueIndices: [0],
        eliminations: [
          { value: "Alice", position: 1 },
          { value: "Bob", position: 2 },
          { value: "Carol", position: 3 },
        ],
      }),
    );
    expect(text).toBe(
      "Try looking at Clue 1 \u2014 what positions can you rule out for Alice, Bob, and Carol?",
    );
  });

  it("TECHNIQUE_HINTS covers all techniques", () => {
    const techniques = [
      "direct",
      "elimination",
      "same_position",
      "not_same_position",
      "next_to",
      "not_next_to",
      "left_of",
      "before",
      "between",
      "not_between",
      "exact_distance",
      "naked_single",
      "hidden_single",
      "naked_pair",
      "naked_triple",
      "hidden_pair",
      "hidden_triple",
      "contradiction",
    ];
    for (const t of techniques) {
      expect(TECHNIQUE_HINTS).toHaveProperty(t);
      expect(typeof TECHNIQUE_HINTS[t as keyof typeof TECHNIQUE_HINTS]).toBe(
        "string",
      );
    }
  });
});
