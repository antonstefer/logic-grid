import { describe, it, expect } from "vitest";
import {
  findPositionCategory,
  positionLabel,
  getDistancePairs,
} from "./grid-utils";
import type { Grid } from "./types";

const standardGrid: Grid = {
  size: 3,
  categories: [
    { name: "Name", values: ["Alice", "Bob", "Carol"] },
    { name: "Color", values: ["Red", "Blue", "Green"] },
  ],
};

const posGrid: Grid = {
  size: 4,
  categories: [
    { name: "Name", values: ["Alice", "Bob", "Carol", "Dan"], noun: "" },
    {
      name: "Return",
      values: ["6%", "7%", "8%", "9%"],
      noun: "fund",
      isPosition: true,
      numericValues: [6, 7, 8, 9],
    },
  ],
};

describe("findPositionCategory", () => {
  it("returns undefined when no position category", () => {
    expect(findPositionCategory(standardGrid)).toBeUndefined();
  });

  it("returns the position category", () => {
    const cat = findPositionCategory(posGrid);
    expect(cat?.name).toBe("Return");
  });
});

describe("positionLabel", () => {
  it("returns position category value when present", () => {
    expect(positionLabel(0, posGrid)).toBe("6%");
    expect(positionLabel(3, posGrid)).toBe("9%");
  });

  it("falls back to ordinal house for standard grids", () => {
    expect(positionLabel(0, standardGrid)).toBe("the first house");
    expect(positionLabel(2, standardGrid)).toBe("the third house");
  });

  it("uses custom positionNoun in fallback", () => {
    const custom: Grid = {
      ...standardGrid,
      positionNoun: ["seat", "seats"],
    };
    expect(positionLabel(1, custom)).toBe("the second seat");
  });
});

describe("getDistancePairs", () => {
  it("returns position-based pairs when no numericValues", () => {
    const pairs = getDistancePairs(standardGrid, 1);
    expect(pairs).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it("returns position-based pairs for distance 2", () => {
    const pairs = getDistancePairs(standardGrid, 2);
    expect(pairs).toEqual([[0, 2]]);
  });

  it("returns empty for impossible distance", () => {
    const pairs = getDistancePairs(standardGrid, 5);
    expect(pairs).toEqual([]);
  });

  it("uses numericValues when present (equidistant)", () => {
    // numericValues [6,7,8,9], distance 2 → |6-8|=2, |7-9|=2
    const pairs = getDistancePairs(posGrid, 2);
    expect(pairs).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });

  it("uses numericValues for non-equidistant values", () => {
    const nonEq: Grid = {
      size: 4,
      categories: [
        {
          name: "Year",
          values: ["1972", "1983", "1997", "2005"],
          isPosition: true,
          numericValues: [1972, 1983, 1997, 2005],
        },
      ],
    };
    // distance=11 → |1972-1983|=11
    expect(getDistancePairs(nonEq, 11)).toEqual([[0, 1]]);
    // distance=14 → |1983-1997|=14
    expect(getDistancePairs(nonEq, 14)).toEqual([[1, 2]]);
    // distance=25 → |1972-1997|=25
    expect(getDistancePairs(nonEq, 25)).toEqual([[0, 2]]);
    // distance=100 → no pairs
    expect(getDistancePairs(nonEq, 100)).toEqual([]);
  });
});
