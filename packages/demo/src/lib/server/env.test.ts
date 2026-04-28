import { describe, it, expect } from "vitest";
import { MissingEnvError, requireEnv } from "./env";

describe("requireEnv", () => {
  it("returns the value when set", () => {
    expect(requireEnv("FOO", "bar")).toBe("bar");
  });

  it("throws MissingEnvError when undefined", () => {
    expect(() => requireEnv("FOO", undefined)).toThrow(MissingEnvError);
  });

  it("throws MissingEnvError when empty string", () => {
    expect(() => requireEnv("FOO", "")).toThrow(MissingEnvError);
  });

  it("attaches the variable name to the thrown error", () => {
    let caught: unknown;
    try {
      requireEnv("ANTHROPIC_API_KEY", undefined);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MissingEnvError);
    const err = caught as MissingEnvError;
    expect(err.variable).toBe("ANTHROPIC_API_KEY");
    expect(err.code).toBe("missing_env");
    expect(err.message).toContain("ANTHROPIC_API_KEY");
  });
});
