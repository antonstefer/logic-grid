import { describe, it, expect } from "vitest";
import { classify } from "./difficulty";
import { Constraint, Grid } from "./types";

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
      { type: "same_house", a: "Red", b: "Cat" },
      { type: "not_same_house", a: "Blue", b: "Dog" },
      { type: "at_position", value: "Tea", position: 0 },
    ];
    expect(classify(constraints)).toBe("easy");
  });

  it("returns medium when next_to is present", () => {
    const constraints: Constraint[] = [
      { type: "same_house", a: "Red", b: "Cat" },
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
      { type: "same_house", a: "Red", b: "Cat" },
      { type: "between", outer1: "Red", middle: "Dog", outer2: "Blue" },
    ];
    expect(classify(constraints)).toBe("hard");
  });

  it("returns hard when not_next_to is present", () => {
    const constraints: Constraint[] = [
      { type: "not_next_to", a: "Red", b: "Cat" },
    ];
    expect(classify(constraints)).toBe("hard");
  });
});

describe("classify with grid (deduction depth)", () => {
  it("returns easy when human elimination fully solves it", () => {
    // Fully pinned: every value has an at_position or same_house chain from one
    const constraints: Constraint[] = [
      { type: "at_position", value: "Red", position: 0 },
      { type: "at_position", value: "Blue", position: 1 },
      { type: "same_house", a: "Red", b: "Cat" },
      { type: "same_house", a: "Blue", b: "Dog" },
      { type: "same_house", a: "Red", b: "Tea" },
      { type: "same_house", a: "Blue", b: "Coffee" },
    ];
    expect(classify(constraints, grid3x3)).toBe("easy");
  });

  it("returns medium for easy types that require deeper reasoning", () => {
    // Only easy-type constraints, but not enough for direct elimination
    const constraints: Constraint[] = [
      { type: "same_house", a: "Red", b: "Cat" },
      { type: "not_same_house", a: "Blue", b: "Dog" },
      { type: "not_same_house", a: "Green", b: "Fish" },
    ];
    expect(classify(constraints, grid3x3)).toBe("medium");
  });
});
