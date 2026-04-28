import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./+server";
import type { RequestHandler } from "./$types";
import { _resetAnthropicClientCache } from "$lib/server/anthropic";

const { envProxy } = vi.hoisted(() => ({
  envProxy: {} as { ANTHROPIC_API_KEY?: string },
}));

vi.mock("$env/dynamic/private", () => ({
  env: envProxy,
}));

type Handler = (event: { request: Request }) => Promise<Response>;
const post = POST as unknown as Handler;

beforeEach(() => {
  delete envProxy.ANTHROPIC_API_KEY;
  _resetAnthropicClientCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
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

// Type-only assert that POST matches the SvelteKit RequestHandler shape.
const _typeCheck: RequestHandler = POST;
void _typeCheck;
