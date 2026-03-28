import { describe, it, expect } from "vitest";
import { deduce } from ".";
import type { Grid, Constraint } from "../types";

const grid: Grid = {
  size: 4,
  categories: [
    { name: "Name", values: ["Alice", "Bob", "Carol", "Dave"] },
    { name: "Color", values: ["Red", "Blue", "Green", "Yellow"] },
  ],
};

describe("deduce constraint types", () => {
  it("direct: at_position pins the value", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "direct");
    expect(step).toBeDefined();
    expect(step!.assignments).toContainEqual({ value: "Red", position: 0 });
  });

  it("elimination: not_at_position removes position and assigns when only one left", () => {
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Alice", position: 0 },
      { type: "not_at_position", value: "Alice", position: 1 },
      { type: "not_at_position", value: "Alice", position: 2 },
    ];
    const result = deduce(constraints, grid);
    const elims = result.steps.filter((s) => s.technique === "elimination");
    expect(elims.length).toBeGreaterThan(0);
    const assigns = result.steps.flatMap((s) => s.assignments);
    expect(assigns).toContainEqual({ value: "Alice", position: 3 });
  });

  it("same_house intersects possible positions", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "same_house", a: "Red", b: "Alice" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "same_house");
    expect(step).toBeDefined();
    expect(step!.assignments).toContainEqual({ value: "Alice", position: 0 });
  });

  it("not_same_house eliminates when one value is pinned", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "not_same_house", a: "Red", b: "Alice" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "not_same_house");
    expect(step).toBeDefined();
    expect(step!.eliminations).toContainEqual({ value: "Alice", position: 0 });
  });

  it("next_to constrains to adjacent positions", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "next_to", a: "Red", b: "Alice" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "next_to");
    expect(step).toBeDefined();
    // Alice can only be at position 1 (adjacent to 0) — eliminates 0, 2, 3
    expect(step!.eliminations.filter((e) => e.value === "Alice").length).toBe(
      3,
    );
  });

  it("not_next_to eliminates adjacent positions when one is pinned", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 1 },
      { type: "not_next_to", a: "Red", b: "Alice" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "not_next_to");
    expect(step).toBeDefined();
    expect(step!.eliminations).toContainEqual({ value: "Alice", position: 0 });
    expect(step!.eliminations).toContainEqual({ value: "Alice", position: 2 });
  });

  it("not_next_to arc-consistency: eliminates position when every other-value position is adjacent", () => {
    // Blue can only be at {0,2} — both adjacent to position 1.
    // So Red cannot be at position 1 (no valid non-adjacent position exists for Blue).
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Blue", position: 1 },
      { type: "not_at_position", value: "Blue", position: 3 },
      { type: "not_next_to", a: "Red", b: "Blue" },
    ];
    const result = deduce(constraints, grid);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Red", position: 1 });
  });

  it("left_of pins b to a+1 when a is pinned", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 1 },
      { type: "left_of", a: "Red", b: "Alice" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "left_of");
    expect(step).toBeDefined();
    expect(step!.assignments).toContainEqual({ value: "Alice", position: 2 });
  });

  it("left_of arc-consistency: eliminates positions with no valid neighbour even when neither is pinned", () => {
    // Alice can only be at {2,3} — so Red (directly left) can only be at {1,2}.
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Alice", position: 0 },
      { type: "not_at_position", value: "Alice", position: 1 },
      { type: "left_of", a: "Red", b: "Alice" },
    ];
    const result = deduce(constraints, grid);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Red", position: 3 });
    expect(allElims).toContainEqual({ value: "Red", position: 0 });
  });

  it("before eliminates positions", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 2 },
      { type: "before", a: "Red", b: "Alice" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "before");
    expect(step).toBeDefined();
    // Alice must be at position 3 (only position after 2)
    expect(step!.assignments).toContainEqual({ value: "Alice", position: 3 });
  });

  it("exact_distance constrains positions", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "exact_distance", a: "Red", b: "Alice", distance: 2 },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "exact_distance");
    expect(step).toBeDefined();
    expect(step!.assignments).toContainEqual({ value: "Alice", position: 2 });
  });

  it("between constrains middle position", () => {
    const grid5: Grid = {
      size: 5,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol", "Dave", "Eve"] },
        { name: "Color", values: ["Red", "Blue", "Green", "Yellow", "White"] },
      ],
    };
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "at_position", value: "Blue", position: 4 },
      { type: "between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid5);
    const step = result.steps.find((s) => s.technique === "between");
    expect(step).toBeDefined();
    // Alice must be at positions 1, 2, or 3 — eliminates 0 and 4
    expect(
      step!.eliminations.filter((e) => e.value === "Alice"),
    ).toContainEqual({ value: "Alice", position: 0 });
    expect(
      step!.eliminations.filter((e) => e.value === "Alice"),
    ).toContainEqual({ value: "Alice", position: 4 });
  });

  it("between arc-consistency: middle cannot be at boundary positions", () => {
    // Outers restricted to {1,2}: no position can be outside middle on both sides
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Red", position: 0 },
      { type: "not_at_position", value: "Red", position: 3 },
      { type: "not_at_position", value: "Blue", position: 0 },
      { type: "not_at_position", value: "Blue", position: 3 },
      { type: "between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Alice", position: 0 });
    expect(allElims).toContainEqual({ value: "Alice", position: 3 });
  });

  it("between: pinned middle + pinned outer constrains the other outer to opposite side", () => {
    // middle=Alice at 2, outer1=Red at 0 → outer2=Blue must be > 2
    const constraints: Constraint[] = [
      { type: "at_position", value: "Alice", position: 2 },
      { type: "at_position", value: "Red", position: 0 },
      { type: "between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Blue", position: 0 });
    expect(allElims).toContainEqual({ value: "Blue", position: 1 });
    expect(allElims).toContainEqual({ value: "Blue", position: 2 });
    const allAssigns = result.steps.flatMap((s) => s.assignments);
    expect(allAssigns).toContainEqual({ value: "Blue", position: 3 });
  });

  it("not_between eliminates middle positions when both outers are pinned", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "at_position", value: "Blue", position: 3 },
      { type: "not_between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "not_between");
    expect(step).toBeDefined();
    expect(step!.eliminations).toContainEqual({ value: "Alice", position: 1 });
    expect(step!.eliminations).toContainEqual({ value: "Alice", position: 2 });
  });

  it("not_between with one outer pinned: eliminates middle positions always between them", () => {
    // outer1=Red at 0, outer2=Blue restricted to {3} only.
    // Alice at 1 or 2 would always be between Red(0) and Blue(3).
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "not_at_position", value: "Blue", position: 0 },
      { type: "not_at_position", value: "Blue", position: 1 },
      { type: "not_at_position", value: "Blue", position: 2 },
      { type: "not_between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Alice", position: 1 });
    expect(allElims).toContainEqual({ value: "Alice", position: 2 });
  });
});
