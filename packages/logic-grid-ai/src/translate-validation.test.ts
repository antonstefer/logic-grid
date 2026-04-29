import { describe, it, expect } from "vitest";
import {
  checkTranslationStructure,
  validateTranslation,
} from "./translate-validation";
import { hasCode } from "./test-utils";
import type { AIClient } from "./types";
import type { Clue } from "logic-grid";

const SAMPLE_CLUES: Clue[] = [
  {
    constraint: { type: "same_position", a: "Alice", b: "Coffee" },
    text: "Alice drinks coffee.",
  },
  {
    constraint: { type: "before", a: "Alice", b: "Bob", axis: "Year" },
    text: "Alice started before Bob.",
  },
  {
    constraint: {
      type: "not_between",
      outer1: "A",
      middle: "B",
      outer2: "C",
      axis: "Year",
    },
    text: "B is not between A and C.",
  },
];

interface ClueVerdict {
  index: number;
  constraintType: string;
  directionOk: boolean;
  numericOk: boolean;
  properNounsOk: boolean;
}

function allOk(clues: Clue[]): { clues: ClueVerdict[] } {
  return {
    clues: clues.map((c, i) => ({
      index: i + 1,
      constraintType: c.constraint.type,
      directionOk: true,
      numericOk: true,
      properNounsOk: true,
    })),
  };
}

function mockValidator(verdicts: { clues: ClueVerdict[] }): AIClient {
  return {
    completeJSON: <T>() => Promise.resolve(verdicts as T),
  };
}

describe("checkTranslationStructure", () => {
  it("accepts valid output", () => {
    const result = { clues: ["one", "two", "three"] };
    expect(checkTranslationStructure(result, 3)).toEqual([]);
  });

  it("rejects wrong clue count", () => {
    const errors = checkTranslationStructure({ clues: ["one", "two"] }, 3);
    expect(hasCode(errors, "wrong_clue_count")).toBe(true);
    expect(
      errors.find((e) => e.code === "wrong_clue_count")?.message,
    ).toContain("Expected 3 clues, got 2");
  });

  it("rejects empty translation", () => {
    const errors = checkTranslationStructure(
      { clues: ["", "two", "three"] },
      3,
    );
    expect(hasCode(errors, "empty_translation")).toBe(true);
    expect(errors.find((e) => e.code === "empty_translation")?.clueIndex).toBe(
      1,
    );
  });

  it("rejects whitespace-only translation", () => {
    const errors = checkTranslationStructure(
      { clues: ["one", "   ", "three"] },
      3,
    );
    expect(hasCode(errors, "empty_translation")).toBe(true);
    expect(errors.find((e) => e.code === "empty_translation")?.clueIndex).toBe(
      2,
    );
  });

  it("rejects translation exceeding max length", () => {
    const errors = checkTranslationStructure(
      { clues: ["one", "A".repeat(501), "three"] },
      3,
    );
    expect(hasCode(errors, "long_translation")).toBe(true);
    expect(errors.find((e) => e.code === "long_translation")?.clueIndex).toBe(
      2,
    );
  });

  it("rejects duplicate translation (case-insensitive)", () => {
    const errors = checkTranslationStructure(
      { clues: ["Alice trinkt Kaffee.", "two", "alice trinkt kaffee."] },
      3,
    );
    expect(hasCode(errors, "duplicate_translation")).toBe(true);
    expect(
      errors.find((e) => e.code === "duplicate_translation")?.clueIndex,
    ).toBe(3);
  });

  it("rejects non-string item", () => {
    const errors = checkTranslationStructure(
      { clues: ["one", 42, "three"] },
      3,
    );
    expect(hasCode(errors, "non_string_clue")).toBe(true);
    expect(errors.find((e) => e.code === "non_string_clue")?.clueIndex).toBe(2);
  });

  it("omits clueIndex on count-level errors", () => {
    const errors = checkTranslationStructure({ clues: ["one"] }, 3);
    const e = errors.find((x) => x.code === "wrong_clue_count");
    expect(e).toBeDefined();
    expect("clueIndex" in (e as object)).toBe(false);
  });
});

