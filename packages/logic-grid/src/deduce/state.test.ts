import { describe, it, expect } from "vitest";
import { describeResult, describeKnown, createState } from "./state";
import { makeGrid } from "../test-helpers";

const grid = makeGrid({
  size: 3,
  categories: [
    { name: "Name", values: ["Alice", "Bob", "Carol"] },
    { name: "Color", values: ["Red", "Blue", "Green"] },
  ],
});

describe("describeResult", () => {
  it("describes assignments", () => {
    const result = describeResult(grid, [{ value: "Alice", position: 0 }], []);
    expect(result).toBe("Alice lives in the first house");
  });

  it("describes eliminations", () => {
    const result = describeResult(grid, [], [{ value: "Bob", position: 1 }]);
    expect(result).toBe("Bob does not live in the second house");
  });

  it("combines assignments and eliminations", () => {
    const result = describeResult(
      grid,
      [{ value: "Alice", position: 0 }],
      [{ value: "Bob", position: 2 }],
    );
    expect(result).toBe(
      "Alice lives in the first house; Bob does not live in the third house",
    );
  });
});

describe("createState invariant", () => {
  it("throws when grid has no ordered category", () => {
    const bare = {
      size: 3,
      categories: [
        { name: "A", values: ["a1", "a2", "a3"] },
        { name: "B", values: ["b1", "b2", "b3"] },
      ],
    };
    expect(() => createState(bare)).toThrow("no ordered category");
  });
});

describe("axisAnchor fallback", () => {
  it("uses 'position' when the ordered axis has neither valueSuffix nor noun", () => {
    const noAnchorGrid = {
      size: 2,
      categories: [
        {
          name: "Idx",
          values: ["A", "B"],
          ordered: true as const,
          verb: ["is", "is not"] as [string, string],
          orderingPhrases: {
            comparators: {
              before: ["is before", "is after"] as [string, string],
              left_of: ["is left of", "is right of"] as [string, string],
              next_to: "is next to",
              not_next_to: "is not next to",
              between: "is between",
              not_between: "is not between",
              exact_distance: "is exactly",
            },
          },
        },
        { name: "X", values: ["x1", "x2"] },
      ],
    };
    const state = createState(noAnchorGrid);
    expect(state.terms.axisAnchor).toBe("position");
  });
});

describe("describeKnown", () => {
  // makeGrid auto-prepends a House category; Name is now categories[1].
  it("describes assigned value", () => {
    const state = createState(grid);
    state.possible[1][0].clear();
    state.possible[1][0].add(0);
    expect(describeKnown(state, "Alice")).toBe(
      "Alice lives in the first house",
    );
  });

  it("describes possible positions", () => {
    const state = createState(grid);
    state.possible[1][1].clear();
    state.possible[1][1].add(0);
    state.possible[1][1].add(2);
    expect(describeKnown(state, "Bob")).toBe(
      "Bob lives in the first or third house",
    );
  });
});
