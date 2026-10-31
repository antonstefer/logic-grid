import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { validateThemeResult } from "logic-grid-ai";
import { importWithApiKey } from "../../../test-helpers";

const { completeJSON, createAnthropicClient } = vi.hoisted(() => {
  const completeJSON = vi.fn();
  return {
    completeJSON,
    createAnthropicClient: vi.fn(() => ({ completeJSON })),
  };
});

vi.mock("logic-grid-ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("logic-grid-ai")>()),
  createAnthropicClient,
}));

type Handler = (event: { request: Request }) => Promise<Response>;

/** Imports the route's POST handler with `key` as the API key. */
async function loadPost(key?: string): Promise<Handler> {
  const { POST } = await importWithApiKey(key, () => import("./+server"));
  return POST as unknown as Handler;
}

// One handler per key, each loaded once. The tests that use the key share
// its client, as an isolate's requests do.
let post: Handler;
let postWithKey: Handler;

beforeAll(async () => {
  post = await loadPost();
  postWithKey = await loadPost("sk-test");
});

beforeEach(() => {
  completeJSON.mockReset();
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
    const themeFixture = {
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
              before: ["is before", "is after"],
              left_of: ["is right before", "is right after"],
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
    };
    // Validate the fixture against the real schema so a future schema change
    // breaks here loudly instead of leaking through to an opaque 500.
    expect(validateThemeResult(themeFixture, 4, 4)).toEqual([]);
    completeJSON.mockResolvedValue(themeFixture);

    const res = await postWithKey({
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
    // The env key actually flowed through to the Anthropic client factory —
    // not just covered transitively by the unit test.
    expect(createAnthropicClient).toHaveBeenCalledWith("sk-test");
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

  it("returns generic 500 when AI generation throws a non-MissingEnvError", async () => {
    completeJSON.mockRejectedValue(new Error("upstream blew up"));

    const res = await postWithKey({
      request: postBody({ theme: "pirates", size: 4, categories: 4 }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Theme generation failed");
    // Specific failure detail must NOT leak to the client.
    expect(body.error).not.toContain("upstream");
  });
});
