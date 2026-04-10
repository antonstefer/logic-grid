import { describe, it, expect } from "vitest";
import { ordinal } from "./grid-utils";

describe("ordinal", () => {
  it("returns correct ordinals", () => {
    expect(ordinal(0)).toBe("first");
    expect(ordinal(7)).toBe("eighth");
  });

  it("throws for out-of-range positions", () => {
    expect(() => ordinal(8)).toThrow("out of supported range");
    expect(() => ordinal(-1)).toThrow("out of supported range");
  });
});
