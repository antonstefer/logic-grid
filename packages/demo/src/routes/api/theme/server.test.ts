import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./+server";
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
  return new Request("http://test/api/theme", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/theme", () => {
  it("returns 503 with code missing_api_key when ANTHROPIC_API_KEY is missing", async () => {
    const res = await post({
      request: postBody({ theme: "pirates", size: 4, categories: 4 }),
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("missing_api_key");
    expect(body.error).not.toContain("ANTHROPIC_API_KEY");
    expect(body.error.toLowerCase()).toContain("unavailable");
  });

  it("returns 200 with the generated theme on success", async () => {
    envProxy.ANTHROPIC_API_KEY = "sk-test";
    completeJSON.mockResolvedValue({
      categories: [
        { name: "Pirate", values: ["A", "B", "C", "D"], noun: "" },
        {
          name: "Ship",
          values: ["W", "X", "Y", "Z"],
          noun: "captain",
          verb: ["sails the", "does not sail the"],
          ordered: true,
          orderingPhrases: {
            comparators: {
              before: "is before",
              left_of: "is right before",
              next_to: "is right next to",
              not_next_to: "is not right next to",
              between: "is between",
              not_between: "is not between",
              exact_distance: "is exactly",
            },
          },
        },
        {
          name: "Treasure",
          values: ["P", "Q", "R", "S"],
          noun: "finder",
          verb: ["found the", "did not find the"],
        },
        {
          name: "Port",
          values: ["E", "F", "G", "H"],
          noun: "docker",
          verb: ["docked at", "did not dock at"],
        },
      ],
    });

    const res = await post({
      request: postBody({ theme: "pirates", size: 4, categories: 4 }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { categories: { name: string }[] };
    expect(body.categories).toHaveLength(4);
    expect(body.categories.map((c) => c.name)).toEqual([
      "Pirate",
      "Ship",
      "Treasure",
      "Port",
    ]);
  });

  it("returns 400 on invalid JSON body", async () => {
    const req = new Request("http://test/api/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await post({ request: req });
    expect(res.status).toBe(400);
  });

  it("returns 400 on missing theme", async () => {
    const res = await post({ request: postBody({ size: 4, categories: 4 }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 on non-numeric size/categories", async () => {
    const res = await post({
      request: postBody({ theme: "x", size: "4", categories: 4 }),
    });
    expect(res.status).toBe(400);
  });
});
