import { describe, it, expect } from "vitest";
import {
  findPositionCategory,
  positionLabel,
  posNoun,
  posNounPlural,
  posPrep,
} from "./grid-utils";
import { makeGrid } from "./test-helpers";
import { generate } from "./generator";

describe("findPositionCategory", () => {
  it("returns undefined when no position category", () => {
    const puzzle = generate({ size: 3, categories: 3, seed: 1 });
    expect(findPositionCategory(puzzle.grid)).toBeUndefined();
  });

  it("returns the position category", () => {
    const puzzle = generate({
      size: 3,
      seed: 1,
      categoryNames: [
        { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
        {
          name: "Time",
          values: ["7am", "8am", "9am"],
          noun: "slot",
          verb: ["is at", "is not at"],
          isPosition: true,
        },
        {
          name: "Color",
          values: ["Red", "Blue", "Green"],
          noun: "color",
          verb: ["wears", "does not wear"],
        },
      ],
    });
    const cat = findPositionCategory(puzzle.grid);
    expect(cat?.name).toBe("Time");
  });
});

describe("positionLabel", () => {
  it("returns position category value when present", () => {
    const puzzle = generate({
      size: 3,
      seed: 1,
      categoryNames: [
        { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
        {
          name: "Time",
          values: ["7am", "8am", "9am"],
          noun: "slot",
          verb: ["is at", "is not at"],
          isPosition: true,
        },
        {
          name: "Color",
          values: ["Red", "Blue", "Green"],
          noun: "color",
          verb: ["wears", "does not wear"],
        },
      ],
    });
    expect(positionLabel(0, puzzle.grid)).toBe("7am");
    expect(positionLabel(2, puzzle.grid)).toBe("9am");
  });

  it("returns ordinal house labels for classic grids", () => {
    const puzzle = generate({ size: 3, categories: 3, seed: 1 });
    expect(positionLabel(0, puzzle.grid)).toBe("the first house");
    expect(positionLabel(2, puzzle.grid)).toBe("the third house");
  });

  it("uses custom positionNoun", () => {
    const puzzle = generate({
      size: 3,
      categories: 3,
      seed: 1,
      positionNoun: ["seat", "seats"],
    });
    expect(positionLabel(1, puzzle.grid)).toBe("the second seat");
  });
});

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
