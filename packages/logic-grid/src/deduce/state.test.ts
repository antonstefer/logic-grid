import { describe, it, expect } from "vitest";
import { describeResult, describeKnown, createState } from "./state";
import { makeGrid } from "../test-helpers";

const defaultGrid = makeGrid({
  size: 3,
  categories: [
    { name: "Name", values: ["Alice", "Bob", "Carol"] },
    { name: "Color", values: ["Red", "Blue", "Green"] },
  ],
});

const seatGrid = makeGrid({
  size: 3,
  categories: [
    { name: "Name", values: ["Alice", "Bob", "Carol"] },
    { name: "Color", values: ["Red", "Blue", "Green"] },
  ],
  positionNoun: ["seat", "seats"],
  positionPreposition: "at",
});

describe("describeResult", () => {
  it("uses default house/in when no custom noun", () => {
    const result = describeResult(
      defaultGrid,
      [{ value: "Alice", position: 0 }],
      [],
    );
    expect(result).toBe("Alice must be in the first house");
  });

  it("uses custom noun and preposition for assignments", () => {
    const result = describeResult(
      seatGrid,
      [{ value: "Alice", position: 0 }],
      [],
    );
    expect(result).toBe("Alice must be at the first seat");
  });

  it("uses custom noun and preposition for eliminations", () => {
    const result = describeResult(
      seatGrid,
      [],
      [{ value: "Bob", position: 1 }],
    );
    expect(result).toBe("Bob can't be at the second seat");
  });

  it("combines assignments and eliminations with custom noun", () => {
    const result = describeResult(
      seatGrid,
      [{ value: "Alice", position: 0 }],
      [{ value: "Bob", position: 2 }],
    );
    expect(result).toBe(
      "Alice must be at the first seat; Bob can't be at the third seat",
    );
  });
});

describe("describeKnown", () => {
  it("uses default house/in for assigned value", () => {
    const state = createState(defaultGrid);
    // Pin Alice to position 0
    state.possible[0][0].clear();
    state.possible[0][0].add(0);
    expect(describeKnown(state, "Alice")).toBe("Alice is in the first house");
  });

  it("uses custom noun and preposition for assigned value", () => {
    const state = createState(seatGrid);
    state.possible[0][0].clear();
    state.possible[0][0].add(0);
    expect(describeKnown(state, "Alice")).toBe("Alice is at the first seat");
  });

  it("uses custom noun for possible positions", () => {
    const state = createState(seatGrid);
    // Restrict Bob to positions 0 and 2
    state.possible[0][1].clear();
    state.possible[0][1].add(0);
    state.possible[0][1].add(2);
    expect(describeKnown(state, "Bob")).toBe(
      "Bob can only be at the first or third seat",
    );
  });
});
