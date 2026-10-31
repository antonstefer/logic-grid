import { describe, it, expect } from "vitest";
import { variables } from "./env";

const { validate } = variables.ANTHROPIC_API_KEY.schema["~standard"];

describe("env variables", () => {
  // SvelteKit refuses to start when a declared variable fails validation, so
  // a missing key has to pass for the demo to run without one.
  it("accepts a missing ANTHROPIC_API_KEY", () => {
    expect(validate(undefined)).toEqual({ value: undefined });
  });

  it("passes ANTHROPIC_API_KEY through unchanged", () => {
    expect(validate("sk-ant-test")).toEqual({ value: "sk-ant-test" });
  });
});
