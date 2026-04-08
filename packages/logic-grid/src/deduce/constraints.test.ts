import { describe, it, expect } from "vitest";
import { deduce } from ".";
import { tryConstraint } from "./constraints";
import { ordinal } from "../grid-utils";
import { createState, getPossible } from "./state";
import { makeGrid } from "../test-helpers";
import type { Constraint, SpatialWords } from "../types";

const POSITIONAL_WORDS: SpatialWords = {
  verb: ["is", "is not"],
  adjacency: "adjacent to",
  direction: ["before", "after"],
  between: ["is somewhere between", "is not somewhere between"],
  atPosition: ["is at", "is not at"],
  cardinals: ["zero", "one", "two", "three", "four", "five", "six", "seven"],
};

const grid = makeGrid({
  size: 4,
  categories: [
    { name: "Name", values: ["Alice", "Bob", "Carol", "Dave"] },
    { name: "Color", values: ["Red", "Blue", "Green", "Yellow"] },
  ],
});

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

  it("same_position intersects possible positions", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "same_position", a: "Red", b: "Alice" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "same_position");
    expect(step).toBeDefined();
    expect(step!.assignments).toContainEqual({ value: "Alice", position: 0 });
  });

  it("not_same_position eliminates when one value is pinned", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "not_same_position", a: "Red", b: "Alice" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "not_same_position");
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

  it("not_next_to eliminates adjacent positions when a is pinned", () => {
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

  it("not_next_to eliminates adjacent positions when b is pinned", () => {
    const constraints: Constraint[] = [
      { type: "at_position", value: "Alice", position: 1 },
      { type: "not_next_to", a: "Red", b: "Alice" },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "not_next_to");
    expect(step).toBeDefined();
    expect(step!.eliminations).toContainEqual({ value: "Red", position: 0 });
    expect(step!.eliminations).toContainEqual({ value: "Red", position: 2 });
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

  it("next_to arc-consistency: no known context in large grid", () => {
    // Blue={0,...,4}, Red={0,...,7}. Red at 6,7 have no Blue neighbor → eliminated.
    // Both retain > 3 positions so describeKnown returns "" for both.
    const grid8 = makeGrid({
      size: 8,
      categories: [
        { name: "Name", values: ["A", "B", "C", "D", "E", "F", "G", "H"] },
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
            "Pink",
          ],
        },
      ],
    });
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Blue", position: 5 },
      { type: "not_at_position", value: "Blue", position: 6 },
      { type: "not_at_position", value: "Blue", position: 7 },
      { type: "next_to", a: "Red", b: "Blue" },
    ];
    const result = deduce(constraints, grid8);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Red", position: 7 });
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

  it("left_of arc-consistency: no known context in large grid", () => {
    // Blue={3,...,7}, Red={0,...,7}. left_of(Red,Blue): Red at 7 has no Blue > 7 → eliminated.
    // Both retain > 3 positions so describeKnown returns "" for both.
    const grid8 = makeGrid({
      size: 8,
      categories: [
        { name: "Name", values: ["A", "B", "C", "D", "E", "F", "G", "H"] },
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
            "Pink",
          ],
        },
      ],
    });
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Blue", position: 0 },
      { type: "not_at_position", value: "Blue", position: 1 },
      { type: "not_at_position", value: "Blue", position: 2 },
      { type: "left_of", a: "Red", b: "Blue" },
    ];
    const result = deduce(constraints, grid8);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Red", position: 7 });
  });

  it("before arc-consistency: no known context in large grid", () => {
    // Blue={3,...,7}, Red={0,...,7}. before(Red,Blue): Red at 7 has no Blue > 7 → eliminated.
    // Both retain > 3 positions so describeKnown returns "" for both.
    const grid8 = makeGrid({
      size: 8,
      categories: [
        { name: "Name", values: ["A", "B", "C", "D", "E", "F", "G", "H"] },
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
            "Pink",
          ],
        },
      ],
    });
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Blue", position: 0 },
      { type: "not_at_position", value: "Blue", position: 1 },
      { type: "not_at_position", value: "Blue", position: 2 },
      { type: "before", a: "Red", b: "Blue" },
    ];
    const result = deduce(constraints, grid8);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Red", position: 7 });
  });

  it("next_to arc-consistency: eliminates positions with no valid neighbour when neither is pinned", () => {
    // Red restricted to {1,3}. Alice at 1 would need Red at 0 or 2 — neither in {1,3}.
    // Alice at 3 would need Red at 2 or 4 — neither in {1,3}.
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Red", position: 0 },
      { type: "not_at_position", value: "Red", position: 2 },
      { type: "next_to", a: "Red", b: "Alice" },
    ];
    const result = deduce(constraints, grid);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Alice", position: 1 });
    expect(allElims).toContainEqual({ value: "Alice", position: 3 });
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

  it("before arc-consistency: constrains both sides when neither is pinned", () => {
    // Blue restricted to {0,1,2}. before(Red, Blue): Red can't be at 2 or 3 (≥ maxBlue=2).
    // After Red becomes {0,1}, Blue can't be at 0 (≤ minRed=0).
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Blue", position: 3 },
      { type: "before", a: "Red", b: "Blue" },
    ];
    const result = deduce(constraints, grid);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Red", position: 2 });
    expect(allElims).toContainEqual({ value: "Red", position: 3 });
    expect(allElims).toContainEqual({ value: "Blue", position: 0 });
  });

  it("exact_distance arc-consistency: eliminates positions with no valid partner when neither is pinned", () => {
    // Blue restricted to {0,1}. Red at distance 2 from Blue:
    // Red at 0 needs Blue at 2 (missing) or -2 (invalid) → eliminated.
    // Red at 1 needs Blue at 3 (missing) or -1 (invalid) → eliminated.
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Blue", position: 2 },
      { type: "not_at_position", value: "Blue", position: 3 },
      { type: "exact_distance", a: "Red", b: "Blue", distance: 2 },
    ];
    const result = deduce(constraints, grid);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Red", position: 0 });
    expect(allElims).toContainEqual({ value: "Red", position: 1 });
  });

  it("exact_distance arc-consistency: eliminates when both values have many positions", () => {
    // distance=5 in a size-8 grid: Red and Blue each lose positions 3 and 4
    // (no valid partner at those positions).
    const grid8 = makeGrid({
      size: 8,
      categories: [
        { name: "Name", values: ["A", "B", "C", "D", "E", "F", "G", "H"] },
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
            "Pink",
          ],
        },
      ],
    });
    const constraints: Constraint[] = [
      { type: "exact_distance", a: "Red", b: "Blue", distance: 5 },
    ];
    const result = deduce(constraints, grid8);
    const step = result.steps.find((s) => s.technique === "exact_distance");
    expect(step).toBeDefined();
    expect(step!.eliminations).toContainEqual({ value: "Red", position: 3 });
    expect(step!.eliminations).toContainEqual({ value: "Blue", position: 3 });
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

  it("exact_distance distance=1 explanation uses singular noun", () => {
    // Alice pinned to position 0; Red must be exactly 1 house away → Red=1
    const constraints: Constraint[] = [
      { type: "at_position", value: "Alice", position: 0 },
      { type: "exact_distance", a: "Red", b: "Alice", distance: 1 },
    ];
    const result = deduce(constraints, grid);
    const step = result.steps.find((s) => s.technique === "exact_distance");
    expect(step).toBeDefined();
    expect(step!.assignments).toContainEqual({ value: "Red", position: 1 });
    expect(step!.explanation).toContain("1 house apart");
  });

  it("exact_distance explanation uses unit from position category", () => {
    const unitGrid = makeGrid({
      size: 4,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol", "Dave"], noun: "" },
        {
          name: "Return",
          values: ["6%", "7%", "8%", "9%"],
          noun: "fund",
          isPosition: true,
          numericValues: [6, 7, 8, 9],
          orderingPhrases: {
            unit: ["percentage point", "percentage points"],
          },
        },
      ],
      spatialWords: {
        ...POSITIONAL_WORDS,
        distanceUnit: ["percentage point", "percentage points"],
      },
      positionLabels: ["6%", "7%", "8%", "9%"],
    });
    const constraints: Constraint[] = [
      { type: "at_position", value: "Alice", position: 0 },
      { type: "exact_distance", a: "Alice", b: "Bob", distance: 2 },
    ];
    const result = deduce(constraints, unitGrid);
    const step = result.steps.find((s) => s.technique === "exact_distance");
    expect(step).toBeDefined();
    expect(step!.explanation).toContain("2 percentage points apart");
  });

  it("exact_distance explanation uses singular unit", () => {
    const unitGrid = makeGrid({
      size: 4,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol", "Dave"], noun: "" },
        {
          name: "Return",
          values: ["6%", "7%", "8%", "9%"],
          noun: "fund",
          isPosition: true,
          numericValues: [6, 7, 8, 9],
          orderingPhrases: {
            unit: ["percentage point", "percentage points"],
          },
        },
      ],
      spatialWords: {
        ...POSITIONAL_WORDS,
        distanceUnit: ["percentage point", "percentage points"],
      },
      positionLabels: ["6%", "7%", "8%", "9%"],
    });
    const constraints: Constraint[] = [
      { type: "at_position", value: "Alice", position: 0 },
      { type: "exact_distance", a: "Alice", b: "Bob", distance: 1 },
    ];
    const result = deduce(constraints, unitGrid);
    const step = result.steps.find((s) => s.technique === "exact_distance");
    expect(step).toBeDefined();
    expect(step!.explanation).toContain("1 percentage point apart");
  });

  it("between constrains middle position", () => {
    const grid5 = makeGrid({
      size: 5,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol", "Dave", "Eve"] },
        { name: "Color", values: ["Red", "Blue", "Green", "Yellow", "White"] },
      ],
    });
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

  it("between arc-consistency: no known context when all three values have many positions", () => {
    // Red={0,1,2,3}, Blue={2,3,4,5}: Alice at 0 or 5 has no valid outer pair.
    // All three values have 4 positions (> 3) so describeKnown returns "" for all.
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
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Red", position: 4 },
      { type: "not_at_position", value: "Red", position: 5 },
      { type: "not_at_position", value: "Blue", position: 0 },
      { type: "not_at_position", value: "Blue", position: 1 },
      { type: "between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid6);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Alice", position: 0 });
    expect(allElims).toContainEqual({ value: "Alice", position: 5 });
  });

  it("between: pinned middle + pinned outer1 (left of middle) constrains outer2 to right", () => {
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

  it("between: pinned middle + pinned outer1 (right of middle) constrains outer2 to left", () => {
    // middle=Alice at 1, outer1=Red at 3 (right of middle) → outer2=Blue must be < 1, i.e. at 0
    const constraints: Constraint[] = [
      { type: "at_position", value: "Alice", position: 1 },
      { type: "at_position", value: "Red", position: 3 },
      { type: "between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    // Blue must be at position 0 (only position < Alice=1); loses 1,2,3
    expect(allElims).toContainEqual({ value: "Blue", position: 1 });
    expect(allElims).toContainEqual({ value: "Blue", position: 2 });
    expect(allElims).toContainEqual({ value: "Blue", position: 3 });
    const allAssigns = result.steps.flatMap((s) => s.assignments);
    expect(allAssigns).toContainEqual({ value: "Blue", position: 0 });
  });

  it("between: pinned middle + pinned outer2 (left of middle) constrains outer1 to right", () => {
    // middle=Alice at 2, outer2=Blue at 0 (left of middle) → outer1=Red must be > 2
    const constraints: Constraint[] = [
      { type: "at_position", value: "Alice", position: 2 },
      { type: "at_position", value: "Blue", position: 0 },
      { type: "between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    // Red must be at position 3; loses 0,1,2
    expect(allElims).toContainEqual({ value: "Red", position: 0 });
    expect(allElims).toContainEqual({ value: "Red", position: 1 });
    expect(allElims).toContainEqual({ value: "Red", position: 2 });
    const allAssigns = result.steps.flatMap((s) => s.assignments);
    expect(allAssigns).toContainEqual({ value: "Red", position: 3 });
  });

  it("not_between arc-consistency: eliminates middle when all outers are on opposite sides", () => {
    // Red={0,1}, Blue={3,4}: neither pinned. Alice at 2: all Red < 2 and all Blue > 2
    // → always between → eliminated.
    const grid5 = makeGrid({
      size: 5,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol", "Dave", "Eve"] },
        {
          name: "Color",
          values: ["Red", "Blue", "Green", "Yellow", "White"],
        },
      ],
    });
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Red", position: 2 },
      { type: "not_at_position", value: "Red", position: 3 },
      { type: "not_at_position", value: "Red", position: 4 },
      { type: "not_at_position", value: "Blue", position: 0 },
      { type: "not_at_position", value: "Blue", position: 1 },
      { type: "not_at_position", value: "Blue", position: 2 },
      { type: "not_between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid5);
    const step = result.steps.find((s) => s.technique === "not_between");
    expect(step).toBeDefined();
    expect(step!.eliminations).toContainEqual({ value: "Alice", position: 2 });
  });

  it("not_between arc-consistency: mirror case with outers swapped", () => {
    // Red={3,4}, Blue={0,1}: Alice at 2 is always between (Blue left, Red right) → eliminated.
    const grid5 = makeGrid({
      size: 5,
      categories: [
        { name: "Name", values: ["Alice", "Bob", "Carol", "Dave", "Eve"] },
        {
          name: "Color",
          values: ["Red", "Blue", "Green", "Yellow", "White"],
        },
      ],
    });
    const constraints: Constraint[] = [
      { type: "not_at_position", value: "Red", position: 0 },
      { type: "not_at_position", value: "Red", position: 1 },
      { type: "not_at_position", value: "Red", position: 2 },
      { type: "not_at_position", value: "Blue", position: 2 },
      { type: "not_at_position", value: "Blue", position: 3 },
      { type: "not_at_position", value: "Blue", position: 4 },
      { type: "not_between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid5);
    const step = result.steps.find((s) => s.technique === "not_between");
    expect(step).toBeDefined();
    expect(step!.eliminations).toContainEqual({ value: "Alice", position: 2 });
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

  it("not_between one outer pinned (left): middle always right of pinned and left of other outer", () => {
    // outer1=Red at 0, Blue restricted to {2,3} (min=2).
    // Alice at 1: Red(0) < 1 AND min(Blue)=2 > 1 → always between → eliminated.
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "not_at_position", value: "Blue", position: 1 },
      { type: "not_between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Alice", position: 1 });
  });

  it("not_between one outer pinned (right): middle always left of pinned and right of other outer", () => {
    // outer2=Blue at 3, Red restricted to {0,1} (max=1).
    // Alice at 2: Blue(3) > 2 AND max(Red)=1 < 2 → always between → eliminated.
    const constraints: Constraint[] = [
      { type: "at_position", value: "Blue", position: 3 },
      { type: "not_at_position", value: "Red", position: 2 },
      { type: "not_between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Alice", position: 2 });
  });

  it("not_between: uses outer2 description when outer1 has many positions", () => {
    // outer2=Blue pinned at 0, outer1=Red has {2,3,4,5} (4 positions, no description).
    // Alice at 1 is always between pinnedBlue(0) and minRed(2) → eliminated.
    // knownO1="" (Red > 3 positions) so knownO1||knownO2 uses knownO2.
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
    const constraints: Constraint[] = [
      { type: "at_position", value: "Blue", position: 0 },
      { type: "not_at_position", value: "Red", position: 0 },
      { type: "not_at_position", value: "Red", position: 1 },
      { type: "not_between", outer1: "Red", middle: "Alice", outer2: "Blue" },
    ];
    const result = deduce(constraints, grid6);
    const allElims = result.steps.flatMap((s) => s.eliminations);
    expect(allElims).toContainEqual({ value: "Alice", position: 1 });
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

describe("empty-set guards", () => {
  it("before returns null when a possible set is empty", () => {
    const state = createState(grid);
    getPossible(state, "Red").clear();
    const result = tryConstraint(
      state,
      { type: "before", a: "Red", b: "Alice" },
      0,
    );
    expect(result).toBeNull();
  });

  it("not_between one-pinned returns null when other outer is empty", () => {
    const state = createState(grid);
    // Pin outer1
    const ps = getPossible(state, "Red");
    ps.clear();
    ps.add(0);
    // Empty outer2
    getPossible(state, "Blue").clear();
    const result = tryConstraint(
      state,
      { type: "not_between", outer1: "Red", middle: "Alice", outer2: "Blue" },
      0,
    );
    expect(result).toBeNull();
  });

  it("not_between neither-pinned returns null when an outer is empty", () => {
    const state = createState(grid);
    getPossible(state, "Red").clear();
    const result = tryConstraint(
      state,
      { type: "not_between", outer1: "Red", middle: "Alice", outer2: "Blue" },
      0,
    );
    expect(result).toBeNull();
  });

  it("between returns null when an outer set is empty", () => {
    const state = createState(grid);
    getPossible(state, "Red").clear();
    const result = tryConstraint(
      state,
      { type: "between", outer1: "Red", middle: "Alice", outer2: "Blue" },
      0,
    );
    expect(result).toBeNull();
    // No spurious eliminations from arc-consistency with -Infinity/Infinity
    expect(getPossible(state, "Alice").size).toBe(4);
    expect(getPossible(state, "Blue").size).toBe(4);
  });
});

describe("ordinal", () => {
  it("throws for out-of-range positions", () => {
    expect(() => ordinal(8)).toThrow("out of supported range");
    expect(() => ordinal(-1)).toThrow("out of supported range");
  });
});
