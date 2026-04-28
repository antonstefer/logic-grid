import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./+server";
import * as ai from "logic-grid-ai";
import { validateRewrittenClues } from "logic-grid-ai";
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
  return new Request("http://test/api/rewrite-clues", {
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

describe("POST /api/rewrite-clues", () => {
  it("returns 503 with code missing_api_key when ANTHROPIC_API_KEY is missing", async () => {
    const res = await post({
      request: postBody({ clues: SAMPLE_CLUES, style: "pirate" }),
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("missing_api_key");
    expect(body.error).not.toContain("ANTHROPIC_API_KEY");
    expect(body.error.toLowerCase()).toContain("unavailable");
  });

  it("returns 200 with rewritten clues on success", async () => {
    envProxy.ANTHROPIC_API_KEY = "sk-test";
    const cluesFixture = {
      clues: ["Alice keeps the cat.", "Bob is next to the dog owner."],
    };
    // Validate the fixture against the real schema so a future schema change
    // breaks here loudly instead of leaking through to an opaque 500.
    expect(validateRewrittenClues(cluesFixture, 2)).toEqual([]);
    completeJSON.mockResolvedValue(cluesFixture);

    const res = await post({
      request: postBody({ clues: SAMPLE_CLUES, style: "pirate" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { clues: { text: string }[] };
    expect(body.clues).toHaveLength(2);
    expect(body.clues[0].text).toBe("Alice keeps the cat.");
    expect(body.clues[1].text).toBe("Bob is next to the dog owner.");
    // The env key actually flowed through to the Anthropic client factory.
    expect(vi.mocked(ai.createAnthropicClient)).toHaveBeenCalledWith("sk-test");
  });

  it("returns 400 on invalid JSON", async () => {
    const req = new Request("http://test/api/rewrite-clues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await post({ request: req });
    expect(res.status).toBe(400);
  });

  it("returns 400 on empty clue list", async () => {
    const res = await post({ request: postBody({ clues: [], style: "x" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 on missing style", async () => {
    const res = await post({ request: postBody({ clues: SAMPLE_CLUES }) });
    expect(res.status).toBe(400);
  });
});
