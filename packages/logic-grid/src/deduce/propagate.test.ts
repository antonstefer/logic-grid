import { describe, it, expect } from "vitest";
import { propagateToFixpoint } from "./propagate";
import { createState, getPossible } from "./state";
import { makeGrid } from "../test-helpers";
import type { Constraint } from "../types";

const grid4 = makeGrid({
  size: 4,
  categories: [
    { name: "Name", values: ["Alice", "Bob", "Carol", "Dave"] },
    { name: "Color", values: ["Red", "Blue", "Green", "Yellow"] },
  ],
});

const grid5 = makeGrid({
  size: 5,
  categories: [
    { name: "Name", values: ["Alice", "Bob", "Carol", "Dave", "Eve"] },
    { name: "Color", values: ["Red", "Blue", "Green", "Yellow", "White"] },
  ],
});

const grid7 = makeGrid({
  size: 7,
  categories: [
    { name: "Name", values: ["A", "B", "C", "D", "E", "F", "G"] },
    {
      name: "Color",
      values: ["Red", "Blue", "Green", "Yellow", "White", "Black", "Purple"],
    },
  ],
});

describe("propagateToFixpoint", () => {
  it("same_position pins value from fresh state", () => {
    const state = createState(grid4);
    propagateToFixpoint(state, [
      { type: "same_position", a: "Red", b: "first" },
    ]);
    expect([...getPossible(state, "Red")]).toEqual([0]);
  });

  it("same_position propagates via chain links", () => {
    // Red pinned at 0, same_position(Red, Alice) + same_position(Red, Cat)
    // → both Alice and Cat should be pinned at 0 via chain propagation.
    const grid3cat = makeGrid({
      size: 4,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol", "Dave"] },
        { name: "Color", values: ["Red", "Blue", "Green", "Yellow"] },
        { name: "Pet", values: ["Cat", "Dog", "Fish", "Bird"] },
      ],
    });
    const state = createState(grid3cat);
    propagateToFixpoint(state, [
      { type: "same_position", a: "Red", b: "first" },
      { type: "same_position", a: "Red", b: "Alice" },
      { type: "same_position", a: "Red", b: "Cat" },
    ]);
    expect([...getPossible(state, "Alice")]).toEqual([0]);
    expect([...getPossible(state, "Cat")]).toEqual([0]);
  });

  it("not_same_position removes position from fresh state", () => {
    const state = createState(grid4);
    propagateToFixpoint(state, [
      { type: "not_same_position", a: "Red", b: "first" },
    ]);
    expect(getPossible(state, "Red").has(0)).toBe(false);
    expect(getPossible(state, "Red").size).toBe(3);
  });

  it("not_next_to eliminates posA+1 from b when a is pinned", () => {
    // Red pinned at 1 (posA=1 < 3). Alice loses posA+1=2.
    const state = createState(grid4);
    propagateToFixpoint(state, [
      { type: "same_position", a: "Red", b: "second" },
      { type: "not_next_to", a: "Red", b: "Alice", axis: "House" },
    ]);
    expect(getPossible(state, "Alice").has(2)).toBe(false);
  });

  it("not_next_to eliminates posB-1 from a when b is pinned", () => {
    // Alice pinned at 2 (posB=2 > 0). Red loses posB-1=1.
    const state = createState(grid4);
    propagateToFixpoint(state, [
      { type: "same_position", a: "Alice", b: "third" },
      { type: "not_next_to", a: "Red", b: "Alice", axis: "House" },
    ]);
    expect(getPossible(state, "Red").has(1)).toBe(false);
  });

  it("not_next_to arc-consistency eliminates b position when all a positions are adjacent", () => {
    // Red restricted to {0}. Alice at 1: every Red position (just 0) is adjacent to 1.
    // So Alice loses 1 via arc-consistency (pb loop).
    const state = createState(grid4);
    const constraints: Constraint[] = [
      { type: "not_same_position", a: "Red", b: "second" },
      { type: "not_same_position", a: "Red", b: "third" },
      { type: "not_same_position", a: "Red", b: "fourth" },
      { type: "not_next_to", a: "Red", b: "Alice", axis: "House" },
    ];
    propagateToFixpoint(state, constraints);
    expect(getPossible(state, "Alice").has(1)).toBe(false);
  });

  it("not_next_to arc-consistency eliminates b when all a positions are adjacent (pb loop)", () => {
    // Red={0,2} (not pinned). Alice at 1: every Red position (0,2) is adjacent to 1.
    // So Alice loses 1 via the pb arc-consistency loop.
    const state = createState(grid4);
    propagateToFixpoint(state, [
      { type: "not_same_position", a: "Red", b: "second" },
      { type: "not_same_position", a: "Red", b: "fourth" },
      { type: "not_next_to", a: "Red", b: "Alice", axis: "House" },
    ]);
    expect(getPossible(state, "Alice").has(1)).toBe(false);
  });

  it("not_between eliminates middle when both outers are pinned", () => {
    // Red=0, Blue=3 → Alice at 1 and 2 are strictly between → eliminated.
    const state = createState(grid4);
    propagateToFixpoint(state, [
      { type: "same_position", a: "Red", b: "first" },
      { type: "same_position", a: "Blue", b: "fourth" },
      {
        type: "not_between",
        outer1: "Red",
        middle: "Alice",
        outer2: "Blue",
        axis: "House",
      },
    ]);
    expect(getPossible(state, "Alice").has(1)).toBe(false);
    expect(getPossible(state, "Alice").has(2)).toBe(false);
  });

  it("not_between eliminates middle with one outer pinned", () => {
    // Red=0, Blue restricted to {2,3} (min=2). Alice at 1: Red(0)<1 AND min(Blue)=2>1.
    const state = createState(grid4);
    propagateToFixpoint(state, [
      { type: "same_position", a: "Red", b: "first" },
      { type: "not_same_position", a: "Blue", b: "second" },
      {
        type: "not_between",
        outer1: "Red",
        middle: "Alice",
        outer2: "Blue",
        axis: "House",
      },
    ]);
    expect(getPossible(state, "Alice").has(1)).toBe(false);
  });

  it("not_between eliminates middle when neither outer is pinned", () => {
    // Red={0,1}, Blue={3,4}. Alice at 2: all Red < 2 and all Blue > 2 → eliminated.
    const state = createState(grid5);
    propagateToFixpoint(state, [
      { type: "not_same_position", a: "Red", b: "third" },
      { type: "not_same_position", a: "Red", b: "fourth" },
      { type: "not_same_position", a: "Red", b: "fifth" },
      { type: "not_same_position", a: "Blue", b: "first" },
      { type: "not_same_position", a: "Blue", b: "second" },
      { type: "not_same_position", a: "Blue", b: "third" },
      {
        type: "not_between",
        outer1: "Red",
        middle: "Alice",
        outer2: "Blue",
        axis: "House",
      },
    ]);
    expect(getPossible(state, "Alice").has(2)).toBe(false);
  });

  it("silentNakedTriples restricts fourth value when three share three positions", () => {
    // Red, Blue, Green each restricted to {0,1,2} — naked triple.
    // Yellow and White must be at {3,4} and cannot occupy {0,1,2}.
    const state = createState(grid5);
    propagateToFixpoint(state, [
      { type: "not_same_position", a: "Red", b: "fourth" },
      { type: "not_same_position", a: "Red", b: "fifth" },
      { type: "not_same_position", a: "Blue", b: "fourth" },
      { type: "not_same_position", a: "Blue", b: "fifth" },
      { type: "not_same_position", a: "Green", b: "fourth" },
      { type: "not_same_position", a: "Green", b: "fifth" },
    ]);
    expect(getPossible(state, "Yellow").has(0)).toBe(false);
    expect(getPossible(state, "Yellow").has(1)).toBe(false);
    expect(getPossible(state, "Yellow").has(2)).toBe(false);
  });

  it("silentHiddenTriples restricts three values exclusively reachable at three positions", () => {
    // Yellow, White, Black, Purple excluded from {0,1,2}.
    // Red={0..3}, Blue={0,1,2,4}, Green={0,1,2,5} each have one extra.
    // silentHiddenTriples fires: positions {0,1,2} only reachable by Red/Blue/Green
    // → Red loses 3, Blue loses 4, Green loses 5.
    const state = createState(grid7);
    const constraints: Constraint[] = [
      { type: "not_same_position", a: "Red", b: "fifth" },
      { type: "not_same_position", a: "Red", b: "sixth" },
      { type: "not_same_position", a: "Red", b: "seventh" },
      { type: "not_same_position", a: "Blue", b: "fourth" },
      { type: "not_same_position", a: "Blue", b: "sixth" },
      { type: "not_same_position", a: "Blue", b: "seventh" },
      { type: "not_same_position", a: "Green", b: "fourth" },
      { type: "not_same_position", a: "Green", b: "fifth" },
      { type: "not_same_position", a: "Green", b: "seventh" },
      { type: "not_same_position", a: "Yellow", b: "first" },
      { type: "not_same_position", a: "Yellow", b: "second" },
      { type: "not_same_position", a: "Yellow", b: "third" },
      { type: "not_same_position", a: "White", b: "first" },
      { type: "not_same_position", a: "White", b: "second" },
      { type: "not_same_position", a: "White", b: "third" },
      { type: "not_same_position", a: "Black", b: "first" },
      { type: "not_same_position", a: "Black", b: "second" },
      { type: "not_same_position", a: "Black", b: "third" },
      { type: "not_same_position", a: "Purple", b: "first" },
      { type: "not_same_position", a: "Purple", b: "second" },
      { type: "not_same_position", a: "Purple", b: "third" },
    ];
    propagateToFixpoint(state, constraints);
    expect(getPossible(state, "Red").has(3)).toBe(false);
    expect(getPossible(state, "Blue").has(4)).toBe(false);
    expect(getPossible(state, "Green").has(5)).toBe(false);
  });

  it("returns false on contradiction", () => {
    const state = createState(grid4);
    const result = propagateToFixpoint(state, [
      { type: "not_same_position", a: "Red", b: "first" },
      { type: "not_same_position", a: "Red", b: "second" },
      { type: "not_same_position", a: "Red", b: "third" },
      { type: "not_same_position", a: "Red", b: "fourth" },
    ]);
    expect(result).toBe(false);
  });
});
