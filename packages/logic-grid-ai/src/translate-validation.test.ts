import { describe, it, expect } from "vitest";
import {
  checkTranslationStructure,
  validateTranslation,
} from "./translate-validation";
import { hasCode } from "./test-utils";
import type { AIClient } from "./types";
import type { Puzzle } from "logic-grid";

const SAMPLE_PUZZLE: Puzzle = {
  grid: {
    size: 3,
    categories: [
      {
        name: "House",
        values: ["1", "2", "3"],
        noun: "house",
        verb: ["lives in the", "does not live in the"],
        ordered: true,
        orderingPhrases: {
          unit: ["house", "houses"],
          comparators: {
            before: ["lives left of", "lives right of"],
            left_of: ["lives directly left of", "lives directly right of"],
            next_to: "lives next to",
            not_next_to: "does not live next to",
            between: "lives between",
            not_between: "does not live between",
            exact_distance: "lives exactly",
          },
        },
      },
      {
        name: "Name",
        values: ["Alice", "Bob", "Carol"],
        noun: "",
        subjectPriority: 2,
      },
      {
        name: "Color",
        values: ["Red", "Blue", "Green"],
        noun: "house",
        valueSuffix: "house",
        lowercase: true,
        positionAdjective: ["is", "is not"],
        subjectPriority: -1,
      },
    ],
  },
  constraints: [
    { type: "same_position", a: "Alice", b: "Red" },
    { type: "before", a: "Carol", b: "Bob", axis: "House" },
    {
      type: "not_between",
      outer1: "Alice",
      middle: "Bob",
      outer2: "Carol",
      axis: "House",
    },
  ],
  clues: [
    {
      constraint: { type: "same_position", a: "Alice", b: "Red" },
      text: "Alice lives in the red house.",
    },
    {
      constraint: { type: "before", a: "Carol", b: "Bob", axis: "House" },
      text: "Carol lives left of Bob.",
    },
    {
      constraint: {
        type: "not_between",
        outer1: "Alice",
        middle: "Bob",
        outer2: "Carol",
        axis: "House",
      },
      text: "Bob does not live between Alice and Carol.",
    },
  ],
  solution: [
    { "1": 0, "2": 1, "3": 2 },
    { Alice: 0, Bob: 2, Carol: 1 },
    { Red: 0, Blue: 2, Green: 1 },
  ],
  difficulty: "easy",
};

const VALID_VALUE_LABELS = {
  "1": "1",
  "2": "2",
  "3": "3",
  Alice: "Alice",
  Bob: "Bob",
  Carol: "Carol",
  Red: "Rot",
  Blue: "Blau",
  Green: "Grün",
};

const VALID_CATEGORY_NAMES = {
  House: "Haus",
  Name: "Name",
  Color: "Farbe",
};

function validRaw(): {
  clues: unknown[];
  categoryNames: Record<string, unknown>;
  valueLabels: Record<string, unknown>;
} {
  return {
    clues: ["a", "b", "c"],
    categoryNames: { ...VALID_CATEGORY_NAMES },
    valueLabels: { ...VALID_VALUE_LABELS },
  };
}

interface ClueVerdict {
  index: number;
  constraintType: string;
  directionOk: boolean;
  numericOk: boolean;
  properNounsOk: boolean;
}

