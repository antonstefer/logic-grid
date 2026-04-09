import { describe, it, expect } from "vitest";
import { posNoun, posNounPlural, posPrep } from "./grid-utils";
import { makeGrid } from "./test-helpers";

describe("posNoun / posNounPlural / posPrep", () => {
  it("returns configured values", () => {
    const grid = makeGrid({
      size: 3,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
      ],
      positionNoun: ["seat", "seats"],
      positionPreposition: "at",
    });
    expect(posNoun(grid)).toBe("seat");
    expect(posNounPlural(grid)).toBe("seats");
    expect(posPrep(grid)).toBe("at");
  });

  it("throws on empty positionNoun singular", () => {
    const grid = makeGrid({
      size: 3,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
      ],
      positionNoun: ["", "seats"],
    });
    expect(() => posNoun(grid)).toThrow(RangeError);
  });

  it("throws on empty positionNoun plural", () => {
    const grid = makeGrid({
      size: 3,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
      ],
      positionNoun: ["seat", ""],
    });
    expect(() => posNounPlural(grid)).toThrow(RangeError);
  });

  it("throws on empty positionPreposition", () => {
    const grid = makeGrid({
      size: 3,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
      ],
      positionPreposition: "",
    });
    expect(() => posPrep(grid)).toThrow(RangeError);
  });
});
