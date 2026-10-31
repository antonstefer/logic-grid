import { describe, it, expect, vi, afterEach } from "vitest";
import { importWithApiKey } from "./test-helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hooks.server init", () => {
  it("warns when ANTHROPIC_API_KEY is unset", async () => {
    const { init } = await importWithApiKey(
      undefined,
      () => import("./hooks.server"),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await init();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("ANTHROPIC_API_KEY is not configured"),
    );
  });

  it("stays quiet when the key is set", async () => {
    const { init } = await importWithApiKey(
      "sk-ant-test",
      () => import("./hooks.server"),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await init();
    expect(warn).not.toHaveBeenCalled();
  });
});
