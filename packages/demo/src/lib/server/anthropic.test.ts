import { describe, it, expect, vi, beforeEach } from "vitest";
import { MissingEnvError } from "./env";
import { getAnthropicClient, _resetAnthropicClientCache } from "./anthropic";
import * as ai from "logic-grid-ai";

const { envProxy } = vi.hoisted(() => ({
  envProxy: {} as { ANTHROPIC_API_KEY?: string },
}));

vi.mock("$env/dynamic/private", () => ({
  env: envProxy,
}));

vi.mock("logic-grid-ai", () => ({
  createAnthropicClient: vi.fn((apiKey: string) => ({
    completeJSON: vi.fn(),
    __key: apiKey,
  })),
}));

const createAnthropicClient = ai.createAnthropicClient as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  delete envProxy.ANTHROPIC_API_KEY;
  createAnthropicClient.mockClear();
  _resetAnthropicClientCache();
});

describe("getAnthropicClient", () => {
  it("throws MissingEnvError when ANTHROPIC_API_KEY is undefined", () => {
    expect(() => getAnthropicClient()).toThrow(MissingEnvError);
  });

  it("throws MissingEnvError when ANTHROPIC_API_KEY is empty", () => {
    envProxy.ANTHROPIC_API_KEY = "";
    expect(() => getAnthropicClient()).toThrow(MissingEnvError);
  });

  it("creates a client when key is set", () => {
    envProxy.ANTHROPIC_API_KEY = "sk-ant-test";
    const client = getAnthropicClient();
    expect(client).toBeDefined();
    expect(createAnthropicClient).toHaveBeenCalledWith("sk-ant-test");
  });

  it("caches the client across calls with the same key", () => {
    envProxy.ANTHROPIC_API_KEY = "sk-ant-test";
    const c1 = getAnthropicClient();
    const c2 = getAnthropicClient();
    expect(c1).toBe(c2);
    expect(createAnthropicClient).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the client when the key rotates", () => {
    envProxy.ANTHROPIC_API_KEY = "sk-ant-old";
    const c1 = getAnthropicClient();
    envProxy.ANTHROPIC_API_KEY = "sk-ant-new";
    const c2 = getAnthropicClient();
    expect(c1).not.toBe(c2);
    expect(createAnthropicClient).toHaveBeenCalledTimes(2);
    expect(createAnthropicClient).toHaveBeenLastCalledWith("sk-ant-new");
  });
});
