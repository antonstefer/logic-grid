import { describe, it, expect } from "vitest";
import { deduce } from ".";
import { makeGrid } from "../test-helpers";
import type { Constraint } from "../types";

const grid = makeGrid({
  size: 4,
  categories: [
    { name: "Name", values: ["Alice", "Bob", "Carol", "Dave"] },
    { name: "Color", values: ["Red", "Blue", "Green", "Yellow"] },
  ],
});

describe("deduce structural techniques", () => {
  it("naked_single eliminates a pinned value's position from its category peers", () => {
    // Eliminate Red from 1,2,3 → Red forced to 0.
    // Naked_single then removes 0 from all other Colors.
    const constraints: Constraint[] = [
      { type: "not_same_position", a: "Red", b: "second" },
      { type: "not_same_position", a: "Red", b: "third" },
      { type: "not_same_position", a: "Red", b: "fourth" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "naked_single");
    expect(step).toBeDefined();
    expect(step!.eliminations).toContainEqual({ value: "Blue", position: 0 });
    expect(step!.eliminations).toContainEqual({ value: "Green", position: 0 });
    expect(step!.eliminations).toContainEqual({ value: "Yellow", position: 0 });
  });

  it("hidden_single assigns the only remaining candidate for a position", () => {
    // Red, Blue, Green excluded from position 3 → Yellow must be there.
    const constraints: Constraint[] = [
      { type: "not_same_position", a: "Red", b: "fourth" },
      { type: "not_same_position", a: "Blue", b: "fourth" },
      { type: "not_same_position", a: "Green", b: "fourth" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "hidden_single");
    expect(step).toBeDefined();
    expect(step!.assignments).toContainEqual({ value: "Yellow", position: 3 });
  });

  it("naked_pair eliminates positions from other values in category", () => {
    // Red and Blue can only be at {0,1} — no other Color can be there
    const constraints: Constraint[] = [
      { type: "not_same_position", a: "Red", b: "third" },
      { type: "not_same_position", a: "Red", b: "fourth" },
      { type: "not_same_position", a: "Blue", b: "third" },
      { type: "not_same_position", a: "Blue", b: "fourth" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "naked_pair");
    expect(step).toBeDefined();
    const elims = step!.eliminations;
    expect(elims.some((e) => e.value === "Green" && e.position === 0)).toBe(
      true,
    );
    expect(elims.some((e) => e.value === "Yellow" && e.position === 1)).toBe(
      true,
    );
  });

  it("naked_triple with positionAdjective category flips subject phrasing", () => {
    // Color has positionAdjective so subjectForm uses bare adjective.
    // Also tests the lowercase=false branch of subjectForm (values preserved).
    const grid5 = makeGrid({
      size: 5,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol", "Dave", "Eve"] },
        {
          name: "Color",
          values: ["Red", "Blue", "Green", "Yellow", "White"],
          noun: "house",
          verb: ["lives in the", "does not live in the"] as [string, string],
          valueSuffix: "house",
          positionAdjective: ["is", "is not"] as [string, string],
          subjectPriority: -1,
          // lowercase: false (default) — exercises that branch of subjectForm
        },
      ],
    });
    const constraints: Constraint[] = [
      { type: "not_same_position", a: "Red", b: "fourth" },
      { type: "not_same_position", a: "Red", b: "fifth" },
      { type: "not_same_position", a: "Blue", b: "fourth" },
      { type: "not_same_position", a: "Blue", b: "fifth" },
      { type: "not_same_position", a: "Green", b: "fourth" },
      { type: "not_same_position", a: "Green", b: "fifth" },
    ];
    const result = deduce(constraints, grid5);
    const step = result.steps.find((s) => s.technique === "naked_triple");
    expect(step).toBeDefined();
    // PA flip: subjects are bare capitalized adjectives, no "in" prep.
    expect(step!.explanation).toMatch(/^Red, Blue, and Green can only be the/);
    expect(step!.explanation).not.toContain("in the");
  });

  it("naked_triple eliminates positions from other values in category", () => {
    // Needs 5 values so hidden_single doesn't fire first
    const grid5 = makeGrid({
      size: 5,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol", "Dave", "Eve"] },
        { name: "Color", values: ["Red", "Blue", "Green", "Yellow", "White"] },
      ],
    });
    // Red, Blue, Green restricted to {0,1,2}; Yellow and White still have all 5
    const constraints: Constraint[] = [
      { type: "not_same_position", a: "Red", b: "fourth" },
      { type: "not_same_position", a: "Red", b: "fifth" },
      { type: "not_same_position", a: "Blue", b: "fourth" },
      { type: "not_same_position", a: "Blue", b: "fifth" },
      { type: "not_same_position", a: "Green", b: "fourth" },
      { type: "not_same_position", a: "Green", b: "fifth" },
    ];
    const result = deduce(constraints, grid5);
    const step = result.steps.find((s) => s.technique === "naked_triple");
    expect(step).toBeDefined();
    const elims = step!.eliminations;
    expect(elims.some((e) => e.value === "Yellow" && e.position <= 2)).toBe(
      true,
    );
    expect(elims.some((e) => e.value === "White" && e.position <= 2)).toBe(
      true,
    );
  });

  it("hidden_pair restricts the two values exclusively reachable at two positions", () => {
    const grid6 = makeGrid({
      size: 6,
      categories: [
        {
          name: "Name",
          values: ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank"],
        },
        {
          name: "Color",
          values: ["Red", "Blue", "Green", "Yellow", "White", "Black"],
        },
      ],
    });
    // Red={0,1,2} and Blue={0,1,3} are the ONLY colors reachable at positions 0 or 1
    const constraints: Constraint[] = [
      { type: "not_same_position", a: "Red", b: "fourth" },
      { type: "not_same_position", a: "Red", b: "fifth" },
      { type: "not_same_position", a: "Red", b: "sixth" },
      { type: "not_same_position", a: "Blue", b: "third" },
      { type: "not_same_position", a: "Blue", b: "fifth" },
      { type: "not_same_position", a: "Blue", b: "sixth" },
      { type: "not_same_position", a: "Green", b: "first" },
      { type: "not_same_position", a: "Green", b: "second" },
      { type: "not_same_position", a: "Yellow", b: "first" },
      { type: "not_same_position", a: "Yellow", b: "second" },
      { type: "not_same_position", a: "White", b: "first" },
      { type: "not_same_position", a: "White", b: "second" },
      { type: "not_same_position", a: "Black", b: "first" },
      { type: "not_same_position", a: "Black", b: "second" },
    ];
    const result = deduce(constraints, grid6);
    const step = result.steps.find((s) => s.technique === "hidden_pair");
    expect(step).toBeDefined();
    // Red (was {0,1,2}) loses position 2; Blue (was {0,1,3}) loses position 3
    expect(step!.eliminations).toContainEqual({ value: "Red", position: 2 });
    expect(step!.eliminations).toContainEqual({ value: "Blue", position: 3 });
  });

  it("hidden_triple restricts the three values exclusively reachable at three positions", () => {
    // 7-size grid: Red/Blue/Green each have one extra position outside {0,1,2},
    // while Yellow/White/Black/Purple are excluded from {0,1,2}.
    // Naked_triple doesn't fire first because no value has size ≤ 3.
    const grid7 = makeGrid({
      size: 7,
      categories: [
        { name: "Name", values: ["A", "B", "C", "D", "E", "F", "G"] },
        {
          name: "Color",
          values: [
            "Red",
            "Blue",
            "Green",
            "Yellow",
            "White",
            "Black",
            "Purple",
          ],
        },
      ],
    });
    const constraints: Constraint[] = [
      // Red → {0,1,2,3}
      { type: "not_same_position", a: "Red", b: "fifth" },
      { type: "not_same_position", a: "Red", b: "sixth" },
      { type: "not_same_position", a: "Red", b: "seventh" },
      // Blue → {0,1,2,4}
      { type: "not_same_position", a: "Blue", b: "fourth" },
      { type: "not_same_position", a: "Blue", b: "sixth" },
      { type: "not_same_position", a: "Blue", b: "seventh" },
      // Green → {0,1,2,5}
      { type: "not_same_position", a: "Green", b: "fourth" },
      { type: "not_same_position", a: "Green", b: "fifth" },
      { type: "not_same_position", a: "Green", b: "seventh" },
      // Yellow, White, Black, Purple → {3,4,5,6}
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
    const result = deduce(constraints, grid7);
    const step = result.steps.find((s) => s.technique === "hidden_triple");
    expect(step).toBeDefined();
    expect(step!.eliminations).toContainEqual({ value: "Red", position: 3 });
    expect(step!.eliminations).toContainEqual({ value: "Blue", position: 4 });
    expect(step!.eliminations).toContainEqual({ value: "Green", position: 5 });
  });

  it("same_position transitivity: A linked to M linked to B all reach same position", () => {
    // same_position(Red, Alice) and same_position(Alice, Blue) handled by the iterative
    // constraint loop — no dedicated chain step needed.
    const constraints: Constraint[] = [
      { type: "same_position", a: "Red", b: "Alice" },
      { type: "same_position", a: "Alice", b: "Blue" },
      { type: "same_position", a: "Red", b: "first" },
    ];
    const result = deduce(constraints, grid);
    const allAssigns = result.steps.flatMap((s) => s.assignments);
    expect(allAssigns).toContainEqual({ value: "Blue", position: 0 });
  });

  it("not_same_position with same_position peer: exclusion propagates via direct constraints", () => {
    // same_position(Red, Alice): co-located. not_same_position(Red, Bob): different houses.
    // Alice pinned at 0 → Red at 0 (via same_position) → Bob not at 0 (via not_same_position).
    const constraints: Constraint[] = [
      { type: "same_position", a: "Red", b: "Alice" },
      { type: "not_same_position", a: "Red", b: "Bob" },
      { type: "same_position", a: "Alice", b: "first" },
    ];
    const result = deduce(constraints, grid);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Bob", position: 0 });
  });

  it("contradiction: rules out positions that would lead to an impossible state", () => {
    // Fixed constraint set that requires contradiction (3x3 grid)
    const small = makeGrid({
      size: 3,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol"] },
        { name: "Color", values: ["Red", "Blue", "Green"] },
        { name: "Pet", values: ["Cat", "Dog", "Fish"] },
      ],
    });
    const constraints: Constraint[] = [
      { type: "not_next_to", a: "Bob", b: "Green", axis: "House" },
      { type: "left_of", a: "Carol", b: "Blue", axis: "House" },
      { type: "same_position", a: "Carol", b: "Fish" },
      { type: "same_position", a: "Red", b: "Dog" },
    ];
    const result = deduce(constraints, small);
    expect(result.complete).toBe(true);
    expect(result.steps.some((s) => s.technique === "contradiction")).toBe(
      true,
    );
  });
});
