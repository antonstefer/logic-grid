import { describe, it, expect } from "vitest";
import { deduce } from ".";
import { generate } from "../generator";
import type { Grid, Constraint } from "../types";

const grid: Grid = {
  size: 4,
  categories: [
    { name: "Name", values: ["Alice", "Bob", "Carol", "Dave"] },
    { name: "Color", values: ["Red", "Blue", "Green", "Yellow"] },
  ],
};

describe("deduce structural techniques", () => {
  it("naked_pair eliminates positions from other values in category", () => {
    // Red and Blue can only be at {0,1} — no other Color can be there
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Red", position: 2 },
      { type: "not_at_position", value: "Red", position: 3 },
      { type: "not_at_position", value: "Blue", position: 2 },
      { type: "not_at_position", value: "Blue", position: 3 },
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

  it("naked_triple eliminates positions from other values in category", () => {
    // Needs 5 values so hidden_single doesn't fire first
    const grid5: Grid = {
      size: 5,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol", "Dave", "Eve"] },
        { name: "Color", values: ["Red", "Blue", "Green", "Yellow", "White"] },
      ],
    };
    // Red, Blue, Green restricted to {0,1,2}; Yellow and White still have all 5
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Red", position: 3 },
      { type: "not_at_position", value: "Red", position: 4 },
      { type: "not_at_position", value: "Blue", position: 3 },
      { type: "not_at_position", value: "Blue", position: 4 },
      { type: "not_at_position", value: "Green", position: 3 },
      { type: "not_at_position", value: "Green", position: 4 },
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
    const grid6: Grid = {
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
    };
    // Red={0,1,2} and Blue={0,1,3} are the ONLY colors reachable at positions 0 or 1
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Red", position: 3 },
      { type: "not_at_position", value: "Red", position: 4 },
      { type: "not_at_position", value: "Red", position: 5 },
      { type: "not_at_position", value: "Blue", position: 2 },
      { type: "not_at_position", value: "Blue", position: 4 },
      { type: "not_at_position", value: "Blue", position: 5 },
      { type: "not_at_position", value: "Green", position: 0 },
      { type: "not_at_position", value: "Green", position: 1 },
      { type: "not_at_position", value: "Yellow", position: 0 },
      { type: "not_at_position", value: "Yellow", position: 1 },
      { type: "not_at_position", value: "White", position: 0 },
      { type: "not_at_position", value: "White", position: 1 },
      { type: "not_at_position", value: "Black", position: 0 },
      { type: "not_at_position", value: "Black", position: 1 },
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
    const grid7: Grid = {
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
    };
    const constraints: Constraint[] = [
      // Red → {0,1,2,3}
      { type: "not_at_position", value: "Red", position: 4 },
      { type: "not_at_position", value: "Red", position: 5 },
      { type: "not_at_position", value: "Red", position: 6 },
      // Blue → {0,1,2,4}
      { type: "not_at_position", value: "Blue", position: 3 },
      { type: "not_at_position", value: "Blue", position: 5 },
      { type: "not_at_position", value: "Blue", position: 6 },
      // Green → {0,1,2,5}
      { type: "not_at_position", value: "Green", position: 3 },
      { type: "not_at_position", value: "Green", position: 4 },
      { type: "not_at_position", value: "Green", position: 6 },
      // Yellow, White, Black, Purple → {3,4,5,6}
      { type: "not_at_position", value: "Yellow", position: 0 },
      { type: "not_at_position", value: "Yellow", position: 1 },
      { type: "not_at_position", value: "Yellow", position: 2 },
      { type: "not_at_position", value: "White", position: 0 },
      { type: "not_at_position", value: "White", position: 1 },
      { type: "not_at_position", value: "White", position: 2 },
      { type: "not_at_position", value: "Black", position: 0 },
      { type: "not_at_position", value: "Black", position: 1 },
      { type: "not_at_position", value: "Black", position: 2 },
      { type: "not_at_position", value: "Purple", position: 0 },
      { type: "not_at_position", value: "Purple", position: 1 },
      { type: "not_at_position", value: "Purple", position: 2 },
    ];
    const result = deduce(constraints, grid7);
    const step = result.steps.find((s) => s.technique === "hidden_triple");
    expect(step).toBeDefined();
    expect(step!.eliminations).toContainEqual({ value: "Red", position: 3 });
    expect(step!.eliminations).toContainEqual({ value: "Blue", position: 4 });
    expect(step!.eliminations).toContainEqual({ value: "Green", position: 5 });
  });

  it("same_house_chain: A linked to M linked to B forces A and B to share positions", () => {
    const constraints: Constraint[] = [
      { type: "same_house", a: "Red", b: "Alice" },
      { type: "same_house", a: "Alice", b: "Blue" },
      { type: "at_position", value: "Red", position: 0 },
    ];
    const result = deduce(constraints, grid);
    const allAssigns = result.steps.flatMap((s) => s.assignments);
    expect(allAssigns).toContainEqual({ value: "Blue", position: 0 });
  });

  it("not_same_house_chain: peer of A shares A's exclusion from not_same_house(A,C)", () => {
    // same_house(Red, Alice): co-located. not_same_house(Red, Bob): different houses.
    // Alice pinned at 0 → Red at 0 → Bob not at 0.
    const constraints: Constraint[] = [
      { type: "same_house", a: "Red", b: "Alice" },
      { type: "not_same_house", a: "Red", b: "Bob" },
      { type: "at_position", value: "Alice", position: 0 },
    ];
    const result = deduce(constraints, grid);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Bob", position: 0 });
  });

  it("contradiction: rules out positions that would lead to an impossible state", () => {
    const puzzle = generate({
      size: 4,
      categories: 4,
      difficulty: "hard",
      seed: 2,
    });
    const result = deduce(puzzle.constraints, puzzle.grid);
    expect(result.complete).toBe(true);
    expect(result.steps.some((s) => s.technique === "contradiction")).toBe(
      true,
    );
  });
});