function allOk(): { clues: ClueVerdict[] } {
  return {
    clues: SAMPLE_PUZZLE.clues.map((c, i) => ({
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
    expect(checkTranslationStructure(validRaw(), SAMPLE_PUZZLE)).toEqual([]);
  });

  it("rejects wrong clue count", () => {
    const raw = validRaw();
    raw.clues = ["one", "two"];
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    expect(hasCode(errors, "wrong_clue_count")).toBe(true);
    expect(
      errors.find((e) => e.code === "wrong_clue_count")?.message,
    ).toContain("Expected 3 clues, got 2");
  });

  it("rejects empty clue text", () => {
    const raw = validRaw();
    raw.clues = ["", "two", "three"];
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    expect(hasCode(errors, "empty_translation")).toBe(true);
    expect(errors.find((e) => e.code === "empty_translation")?.clueIndex).toBe(
      1,
    );
  });

  it("rejects whitespace-only clue text", () => {
    const raw = validRaw();
    raw.clues = ["one", "   ", "three"];
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    expect(hasCode(errors, "empty_translation")).toBe(true);
    expect(errors.find((e) => e.code === "empty_translation")?.clueIndex).toBe(
      2,
    );
  });

  it("rejects translation exceeding max length", () => {
    const raw = validRaw();
    raw.clues = ["one", "A".repeat(501), "three"];
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    expect(hasCode(errors, "long_translation")).toBe(true);
    expect(errors.find((e) => e.code === "long_translation")?.clueIndex).toBe(
      2,
    );
  });

  it("rejects duplicate translation (case-insensitive)", () => {
    const raw = validRaw();
    raw.clues = ["Alice trinkt Kaffee.", "two", "alice trinkt kaffee."];
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    expect(hasCode(errors, "duplicate_translation")).toBe(true);
    expect(
      errors.find((e) => e.code === "duplicate_translation")?.clueIndex,
    ).toBe(3);
  });

  it("rejects non-string clue item", () => {
    const raw = validRaw();
    raw.clues = ["one", 42, "three"];
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    expect(hasCode(errors, "non_string_clue")).toBe(true);
    expect(errors.find((e) => e.code === "non_string_clue")?.clueIndex).toBe(2);
  });

  it("rejects missing categoryNames key", () => {
    const raw = validRaw();
    delete raw.categoryNames.Color;
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    expect(hasCode(errors, "missing_category_name")).toBe(true);
    expect(errors.find((e) => e.code === "missing_category_name")?.key).toBe(
      "Color",
    );
  });

  it("rejects empty categoryNames value", () => {
    const raw = validRaw();
    raw.categoryNames.Color = "";
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    expect(hasCode(errors, "empty_category_name")).toBe(true);
    expect(errors.find((e) => e.code === "empty_category_name")?.key).toBe(
      "Color",
    );
  });

  it("rejects whitespace-only categoryNames value", () => {
    const raw = validRaw();
    raw.categoryNames.Color = "   ";
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    expect(hasCode(errors, "empty_category_name")).toBe(true);
  });

  it("rejects non-string categoryNames value", () => {
    const raw = validRaw();
    raw.categoryNames.Color = 42;
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    expect(hasCode(errors, "empty_category_name")).toBe(true);
  });

  it("rejects missing valueLabels key", () => {
    const raw = validRaw();
    delete raw.valueLabels.Carol;
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    expect(hasCode(errors, "missing_value_label")).toBe(true);
    expect(errors.find((e) => e.code === "missing_value_label")?.key).toBe(
      "Carol",
    );
  });

  it("rejects empty valueLabels value", () => {
    const raw = validRaw();
    raw.valueLabels.Red = "";
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    expect(hasCode(errors, "empty_value_label")).toBe(true);
    expect(errors.find((e) => e.code === "empty_value_label")?.key).toBe("Red");
  });

  it("rejects non-string valueLabels value", () => {
    const raw = validRaw();
    raw.valueLabels.Red = 42;
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    expect(hasCode(errors, "empty_value_label")).toBe(true);
  });

  it("rejects two categories mapped to the same localized name", () => {
    const raw = validRaw();
    raw.categoryNames.Color = "Haus"; // collides with House → "Haus"
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    expect(hasCode(errors, "duplicate_category_name")).toBe(true);
    const dup = errors.find((e) => e.code === "duplicate_category_name");
    expect(dup?.key).toBe("Color");
    expect(dup?.message).toContain("House");
  });

  it("flags duplicate category names case-insensitively", () => {
    const raw = validRaw();
    raw.categoryNames.House = "Farbe";
    raw.categoryNames.Color = "FARBE";
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    expect(hasCode(errors, "duplicate_category_name")).toBe(true);
  });

  it("rejects two values mapped to the same localized label", () => {
    const raw = validRaw();
    raw.valueLabels.Bob = "Alice"; // Alice already maps to "Alice"
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    expect(hasCode(errors, "duplicate_value_label")).toBe(true);
    const dup = errors.find((e) => e.code === "duplicate_value_label");
    expect(dup?.key).toBe("Bob");
    expect(dup?.message).toContain("Alice");
  });

  it("flags duplicate value labels case-insensitively", () => {
    const raw = validRaw();
    raw.valueLabels.Red = "foo";
    raw.valueLabels.Blue = "FoO";
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    // Blue collides with Red despite different casing.
    expect(hasCode(errors, "duplicate_value_label")).toBe(true);
    const dup = errors.find((e) => e.code === "duplicate_value_label");
    expect(dup?.key).toBe("Blue");
  });

  it("does not flag a value mapping to itself (proper noun preservation)", () => {
    // Alice → "Alice", Bob → "Bob": fine, they're different localized strings.
    const raw = validRaw();
    expect(checkTranslationStructure(raw, SAMPLE_PUZZLE)).toEqual([]);
  });

  it("omits clueIndex on count-level errors", () => {
    const raw = validRaw();
    raw.clues = ["only one"];
    const errors = checkTranslationStructure(raw, SAMPLE_PUZZLE);
    const e = errors.find((x) => x.code === "wrong_clue_count");
    expect(e).toBeDefined();
    expect("clueIndex" in (e as object)).toBe(false);
  });
});

describe("validateTranslation", () => {
  it("returns empty array when validator reports all-OK", async () => {
    const errors = await validateTranslation(
      SAMPLE_PUZZLE,
      { clues: ["a", "b", "c"] },
      "German",
      mockValidator(allOk()),
    );
    expect(errors).toEqual([]);
  });

  it("returns empty array on empty clues without calling validator", async () => {
    const emptyPuzzle: Puzzle = { ...SAMPLE_PUZZLE, clues: [] };
    let called = false;
    const validator: AIClient = {
      completeJSON: <T>() => {
        called = true;
        return Promise.resolve({ clues: [] } as T);
      },
    };

    const errors = await validateTranslation(
      emptyPuzzle,
      { clues: [] },
      "German",
      validator,
    );

    expect(errors).toEqual([]);
    expect(called).toBe(false);
  });

  it("emits constraint_type_mismatch when verdict type differs from source", async () => {
    const verdicts = allOk();
    verdicts.clues[0].constraintType = "wrong_type";

    const errors = await validateTranslation(
      SAMPLE_PUZZLE,
      { clues: ["a", "b", "c"] },
      "German",
      mockValidator(verdicts),
    );

    expect(hasCode(errors, "constraint_type_mismatch")).toBe(true);
    expect(
      errors.find((e) => e.code === "constraint_type_mismatch")?.clueIndex,
    ).toBe(1);
  });

  it("emits direction_flip only for asymmetric constraints", async () => {
    const verdicts = allOk();
    // Flip on same_position (symmetric, ignored) and before (asymmetric, emitted)
    verdicts.clues[0].directionOk = false; // same_position — ignored
    verdicts.clues[1].directionOk = false; // before — emitted

    const errors = await validateTranslation(
      SAMPLE_PUZZLE,
      { clues: ["a", "b", "c"] },
      "German",
      mockValidator(verdicts),
    );

    const flipErrors = errors.filter((e) => e.code === "direction_flip");
    expect(flipErrors).toHaveLength(1);
    expect(flipErrors[0].clueIndex).toBe(2);
  });

  it("emits direction_flip on left_of as well as before", async () => {
    const leftOfPuzzle: Puzzle = {
      ...SAMPLE_PUZZLE,
      constraints: [{ type: "left_of", a: "X", b: "Y", axis: "House" }],
      clues: [
        {
          constraint: { type: "left_of", a: "X", b: "Y", axis: "House" },
          text: "X is directly before Y.",
        },
      ],
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
      leftOfPuzzle,
      { clues: ["..."] },
      "German",
      mockValidator(verdicts),
    );

    expect(hasCode(errors, "direction_flip")).toBe(true);
  });

  it("emits numeric_changed when numericOk is false", async () => {
    const verdicts = allOk();
    verdicts.clues[2].numericOk = false;

    const errors = await validateTranslation(
      SAMPLE_PUZZLE,
      { clues: ["a", "b", "c"] },
      "German",
      mockValidator(verdicts),
    );

    expect(hasCode(errors, "numeric_changed")).toBe(true);
    expect(errors.find((e) => e.code === "numeric_changed")?.clueIndex).toBe(3);
  });

  it("emits proper_noun_dropped when properNounsOk is false", async () => {
    const verdicts = allOk();
    verdicts.clues[0].properNounsOk = false;

    const errors = await validateTranslation(
      SAMPLE_PUZZLE,
      { clues: ["a", "b", "c"] },
      "German",
      mockValidator(verdicts),
    );

    expect(hasCode(errors, "proper_noun_dropped")).toBe(true);
    expect(
      errors.find((e) => e.code === "proper_noun_dropped")?.clueIndex,
    ).toBe(1);
  });

  it("aggregates multiple errors per clue", async () => {
    const verdicts = allOk();
    verdicts.clues[1].constraintType = "wrong";
    verdicts.clues[1].directionOk = false;
    verdicts.clues[1].numericOk = false;
    verdicts.clues[1].properNounsOk = false;

    const errors = await validateTranslation(
      SAMPLE_PUZZLE,
      { clues: ["a", "b", "c"] },
      "German",
      mockValidator(verdicts),
    );

    const clue2Errors = errors.filter((e) => e.clueIndex === 2);
    expect(clue2Errors).toHaveLength(4);
  });

  it("includes locale and source/translation pairs in the validator prompt", async () => {
    let capturedPrompt = "";
    const validator: AIClient = {
      completeJSON: <T>(prompt: string) => {
        capturedPrompt = prompt;
        return Promise.resolve(allOk() as T);
      },
    };

    await validateTranslation(
      SAMPLE_PUZZLE,
      { clues: ["Alice trinkt Kaffee.", "b", "c"] },
      "Japanese",
      validator,
    );

    expect(capturedPrompt).toContain("Japanese");
    expect(capturedPrompt).toContain("reviewing translated clues");
    expect(capturedPrompt).toContain("Alice lives in the red house.");
    expect(capturedPrompt).toContain("Alice trinkt Kaffee.");
    expect(capturedPrompt).toContain('"type":"same_position"');
  });

  it("calls validator exactly once per batch", async () => {
    let callCount = 0;
    const validator: AIClient = {
      completeJSON: <T>() => {
        callCount++;
        return Promise.resolve(allOk() as T);
      },
    };

    await validateTranslation(
      SAMPLE_PUZZLE,
      { clues: ["a", "b", "c"] },
      "German",
      validator,
    );

    expect(callCount).toBe(1);
  });

  it("emits verdict_index_mismatch (without crashing) when the AI returns fewer verdicts than expected", async () => {
    // Schema enforcement is best-effort; if a model returns a short
    // array, we should still get a typed error instead of a TypeError
    // crash on `result.clues[i].index`.
    const verdicts = {
      clues: [
        {
          index: 1,
          constraintType: "same_position",
          directionOk: true,
          numericOk: true,
          properNounsOk: true,
        },
      ],
    };

    const errors = await validateTranslation(
      SAMPLE_PUZZLE,
      { clues: ["a", "b", "c"] },
      "German",
      mockValidator(verdicts),
    );

    expect(hasCode(errors, "verdict_index_mismatch")).toBe(true);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("expected 3");
  });

  it("emits verdict_index_mismatch when the AI returns misordered verdicts", async () => {
    const verdicts = {
      clues: SAMPLE_PUZZLE.clues.map((c, i) => ({
        // First verdict claims to be index 2 — order broken.
        index: i === 0 ? 2 : i + 1,
        constraintType: c.constraint.type,
        directionOk: true,
        numericOk: true,
        properNounsOk: true,
      })),
    };

    const errors = await validateTranslation(
      SAMPLE_PUZZLE,
      { clues: ["a", "b", "c"] },
      "German",
      mockValidator(verdicts),
    );

    expect(hasCode(errors, "verdict_index_mismatch")).toBe(true);
    // Bails early — no other per-clue errors should appear from a batch
    // we already know is corrupted.
    expect(errors).toHaveLength(1);
    expect(errors[0].clueIndex).toBe(1);
  });

  it("does not flag direction on symmetric constraints when directionOk is false", async () => {
    const symPuzzle: Puzzle = {
      ...SAMPLE_PUZZLE,
      constraints: [
        { type: "next_to", a: "X", b: "Y", axis: "House" },
        { type: "exact_distance", a: "X", b: "Y", distance: 2, axis: "House" },
      ],
      clues: [
        {
          constraint: { type: "next_to", a: "X", b: "Y", axis: "House" },
          text: "X is next to Y.",
        },
        {
          constraint: {
            type: "exact_distance",
            a: "X",
            b: "Y",
            distance: 2,
            axis: "House",
          },
          text: "X is exactly 2 from Y.",
        },
      ],
    };

    const verdicts = {
      clues: symPuzzle.clues.map((c, i) => ({
        index: i + 1,
        constraintType: c.constraint.type,
        directionOk: false, // verdict is false on symmetric — should be ignored
        numericOk: true,
        properNounsOk: true,
      })),
    };

    const errors = await validateTranslation(
      symPuzzle,
      { clues: ["a", "b"] },
      "German",
      mockValidator(verdicts),
    );

    expect(errors.filter((e) => e.code === "direction_flip")).toHaveLength(0);
  });
});
