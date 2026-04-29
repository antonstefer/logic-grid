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

const SAMPLE_CLUES = [
  {
    constraint: { type: "same_position", a: "Alice", b: "Cat" },
    text: "Alice owns the cat.",
  },
  {
    constraint: { type: "next_to", a: "Bob", b: "Dog", axis: "House" },
    text: "Bob lives next to the dog owner.",
  },
];

interface ClueVerdict {
  index: number;
  constraintType: string;
  directionOk: boolean;
  numericOk: boolean;
  properNounsOk: boolean;
}

function allOkVerdict(): { clues: ClueVerdict[] } {
  return {
    clues: SAMPLE_CLUES.map((c, i) => ({
      index: i + 1,
      constraintType: c.constraint.type,
      directionOk: true,
      numericOk: true,
      properNounsOk: true,
    })),
  };
}

/**
 * Wire the shared completeJSON mock to dispatch translator vs validator calls
 * based on prompt substring. Demo's getAnthropicClient supplies one client for
 * both roles, so we differentiate at the prompt level.
 */
function dispatchByPrompt(
  translatorPayload: unknown,
  validatorPayload: unknown,
): void {
  completeJSON.mockImplementation((prompt: string) => {
    if (prompt.includes("reviewing a translation")) {
      return Promise.resolve(validatorPayload);
    }
    return Promise.resolve(translatorPayload);
  });
}

describe("POST /api/translate", () => {
  it("returns 503 with code missing_api_key when ANTHROPIC_API_KEY is missing", async () => {
    const res = await post({
      request: postBody({ clues: SAMPLE_CLUES, locale: "German" }),
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("missing_api_key");
    expect(body.error).not.toContain("ANTHROPIC_API_KEY");
    expect(body.error.toLowerCase()).toContain("unavailable");
  });

  it("returns 200 with translated clues on success", async () => {
    envProxy.ANTHROPIC_API_KEY = "sk-test";
    const translations = {
      clues: ["Alice besitzt die Katze.", "Bob wohnt neben dem Hundebesitzer."],
    };
    dispatchByPrompt(translations, allOkVerdict());

    const res = await post({
      request: postBody({ clues: SAMPLE_CLUES, locale: "German" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { clues: { text: string }[] };
    expect(body.clues).toHaveLength(2);
    expect(body.clues[0].text).toBe("Alice besitzt die Katze.");
    expect(body.clues[1].text).toBe("Bob wohnt neben dem Hundebesitzer.");
    // The env key actually flowed through to the Anthropic client factory.
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

  it("returns 400 on empty clue list", async () => {
    const res = await post({
      request: postBody({ clues: [], locale: "German" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 on missing locale", async () => {
    const res = await post({ request: postBody({ clues: SAMPLE_CLUES }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 on empty locale string", async () => {
    const res = await post({
      request: postBody({ clues: SAMPLE_CLUES, locale: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 on overlong locale string", async () => {
    const res = await post({
      request: postBody({ clues: SAMPLE_CLUES, locale: "x".repeat(101) }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 on malformed clue items", async () => {
    const res = await post({
      request: postBody({
        clues: [{ text: "no constraint" }],
        locale: "German",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns generic 500 when translation throws a non-MissingEnvError", async () => {
    envProxy.ANTHROPIC_API_KEY = "sk-test";
    completeJSON.mockRejectedValue(new Error("upstream blew up"));

    const res = await post({
      request: postBody({ clues: SAMPLE_CLUES, locale: "German" }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Translation failed");
    expect(body.error).not.toContain("upstream");
  });
});
