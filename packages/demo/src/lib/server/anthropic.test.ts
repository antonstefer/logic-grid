import { describe, it, expect, vi, beforeEach } from "vitest";
import { importWithApiKey } from "../../test-helpers";

const { createAnthropicClient } = vi.hoisted(() => ({
  createAnthropicClient: vi.fn((apiKey: string) => ({
    completeJSON: vi.fn(),
    __key: apiKey,
  })),
}));

vi.mock("logic-grid-ai", () => ({ createAnthropicClient }));

beforeEach(() => {
  createAnthropicClient.mockClear();
});

describe("getAnthropicClient", () => {
  it("throws MissingEnvError when ANTHROPIC_API_KEY is unset", async () => {
    // Import the error from the same fresh module graph as the client.
    const [{ getAnthropicClient }, { MissingEnvError }] =
      await importWithApiKey(undefined, () =>
        Promise.all([import("./anthropic"), import("./env")]),
      );
    expect(() => getAnthropicClient()).toThrow(MissingEnvError);
  });

  it("creates a client from the key", async () => {
    const { getAnthropicClient } = await importWithApiKey(
      "sk-ant-test",
      () => import("./anthropic"),
    );
    expect(getAnthropicClient()).toBeDefined();
    expect(createAnthropicClient).toHaveBeenCalledWith("sk-ant-test");
  });

  it("reuses the client across calls", async () => {
    const { getAnthropicClient } = await importWithApiKey(
      "sk-ant-test",
      () => import("./anthropic"),
    );
    expect(getAnthropicClient()).toBe(getAnthropicClient());
    expect(createAnthropicClient).toHaveBeenCalledTimes(1);
  });
});
