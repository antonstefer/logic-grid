import { describe, it, expect } from "vitest";
import { classify } from "./difficulty";
import type { Constraint, Grid } from "./types";

const grid3x3: Grid = {
  size: 3,
  categories: [
    { name: "Color", values: ["Red", "Blue", "Green"] },
    { name: "Pet", values: ["Cat", "Dog", "Fish"] },
    { name: "Drink", values: ["Tea", "Coffee", "Water"] },
  ],
};

describe("classify by constraint types only", () => {
  it("returns easy for only easy types", () => {
    const constraints: Constraint[] = [
      { type: "same_position", a: "Red", b: "Cat" },
      { type: "not_same_position", a: "Blue", b: "Dog" },
      { type: "at_position", value: "Tea", position: 0 },
    ];
    expect(classify(constraints)).toBe("easy");
  });

  it("returns medium when next_to is present", () => {
    const constraints: Constraint[] = [
      { type: "same_position", a: "Red", b: "Cat" },
      { type: "next_to", a: "Blue", b: "Dog" },
    ];
    expect(classify(constraints)).toBe("medium");
  });

  it("returns medium when left_of is present", () => {
    const constraints: Constraint[] = [
      { type: "left_of", a: "Red", b: "Blue" },
    ];
    expect(classify(constraints)).toBe("medium");
  });

  it("returns hard when between is present", () => {
    const constraints: Constraint[] = [
      { type: "same_position", a: "Red", b: "Cat" },
      { type: "between", outer1: "Red", middle: "Dog", outer2: "Blue" },
    ];
    expect(classify(constraints)).toBe("hard");
  });

  it("returns medium when before is present", () => {
    const constraints: Constraint[] = [{ type: "before", a: "Red", b: "Blue" }];
    expect(classify(constraints)).toBe("medium");
  });

  it("returns hard when not_next_to is present", () => {
    const constraints: Constraint[] = [
      { type: "not_next_to", a: "Red", b: "Cat" },
    ];
    expect(classify(constraints)).toBe("hard");
  });

  it("returns hard when not_between is present", () => {
    const constraints: Constraint[] = [
      { type: "not_between", outer1: "Red", middle: "Cat", outer2: "Blue" },
    ];
    expect(classify(constraints)).toBe("hard");
  });

  it("returns hard when exact_distance is present", () => {
    const constraints: Constraint[] = [
      { type: "exact_distance", a: "Red", b: "Cat", distance: 2 },
    ];
    expect(classify(constraints)).toBe("hard");
  });
});

describe("classify with grid (deduction depth)", () => {
  it("returns easy when human elimination fully solves it", () => {
    // Fully pinned: every value has an at_position or same_position chain from one
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "at_position", value: "Blue", position: 1 },
      { type: "same_position", a: "Red", b: "Cat" },
      { type: "same_position", a: "Blue", b: "Dog" },
      { type: "same_position", a: "Red", b: "Tea" },
      { type: "same_position", a: "Blue", b: "Coffee" },
    ];
    expect(classify(constraints, grid3x3)).toBe("easy");
  });

  it("uses not_same_position elimination in deduction depth", () => {
    // Fully pinned via at_position + same_position + not_same_position elimination
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "at_position", value: "Blue", position: 1 },
      { type: "at_position", value: "Green", position: 2 },
      { type: "same_position", a: "Red", b: "Cat" },
      { type: "same_position", a: "Blue", b: "Coffee" },
      { type: "same_position", a: "Red", b: "Tea" },
      // not_same_position: Dog is not with Red (pos 0) → eliminates pos 0 for Dog
      { type: "not_same_position", a: "Red", b: "Dog" },
      // not_same_position: Dog is not with Green (pos 2) → forces Dog to pos 1
      { type: "not_same_position", a: "Green", b: "Dog" },
      { type: "same_position", a: "Green", b: "Water" },
    ];
    expect(classify(constraints, grid3x3)).toBe("easy");
  });

  it("returns expert for easy types that require contradiction", () => {
    // Only easy-type constraints, but not solvable by pure deduction
    const constraints: Constraint[] = [
      { type: "same_position", a: "Red", b: "Cat" },
      { type: "not_same_position", a: "Blue", b: "Dog" },
      { type: "not_same_position", a: "Green", b: "Fish" },
    ];
    expect(classify(constraints, grid3x3)).toBe("expert");
  });

  it("returns expert for medium types that require contradiction", () => {
    const constraints: Constraint[] = [
      { type: "next_to", a: "Red", b: "Cat" },
      { type: "next_to", a: "Red", b: "Dog" },
      { type: "left_of", a: "Blue", b: "Tea" },
      { type: "before", a: "Cat", b: "Coffee" },
    ];
    expect(classify(constraints, grid3x3)).toBe("expert");
  });

  it("returns expert for hard types that require contradiction", () => {
    const constraints: Constraint[] = [
      { type: "not_next_to", a: "Red", b: "Cat" },
      { type: "exact_distance", a: "Blue", b: "Dog", distance: 2 },
    ];
    expect(classify(constraints, grid3x3)).toBe("expert");
  });
});