describe("validateTranslation", () => {
  it("returns empty array when validator reports all-OK", async () => {
    const errors = await validateTranslation(
      SAMPLE_CLUES,
      ["a", "b", "c"],
      "German",
      mockValidator(allOk(SAMPLE_CLUES)),
    );
    expect(errors).toEqual([]);
  });

  it("returns empty array on empty input without calling validator", async () => {
    let called = false;
    const validator: AIClient = {
      completeJSON: <T>() => {
        called = true;
        return Promise.resolve({ clues: [] } as T);
      },
    };

    const errors = await validateTranslation([], [], "German", validator);

    expect(errors).toEqual([]);
    expect(called).toBe(false);
  });

  it("emits constraint_type_mismatch when verdict type differs from source", async () => {
    const verdicts = allOk(SAMPLE_CLUES);
    verdicts.clues[0].constraintType = "wrong_type";

    const errors = await validateTranslation(
      SAMPLE_CLUES,
      ["a", "b", "c"],
      "German",
      mockValidator(verdicts),
    );

    expect(hasCode(errors, "constraint_type_mismatch")).toBe(true);
    expect(
      errors.find((e) => e.code === "constraint_type_mismatch")?.clueIndex,
    ).toBe(1);
  });

  it("emits direction_flip only for asymmetric constraints", async () => {
    const verdicts = allOk(SAMPLE_CLUES);
    // Flip on same_position (symmetric, should be ignored) and before (asymmetric)
    verdicts.clues[0].directionOk = false; // same_position — ignored
    verdicts.clues[1].directionOk = false; // before — emitted

    const errors = await validateTranslation(
      SAMPLE_CLUES,
      ["a", "b", "c"],
      "German",
      mockValidator(verdicts),
    );

    const flipErrors = errors.filter((e) => e.code === "direction_flip");
    expect(flipErrors).toHaveLength(1);
    expect(flipErrors[0].clueIndex).toBe(2);
  });

  it("emits direction_flip on left_of as well as before", async () => {
    const leftOfClue: Clue = {
      constraint: { type: "left_of", a: "X", b: "Y", axis: "Year" },
      text: "X is directly before Y.",
    };
    const verdicts = {
      clues: [
        {
          index: 1,
          constraintType: "left_of",
          directionOk: false,
          numericOk: true,
          properNounsOk: true,
        },
      ],
    };

    const errors = await validateTranslation(
      [leftOfClue],
      ["..."],
      "German",
      mockValidator(verdicts),
    );

    expect(hasCode(errors, "direction_flip")).toBe(true);
  });

  it("emits numeric_changed when numericOk is false", async () => {
    const verdicts = allOk(SAMPLE_CLUES);
    verdicts.clues[2].numericOk = false;

    const errors = await validateTranslation(
      SAMPLE_CLUES,
      ["a", "b", "c"],
      "German",
      mockValidator(verdicts),
    );

    expect(hasCode(errors, "numeric_changed")).toBe(true);
    expect(errors.find((e) => e.code === "numeric_changed")?.clueIndex).toBe(3);
  });

  it("emits proper_noun_dropped when properNounsOk is false", async () => {
    const verdicts = allOk(SAMPLE_CLUES);
    verdicts.clues[0].properNounsOk = false;

    const errors = await validateTranslation(
      SAMPLE_CLUES,
      ["a", "b", "c"],
      "German",
      mockValidator(verdicts),
    );

    expect(hasCode(errors, "proper_noun_dropped")).toBe(true);
    expect(
      errors.find((e) => e.code === "proper_noun_dropped")?.clueIndex,
    ).toBe(1);
  });

  it("aggregates multiple errors per clue", async () => {
    const verdicts = allOk(SAMPLE_CLUES);
    verdicts.clues[1].constraintType = "wrong";
    verdicts.clues[1].directionOk = false;
    verdicts.clues[1].numericOk = false;
    verdicts.clues[1].properNounsOk = false;

    const errors = await validateTranslation(
      SAMPLE_CLUES,
      ["a", "b", "c"],
      "German",
      mockValidator(verdicts),
    );

    const clue2Errors = errors.filter((e) => e.clueIndex === 2);
    expect(clue2Errors).toHaveLength(4);
  });

  it("includes locale name in the validator prompt", async () => {
    let capturedPrompt = "";
    const validator: AIClient = {
      completeJSON: <T>(prompt: string) => {
        capturedPrompt = prompt;
        return Promise.resolve(allOk(SAMPLE_CLUES) as T);
      },
    };

    await validateTranslation(
      SAMPLE_CLUES,
      ["a", "b", "c"],
      "Japanese",
      validator,
    );

    expect(capturedPrompt).toContain("Japanese");
    expect(capturedPrompt).toContain("reviewing a translation");
  });

  it("includes both source and translation in validator prompt", async () => {
    let capturedPrompt = "";
    const validator: AIClient = {
      completeJSON: <T>(prompt: string) => {
        capturedPrompt = prompt;
        return Promise.resolve(allOk(SAMPLE_CLUES) as T);
      },
    };

    await validateTranslation(
      SAMPLE_CLUES,
      ["Alice trinkt Kaffee.", "b", "c"],
      "German",
      validator,
    );

    expect(capturedPrompt).toContain("Alice drinks coffee.");
    expect(capturedPrompt).toContain("Alice trinkt Kaffee.");
    expect(capturedPrompt).toContain('"type":"same_position"');
  });

  it("calls validator exactly once per batch", async () => {
    let callCount = 0;
    const validator: AIClient = {
      completeJSON: <T>() => {
        callCount++;
        return Promise.resolve(allOk(SAMPLE_CLUES) as T);
      },
    };

    await validateTranslation(
      SAMPLE_CLUES,
      ["a", "b", "c"],
      "German",
      validator,
    );

    expect(callCount).toBe(1);
  });

  it("does not flag direction on symmetric constraints when directionOk is false", async () => {
    const symClues: Clue[] = [
      {
        constraint: { type: "next_to", a: "X", b: "Y", axis: "Year" },
        text: "X is next to Y.",
      },
      {
        constraint: {
          type: "exact_distance",
          a: "X",
          b: "Y",
          distance: 2,
          axis: "Year",
        },
        text: "X is exactly 2 from Y.",
      },
    ];

    const verdicts = {
      clues: symClues.map((c, i) => ({
        index: i + 1,
        constraintType: c.constraint.type,
        directionOk: false, // validator's verdict on symmetric — should be ignored
        numericOk: true,
        properNounsOk: true,
      })),
    };

    const errors = await validateTranslation(
      symClues,
      ["a", "b"],
      "German",
      mockValidator(verdicts),
    );

    expect(errors.filter((e) => e.code === "direction_flip")).toHaveLength(0);
  });
});
