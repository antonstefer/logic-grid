import { describe, it, expect, vi } from "vitest";
import { generate, deduce } from "logic-grid";
import { translate, TranslationError } from "./translate";
import type { AIClient } from "./types";
import type { Clue } from "logic-grid";
import * as clientModule from "./client";

const SAMPLE_CLUES: Clue[] = [
  {
    constraint: { type: "same_position", a: "Alice", b: "Coffee" },
    text: "Alice drinks coffee.",
  },
  {
    constraint: { type: "next_to", a: "Cat", b: "Red", axis: "House" },
    text: "The cat lives next to the red house.",
  },
  {
    constraint: { type: "before", a: "Alice", b: "Bob", axis: "Year" },
    text: "Alice started before Bob.",
  },
];

const VALID_TRANSLATIONS = [
  "Alice trinkt Kaffee.",
  "Die Katze wohnt neben dem roten Haus.",
  "Alice hat vor Bob angefangen.",
];

interface ClueVerdict {
  index: number;
  constraintType: string;
  directionOk: boolean;
  numericOk: boolean;
  properNounsOk: boolean;
}

function allOkVerdict(clues: Clue[]): { clues: ClueVerdict[] } {
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

/**
 * Two-client mock: distinguishes translator from validator calls by prompt
 * substring. Returns whichever payload the caller supplied for that role.
 */
function mockSingleClient(
  translatorResult: unknown,
  validatorResult: unknown,
): AIClient {
  return {
    completeJSON: <T>(prompt: string): Promise<T> => {
      if (prompt.includes("reviewing a translation")) {
        return Promise.resolve(validatorResult as T);
      }
      return Promise.resolve(translatorResult as T);
    },
  };
}

describe("translate", () => {
  it("returns translated clues from a mock client", async () => {
    const result = await translate({
      clues: SAMPLE_CLUES,
      locale: "German",
      client: mockSingleClient(
        { clues: VALID_TRANSLATIONS },
        allOkVerdict(SAMPLE_CLUES),
      ),
    });

    expect(result).toHaveLength(3);
    expect(result[0].text).toBe(VALID_TRANSLATIONS[0]);
    expect(result[1].text).toBe(VALID_TRANSLATIONS[1]);
    expect(result[2].text).toBe(VALID_TRANSLATIONS[2]);
  });

  it("preserves original constraints in translated clues", async () => {
    const result = await translate({
      clues: SAMPLE_CLUES,
      locale: "German",
      client: mockSingleClient(
        { clues: VALID_TRANSLATIONS },
        allOkVerdict(SAMPLE_CLUES),
      ),
    });

    for (let i = 0; i < SAMPLE_CLUES.length; i++) {
      expect(result[i].constraint).toBe(SAMPLE_CLUES[i].constraint);
    }
  });

  it("uses default Anthropic clients when none provided", async () => {
    const spy = vi
      .spyOn(clientModule, "createAnthropicClient")
      .mockImplementation(() =>
        mockSingleClient(
          { clues: VALID_TRANSLATIONS },
          allOkVerdict(SAMPLE_CLUES),
        ),
      );

    const result = await translate({
      clues: SAMPLE_CLUES,
      locale: "German",
    });

    // One call for translator (no client), one for validator (temperature: 0).
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(undefined, { temperature: 0 });
    expect(result).toHaveLength(3);
    spy.mockRestore();
  });

  it("includes locale name in the translator prompt", async () => {
    const prompts: string[] = [];
    const client: AIClient = {
      completeJSON: <T>(prompt: string) => {
        prompts.push(prompt);
        if (prompt.includes("reviewing a translation")) {
          return Promise.resolve(allOkVerdict(SAMPLE_CLUES) as T);
        }
        return Promise.resolve({ clues: VALID_TRANSLATIONS } as T);
      },
    };

    await translate({ clues: SAMPLE_CLUES, locale: "Japanese", client });

    expect(prompts[0]).toContain("Japanese");
  });

  it("includes constraint JSON in the translator prompt", async () => {
    let translatorPrompt = "";
    const client: AIClient = {
      completeJSON: <T>(prompt: string) => {
        if (prompt.includes("reviewing a translation")) {
          return Promise.resolve(allOkVerdict(SAMPLE_CLUES) as T);
        }
        translatorPrompt = prompt;
        return Promise.resolve({ clues: VALID_TRANSLATIONS } as T);
      },
    };

    await translate({ clues: SAMPLE_CLUES, locale: "German", client });

    expect(translatorPrompt).toContain('"type":"same_position"');
    expect(translatorPrompt).toContain('"type":"next_to"');
    expect(translatorPrompt).toContain('"type":"before"');
  });

  it("uses separate client and validator when both are provided", async () => {
    const translatorCalls: string[] = [];
    const validatorCalls: string[] = [];

    const client: AIClient = {
      completeJSON: <T>(prompt: string) => {
        translatorCalls.push(prompt);
        return Promise.resolve({ clues: VALID_TRANSLATIONS } as T);
      },
    };
    const validator: AIClient = {
      completeJSON: <T>(prompt: string) => {
        validatorCalls.push(prompt);
        return Promise.resolve(allOkVerdict(SAMPLE_CLUES) as T);
      },
    };

    await translate({
      clues: SAMPLE_CLUES,
      locale: "German",
      client,
      validator,
    });

    expect(translatorCalls).toHaveLength(1);
    expect(validatorCalls).toHaveLength(1);
    expect(translatorCalls[0]).toContain("translating logic-puzzle clues");
    expect(validatorCalls[0]).toContain("reviewing a translation");
  });

  it("falls back validator to client when validator is omitted", async () => {
    const calls: string[] = [];
    const client: AIClient = {
      completeJSON: <T>(prompt: string) => {
        calls.push(prompt);
        if (prompt.includes("reviewing a translation")) {
          return Promise.resolve(allOkVerdict(SAMPLE_CLUES) as T);
        }
        return Promise.resolve({ clues: VALID_TRANSLATIONS } as T);
      },
    };

    await translate({ clues: SAMPLE_CLUES, locale: "German", client });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("translating logic-puzzle clues");
    expect(calls[1]).toContain("reviewing a translation");
  });

  it("retries on structural failure", async () => {
    let translatorCalls = 0;
    const client: AIClient = {
      completeJSON: <T>(prompt: string) => {
        if (prompt.includes("reviewing a translation")) {
          return Promise.resolve(allOkVerdict(SAMPLE_CLUES) as T);
        }
        translatorCalls++;
        if (translatorCalls < 3) {
          return Promise.resolve({
            clues: ["only one"],
          } as T);
        }
        return Promise.resolve({ clues: VALID_TRANSLATIONS } as T);
      },
    };

    const result = await translate({
      clues: SAMPLE_CLUES,
      locale: "German",
      client,
    });

    expect(translatorCalls).toBe(3);
    expect(result[0].text).toBe(VALID_TRANSLATIONS[0]);
  });

  it("retries on semantic failure (constraint type mismatch)", async () => {
    let translatorCalls = 0;
    const client: AIClient = {
      completeJSON: <T>(prompt: string) => {
        if (prompt.includes("reviewing a translation")) {
          if (translatorCalls < 2) {
            // First attempt: validator says constraint type drifted
            return Promise.resolve({
              clues: SAMPLE_CLUES.map((_, i) => ({
                index: i + 1,
                constraintType: i === 1 ? "next_to" : "near", // drift on non-clue-2 entries
                directionOk: true,
                numericOk: true,
                properNounsOk: true,
              })),
            } as T);
          }
          return Promise.resolve(allOkVerdict(SAMPLE_CLUES) as T);
        }
        translatorCalls++;
        return Promise.resolve({ clues: VALID_TRANSLATIONS } as T);
      },
    };

    const result = await translate({
      clues: SAMPLE_CLUES,
      locale: "German",
      client,
    });

    expect(translatorCalls).toBe(2);
    expect(result[0].text).toBe(VALID_TRANSLATIONS[0]);
  });

  it("detects direction-flip on `before` clues", async () => {
    let caught: unknown;
    const client: AIClient = {
      completeJSON: <T>(prompt: string) => {
        if (prompt.includes("reviewing a translation")) {
          return Promise.resolve({
            clues: SAMPLE_CLUES.map((c, i) => ({
              index: i + 1,
              constraintType: c.constraint.type,
              directionOk: c.constraint.type !== "before", // flip on `before` clue
              numericOk: true,
              properNounsOk: true,
            })),
          } as T);
        }
        return Promise.resolve({ clues: VALID_TRANSLATIONS } as T);
      },
    };

    try {
      await translate({ clues: SAMPLE_CLUES, locale: "German", client });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(TranslationError);
    const err = caught as TranslationError;
    expect(err.errors.some((e) => e.code === "direction_flip")).toBe(true);
  });

  it("detects polarity drop (not_between -> between)", async () => {
    const polarityClues: Clue[] = [
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

    let caught: unknown;
    const client: AIClient = {
      completeJSON: <T>(prompt: string) => {
        if (prompt.includes("reviewing a translation")) {
          return Promise.resolve({
            clues: [
              {
                index: 1,
                constraintType: "between", // negation dropped
                directionOk: true,
                numericOk: true,
                properNounsOk: true,
              },
            ],
          } as T);
        }
        return Promise.resolve({ clues: ["B ist zwischen A und C."] } as T);
      },
    };

    try {
      await translate({ clues: polarityClues, locale: "German", client });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(TranslationError);
    const err = caught as TranslationError;
    expect(err.errors.some((e) => e.code === "constraint_type_mismatch")).toBe(
      true,
    );
  });

  it("throws TranslationError with structured errors after max retries", async () => {
    const client: AIClient = {
      completeJSON: <T>(prompt: string) => {
        if (prompt.includes("reviewing a translation")) {
          return Promise.resolve({
            clues: SAMPLE_CLUES.map((_, i) => ({
              index: i + 1,
              constraintType: "wrong_type",
              directionOk: true,
              numericOk: true,
              properNounsOk: true,
            })),
          } as T);
        }
        return Promise.resolve({ clues: VALID_TRANSLATIONS } as T);
      },
    };

    let caught: unknown;
    try {
      await translate({ clues: SAMPLE_CLUES, locale: "German", client });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(TranslationError);
    const err = caught as TranslationError;
    expect(err.message).toContain("Translation to German failed after 3");
    expect(err.errors.length).toBeGreaterThan(0);
    expect(err.errors[0].code).toBe("constraint_type_mismatch");
  });

  it("propagates client errors", async () => {
    const client: AIClient = {
      completeJSON: () => Promise.reject(new Error("Network error")),
    };

    await expect(
      translate({ clues: SAMPLE_CLUES, locale: "German", client }),
    ).rejects.toThrow("Network error");
  });

  it("returns empty array for empty clues input", async () => {
    let called = false;
    const client: AIClient = {
      completeJSON: <T>() => {
        called = true;
        return Promise.resolve({ clues: [] } as T);
      },
    };

    const result = await translate({ clues: [], locale: "German", client });

    expect(result).toEqual([]);
    expect(called).toBe(false);
  });

  it("throws on empty locale", async () => {
    await expect(
      translate({ clues: SAMPLE_CLUES, locale: "" }),
    ).rejects.toThrow("locale must be a non-empty string");
  });

  it("throws on whitespace-only locale", async () => {
    await expect(
      translate({ clues: SAMPLE_CLUES, locale: "   " }),
    ).rejects.toThrow("locale must be a non-empty string");
  });

  it("feeds validation errors back into retry prompt", async () => {
    const translatorPrompts: string[] = [];
    let translatorCalls = 0;
    const client: AIClient = {
      completeJSON: <T>(prompt: string) => {
        if (prompt.includes("reviewing a translation")) {
          if (translatorCalls < 2) {
            return Promise.resolve({
              clues: SAMPLE_CLUES.map((c, i) => ({
                index: i + 1,
                constraintType: c.constraint.type,
                directionOk: true,
                numericOk: i !== 0, // numeric drift on clue 1
                properNounsOk: true,
              })),
            } as T);
          }
          return Promise.resolve(allOkVerdict(SAMPLE_CLUES) as T);
        }
        translatorPrompts.push(prompt);
        translatorCalls++;
        return Promise.resolve({ clues: VALID_TRANSLATIONS } as T);
      },
    };

    await translate({ clues: SAMPLE_CLUES, locale: "German", client });

    expect(translatorPrompts.length).toBeGreaterThanOrEqual(2);
    expect(translatorPrompts[1]).toContain("Previous attempt had errors");
    expect(translatorPrompts[1]).toContain("numbers or units differ");
  });

  it("result integrates with generate() and deduce()", async () => {
    const puzzle = generate({ size: 4, categories: 4, seed: 42 });

    const translations = puzzle.clues.map(
      (_, i) => `Klue auf Deutsch Nummer ${i + 1}.`,
    );

    const client: AIClient = {
      completeJSON: <T>(prompt: string) => {
        if (prompt.includes("reviewing a translation")) {
          return Promise.resolve(allOkVerdict(puzzle.clues) as T);
        }
        return Promise.resolve({ clues: translations } as T);
      },
    };

    const result = await translate({
      clues: puzzle.clues,
      locale: "German",
      client,
    });

    expect(result).toHaveLength(puzzle.clues.length);
    for (let i = 0; i < result.length; i++) {
      expect(result[i].constraint).toBe(puzzle.clues[i].constraint);
      expect(result[i].text).toBe(translations[i]);
    }

    const translatedPuzzle = { ...puzzle, clues: result };
    const deduction = deduce(
      translatedPuzzle.constraints,
      translatedPuzzle.grid,
    );
    expect(deduction.complete).toBe(true);
  });
});
