import { describe, it, expect } from "vitest";
import {
  generate,
  solve,
  hasUniqueSolution,
  classify,
  samePosition,
  nextTo,
  leftOf,
  atPosition,
} from "./index";
import { makeGrid } from "./test-helpers";

describe("public API integration", () => {
  it("generate → solve → verify solution matches", () => {
    const puzzle = generate({ seed: 77 });

    const solved = solve(puzzle.constraints, puzzle.grid);
    expect(solved).not.toBeNull();

    // Every value should map to the same position in both solutions
    for (let ci = 0; ci < puzzle.solution.length; ci++) {
      for (const [val, pos] of Object.entries(puzzle.solution[ci])) {
        expect(solved![ci][val]).toBe(pos);
      }
    }
  });

  it("generate → classify → difficulty matches", () => {
    const puzzle = generate({ seed: 88 });
    const difficulty = classify(puzzle.constraints, puzzle.grid);
    expect(difficulty).toBe(puzzle.difficulty);
  });

  it("generate → hasUniqueSolution confirms uniqueness", () => {
    const puzzle = generate({ seed: 99 });
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it("constraint factories work with solve", () => {
    const grid = makeGrid({
      size: 3,
      categories: [
        { name: "Color", values: ["Red", "Blue", "Green"] },
        { name: "Pet", values: ["Cat", "Dog", "Fish"] },
      ],
    });
    const constraints = [
      atPosition("Red", 0),
      samePosition("Red", "Cat"),
      leftOf("Blue", "Green", "House"),
    ];
    const solution = solve(constraints, grid);
    expect(solution).not.toBeNull();
    // House is categories[0], then Color, Pet
    expect(solution![1]["Red"]).toBe(0);
    expect(solution![2]["Cat"]).toBe(0);
  });

  it("renderClue produces text for generated puzzles", () => {
    const puzzle = generate({ seed: 55 });
    for (const clue of puzzle.clues) {
      expect(clue.text.length).toBeGreaterThan(0);
      expect(clue.text.endsWith(".")).toBe(true);
    }
  });

  it("all constraint factories are exported", () => {
    expect(typeof samePosition).toBe("function");
    expect(typeof nextTo).toBe("function");
    expect(typeof leftOf).toBe("function");
    expect(typeof atPosition).toBe("function");
  });

  it("generate with custom noun/verb produces correct clues", () => {
    const puzzle = generate({
      size: 4,
      seed: 42,
      categoryNames: [
        { name: "Name", values: ["Luna", "Kai", "Nora", "Theo"] },
        {
          name: "Instrument",
          values: ["Piano", "Guitar", "Drums", "Violin"],
          noun: "player",
          verb: ["plays the", "does not play the"],
          lowercase: true,
        },
        {
          name: "Flower",
          values: ["Rose", "Lily", "Daisy", "Tulip"],
          noun: "grower",
          verb: ["grows the", "does not grow the"],
          lowercase: true,
        },
        {
          name: "Language",
          values: ["French", "Spanish", "German", "Italian"],
          noun: "speaker",
          verb: ["speaks", "does not speak"],
        },
      ],
    });

    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);

    const texts = puzzle.clues.map((c) => c.text);
    for (const text of texts) {
      // Custom nouns should appear instead of category names
      expect(text).not.toContain("instrument");
      expect(text).not.toContain("flower");
      expect(text).not.toContain("language");
    }

    // Verify actual clue sentences use custom nouns and verbs
    expect(texts).toMatchSnapshot();
  });
});
