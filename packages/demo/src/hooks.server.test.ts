import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { init } from "./hooks.server";

const { envProxy } = vi.hoisted(() => ({
  envProxy: {} as { ANTHROPIC_API_KEY?: string },
}));

vi.mock("$env/dynamic/private", () => ({
  env: envProxy,
}));

beforeEach(() => {
  delete envProxy.ANTHROPIC_API_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hooks.server init", () => {
  it("warns when ANTHROPIC_API_KEY is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await init();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("ANTHROPIC_API_KEY is not configured"),
    );
  });

  it("warns when ANTHROPIC_API_KEY is empty", async () => {
    envProxy.ANTHROPIC_API_KEY = "";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await init();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the key is set", async () => {
    envProxy.ANTHROPIC_API_KEY = "sk-ant-test";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await init();
    expect(warn).not.toHaveBeenCalled();
  });
});
