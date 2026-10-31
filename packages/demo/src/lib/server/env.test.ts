import { describe, it, expect } from "vitest";
import { MissingEnvError } from "./env";

describe("MissingEnvError", () => {
  it("names the missing variable", () => {
    const err = new MissingEnvError("ANTHROPIC_API_KEY");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MissingEnvError");
    expect(err.variable).toBe("ANTHROPIC_API_KEY");
    expect(err.message).toContain("ANTHROPIC_API_KEY");
  });
});
