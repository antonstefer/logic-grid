import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./+server";
import { createAnthropicClient } from "logic-grid-ai";
import { _resetAnthropicClientCache } from "$lib/server/anthropic";

const { envProxy, completeJSON } = vi.hoisted(() => ({
  envProxy: {} as { ANTHROPIC_API_KEY?: string },
  completeJSON: vi.fn(),
}));

vi.mock("$env/dynamic/private", () => ({
  env: envProxy,
}));

vi.mock("logic-grid-ai", async (importOriginal) => {
  const orig = await importOriginal<typeof import("logic-grid-ai")>();
  return {
    ...orig,
    createAnthropicClient: vi.fn(() => ({ completeJSON })),
  };
});

type Handler = (event: { request: Request }) => Promise<Response>;
const post = POST as unknown as Handler;

beforeEach(() => {
  delete envProxy.ANTHROPIC_API_KEY;
  completeJSON.mockReset();
  _resetAnthropicClientCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function postBody(body: unknown): Request {
  return new Request("http://test/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SAMPLE_PUZZLE = {
  grid: {
    size: 3,
    categories: [
      {
        name: "House",
        values: ["1", "2", "3"],
        noun: "house",
        ordered: true,
        verb: ["lives in the", "does not live in the"],
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
      },
      {
        name: "Color",
        values: ["Red", "Blue", "Green"],
        noun: "house",
        valueSuffix: "house",
        lowercase: true,
        positionAdjective: ["is", "is not"],
      },
    ],
  },
  constraints: [
    { type: "same_position", a: "Alice", b: "Red" },
    { type: "next_to", a: "Bob", b: "Green", axis: "House" },
  ],
  clues: [
    {
      constraint: { type: "same_position", a: "Alice", b: "Red" },
      text: "Alice lives in the red house.",
    },
    {
      constraint: { type: "next_to", a: "Bob", b: "Green", axis: "House" },
      text: "Bob lives next to the green house.",
    },
  ],
  solution: [],
  difficulty: "easy",
};

const VALID_TRANSLATION = {
  clues: ["Alice wohnt im roten Haus.", "Bob wohnt neben dem grünen Haus."],
  categoryNames: { House: "Haus", Name: "Name", Color: "Farbe" },
  valueLabels: {
    "1": "1",
    "2": "2",
    "3": "3",
    Alice: "Alice",
    Bob: "Bob",
    Carol: "Carol",
    Red: "Rot",
    Blue: "Blau",
    Green: "Grün",
  },
};

const VALID_VERDICT = {
  clues: SAMPLE_PUZZLE.clues.map((c, i) => ({
    index: i + 1,
    constraintType: c.constraint.type,
    directionOk: true,
    numericOk: true,
    properNounsOk: true,
  })),
};

/**
 * Wire the shared completeJSON mock to dispatch translator vs validator
 * calls based on prompt substring. Demo uses a single getAnthropicClient
 * for both roles; we differentiate at the prompt level.
 */
function dispatchByPrompt(
  translatorPayload: unknown,
  validatorPayload: unknown,
): void {
  completeJSON.mockImplementation((prompt: string) => {
    if (prompt.includes("reviewing translated clues")) {
      return Promise.resolve(validatorPayload);
    }
    return Promise.resolve(translatorPayload);
  });
}

describe("POST /api/translate", () => {
  it("returns 503 with code missing_api_key when ANTHROPIC_API_KEY is missing", async () => {
    const res = await post({
      request: postBody({ puzzle: SAMPLE_PUZZLE, locale: "German" }),
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("missing_api_key");
    expect(body.error).not.toContain("ANTHROPIC_API_KEY");
    expect(body.error.toLowerCase()).toContain("unavailable");
  });

  it("returns 200 with translated puzzle on success", async () => {
    envProxy.ANTHROPIC_API_KEY = "sk-test";
    dispatchByPrompt(VALID_TRANSLATION, VALID_VERDICT);

    const res = await post({
      request: postBody({ puzzle: SAMPLE_PUZZLE, locale: "German" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      clues: { text: string }[];
      categoryNames: Record<string, string>;
      valueLabels: Record<string, string>;
    };
    expect(body.clues).toHaveLength(2);
    expect(body.clues[0].text).toBe("Alice wohnt im roten Haus.");
    expect(body.categoryNames.House).toBe("Haus");
    expect(body.valueLabels.Red).toBe("Rot");
    expect(body.valueLabels.Alice).toBe("Alice");
    expect(vi.mocked(createAnthropicClient)).toHaveBeenCalledWith("sk-test");
  });

  it("returns 400 on invalid JSON", async () => {
    const req = new Request("http://test/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await post({ request: req });
    expect(res.status).toBe(400);
  });

  it("returns 400 on missing puzzle", async () => {
    const res = await post({ request: postBody({ locale: "German" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 on puzzle with no clues", async () => {
    const res = await post({
      request: postBody({
        puzzle: { ...SAMPLE_PUZZLE, clues: [] },
        locale: "German",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 on puzzle with malformed clue items", async () => {
    const res = await post({
      request: postBody({
        puzzle: { ...SAMPLE_PUZZLE, clues: [{ text: "no constraint" }] },
        locale: "German",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 on puzzle with no grid", async () => {
    const { grid: _grid, ...puzzleNoGrid } = SAMPLE_PUZZLE;
    void _grid;
    const res = await post({
      request: postBody({ puzzle: puzzleNoGrid, locale: "German" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 on puzzle with empty categories", async () => {
    const res = await post({
      request: postBody({
        puzzle: {
          ...SAMPLE_PUZZLE,
          grid: { ...SAMPLE_PUZZLE.grid, categories: [] },
        },
        locale: "German",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 on puzzle with non-numeric grid size", async () => {
    const res = await post({
      request: postBody({
        puzzle: {
          ...SAMPLE_PUZZLE,
          grid: { ...SAMPLE_PUZZLE.grid, size: "three" },
        },
        locale: "German",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 on missing locale", async () => {
    const res = await post({ request: postBody({ puzzle: SAMPLE_PUZZLE }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 on empty locale string", async () => {
    const res = await post({
      request: postBody({ puzzle: SAMPLE_PUZZLE, locale: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 on overlong locale string", async () => {
    const res = await post({
      request: postBody({ puzzle: SAMPLE_PUZZLE, locale: "x".repeat(101) }),
    });
    expect(res.status).toBe(400);
  });

  it("returns generic 500 when translation throws a non-MissingEnvError", async () => {
    envProxy.ANTHROPIC_API_KEY = "sk-test";
    completeJSON.mockRejectedValue(new Error("upstream blew up"));

    const res = await post({
      request: postBody({ puzzle: SAMPLE_PUZZLE, locale: "German" }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Translation failed");
    expect(body.error).not.toContain("upstream");
  });
});
