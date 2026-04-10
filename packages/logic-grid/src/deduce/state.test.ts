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
    expect(result).toBe("Alice must be in the first house");
  });

  it("describes eliminations", () => {
    const result = describeResult(grid, [], [{ value: "Bob", position: 1 }]);
    expect(result).toBe("Bob can't be in the second house");
  });

  it("combines assignments and eliminations", () => {
    const result = describeResult(
      grid,
      [{ value: "Alice", position: 0 }],
      [{ value: "Bob", position: 2 }],
    );
    expect(result).toBe(
      "Alice must be in the first house; Bob can't be in the third house",
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

describe("describeKnown", () => {
  // makeGrid auto-prepends a House category; Name is now categories[1].
  it("describes assigned value", () => {
    const state = createState(grid);
    state.possible[1][0].clear();
    state.possible[1][0].add(0);
    expect(describeKnown(state, "Alice")).toBe(
      "Alice is in the first house",
    );
  });

  it("describes possible positions", () => {
    const state = createState(grid);
    state.possible[1][1].clear();
    state.possible[1][1].add(0);
    state.possible[1][1].add(2);
    expect(describeKnown(state, "Bob")).toBe(
      "Bob can only be in the first or third house",
    );
  });
});
