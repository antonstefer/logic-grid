import { describe, it, expect } from "vitest";
import { findPositionCategory, positionLabel } from "./grid-utils";
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
          isPosition: true,
        },
        { name: "Color", values: ["Red", "Blue", "Green"] },
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
          isPosition: true,
        },
        { name: "Color", values: ["Red", "Blue", "Green"] },
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
