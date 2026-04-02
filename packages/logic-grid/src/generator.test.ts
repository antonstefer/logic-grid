import { describe, it, expect } from "vitest";
import { generate } from "./generator";
import { deduce } from "./deduce";
import { hasUniqueSolution, solve } from "./solver";

describe("generate", () => {
  it("returns a valid puzzle with defaults", () => {
    const puzzle = generate();

    expect(puzzle.grid.size).toBe(4);
    expect(puzzle.grid.categories.length).toBe(4);
    expect(puzzle.constraints.length).toBeGreaterThan(0);
    expect(puzzle.clues.length).toBe(puzzle.constraints.length);
    expect(puzzle.solution.length).toBe(4);
    expect(["easy", "medium", "hard", "expert"]).toContain(puzzle.difficulty);
  });

  it("solution is a valid permutation", () => {
    const puzzle = generate();

    for (const assignment of puzzle.solution) {
      const positions = Object.values(assignment);
      expect(positions.length).toBe(puzzle.grid.size);
      expect(new Set(positions).size).toBe(puzzle.grid.size);
      for (const p of positions) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(puzzle.grid.size);
      }
    }
  });

  it("constraints are consistent with the solution", () => {
    const puzzle = generate();
    const posOf = new Map<string, number>();
    for (const assignment of puzzle.solution) {
      for (const [val, pos] of Object.entries(assignment)) {
        posOf.set(val, pos);
      }
    }

    for (const c of puzzle.constraints) {
      switch (c.type) {
        case "same_position":
          expect(posOf.get(c.a)).toBe(posOf.get(c.b));
          break;
        case "not_same_position":
          expect(posOf.get(c.a)).not.toBe(posOf.get(c.b));
          break;
        case "next_to":
          expect(Math.abs(posOf.get(c.a)! - posOf.get(c.b)!)).toBe(1);
          break;
        case "not_next_to":
          expect(Math.abs(posOf.get(c.a)! - posOf.get(c.b)!)).not.toBe(1);
          break;
        case "left_of":
          expect(posOf.get(c.b)! - posOf.get(c.a)!).toBe(1);
          break;
        case "between": {
          const lo = Math.min(posOf.get(c.outer1)!, posOf.get(c.outer2)!);
          const hi = Math.max(posOf.get(c.outer1)!, posOf.get(c.outer2)!);
          expect(posOf.get(c.middle)!).toBeGreaterThan(lo);
          expect(posOf.get(c.middle)!).toBeLessThan(hi);
          break;
        }
        case "at_position":
          expect(posOf.get(c.value)).toBe(c.position);
          break;
        case "not_at_position":
          expect(posOf.get(c.value)).not.toBe(c.position);
          break;
        case "before":
          expect(posOf.get(c.a)!).toBeLessThan(posOf.get(c.b)!);
          break;
        case "not_between": {
          const lo = Math.min(posOf.get(c.outer1)!, posOf.get(c.outer2)!);
          const hi = Math.max(posOf.get(c.outer1)!, posOf.get(c.outer2)!);
          const mid = posOf.get(c.middle)!;
          expect(mid > lo && mid < hi).toBe(false);
          break;
        }
        case "exact_distance":
          expect(Math.abs(posOf.get(c.a)! - posOf.get(c.b)!)).toBe(c.distance);
          break;
      }
    }
  });

  it("puzzle has a unique solution", () => {
    const puzzle = generate();
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it("solver finds the same solution", () => {
    const puzzle = generate({ seed: 42 });
    const solved = solve(puzzle.constraints, puzzle.grid);
    expect(solved).not.toBeNull();

    // Verify every value maps to the same position
    for (let ci = 0; ci < puzzle.solution.length; ci++) {
      for (const [val, pos] of Object.entries(puzzle.solution[ci])) {
        expect(solved![ci][val]).toBe(pos);
      }
    }
  });

  it("seeded generation is deterministic", () => {
    const p1 = generate({ seed: 123 });
    const p2 = generate({ seed: 123 });

    expect(p1.solution).toEqual(p2.solution);
    expect(p1.constraints).toEqual(p2.constraints);
  });

  it("generates 3x3 puzzles", () => {
    const puzzle = generate({ size: 3, categories: 3 });
    expect(puzzle.grid.size).toBe(3);
    expect(puzzle.grid.categories.length).toBe(3);
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it("generates 5x5 puzzles", () => {
    const puzzle = generate({ size: 5, categories: 5 });
    expect(puzzle.grid.size).toBe(5);
    expect(puzzle.grid.categories.length).toBe(5);
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it("generates 6x6 puzzles", () => {
    const puzzle = generate({ size: 6, categories: 6, seed: 42 });
    expect(puzzle.grid.size).toBe(6);
    expect(puzzle.grid.categories.length).toBe(6);
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it("generates 8x8 puzzles", () => {
    const puzzle = generate({ size: 8, categories: 8, seed: 42 });
    expect(puzzle.grid.size).toBe(8);
    expect(puzzle.grid.categories.length).toBe(8);
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it("rejects sizes outside 3-8", () => {
    expect(() => generate({ size: 2 })).toThrow(RangeError);
    expect(() => generate({ size: 9 })).toThrow(RangeError);
    expect(() => generate({ categories: 2 })).toThrow(RangeError);
    expect(() => generate({ categories: 9 })).toThrow(RangeError);
  });

  it("accepts valid positionNoun", () => {
    const puzzle = generate({
      size: 3,
      seed: 1,
      positionNoun: ["seat", "seats"],
    });
    expect(puzzle.grid.positionNoun).toEqual(["seat", "seats"]);
  });

  it("rejects empty positionNoun strings", () => {
    expect(() => generate({ size: 3, positionNoun: ["", "slots"] })).toThrow(
      RangeError,
    );
    expect(() => generate({ size: 3, positionNoun: ["slot", ""] })).toThrow(
      RangeError,
    );
  });

  it("rejects empty positionPreposition", () => {
    expect(() => generate({ size: 3, positionPreposition: "" })).toThrow(
      RangeError,
    );
  });

  it("accepts custom categories", () => {
    const puzzle = generate({
      size: 3,
      categoryNames: [
        { name: "House", values: ["A", "B", "C"] },
        { name: "Owner", values: ["X", "Y", "Z"] },
        { name: "Car", values: ["BMW", "Audi", "VW"] },
      ],
    });
    expect(puzzle.grid.categories[0].name).toBe("House");
    expect(puzzle.grid.categories[0].values).toEqual(["A", "B", "C"]);
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it("prefers relational clues over at_position", () => {
    const puzzle = generate({ size: 4, categories: 4, seed: 42 });
    const types: Record<string, number> = {};
    for (const c of puzzle.constraints) {
      types[c.type] = (types[c.type] || 0) + 1;
    }
    const atPos = types["at_position"] ?? 0;
    const relational =
      (types["same_position"] ?? 0) +
      (types["next_to"] ?? 0) +
      (types["left_of"] ?? 0) +
      (types["between"] ?? 0);

    // Relational clues should outnumber at_position
    expect(relational).toBeGreaterThan(atPos);
    // at_position should be a minority (less than half of total)
    expect(atPos).toBeLessThan(puzzle.constraints.length / 2);
  });

  it("respects difficulty easy", () => {
    const puzzle = generate({
      size: 3,
      categories: 3,
      difficulty: "easy",
      seed: 1,
    });
    expect(puzzle.difficulty).toBe("easy");
    for (const c of puzzle.constraints) {
      expect([
        "same_position",
        "not_same_position",
        "at_position",
        "not_at_position",
      ]).toContain(c.type);
    }
  });

  it("respects difficulty medium", () => {
    const puzzle = generate({
      size: 4,
      categories: 4,
      difficulty: "medium",
      seed: 42,
    });
    expect(puzzle.difficulty).toBe("medium");
    for (const c of puzzle.constraints) {
      expect([
        "same_position",
        "not_same_position",
        "at_position",
        "not_at_position",
        "next_to",
        "left_of",
        "before",
      ]).toContain(c.type);
    }
  });

  it("respects difficulty hard", () => {
    const puzzle = generate({
      size: 4,
      categories: 4,
      difficulty: "hard",
      seed: 42,
    });
    expect(puzzle.difficulty).toBe("hard");
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it("easy/medium/hard puzzles never require contradiction", () => {
    for (const difficulty of ["easy", "medium", "hard"] as const) {
      for (let seed = 0; seed < 10; seed++) {
        let puzzle;
        try {
          puzzle = generate({ size: 4, categories: 4, difficulty, seed });
        } catch {
          continue; // seed may not produce this difficulty
        }
        const result = deduce(puzzle.constraints, puzzle.grid);
        expect(result.complete).toBe(true);
        expect(result.steps.some((s) => s.technique === "contradiction")).toBe(
          false,
        );
      }
    }
  });

  it("expert puzzles require contradiction", () => {
    const puzzle = generate({ size: 4, categories: 4, difficulty: "expert" });
    expect(puzzle.difficulty).toBe("expert");
    const result = deduce(puzzle.constraints, puzzle.grid);
    expect(result.complete).toBe(true);
    expect(result.steps.some((s) => s.technique === "contradiction")).toBe(
      true,
    );
  });

  it("throws when custom categoryNames count is out of range", () => {
    expect(() =>
      generate({
        size: 3,
        categoryNames: [
          { name: "A", values: ["1", "2", "3"] },
          { name: "B", values: ["4", "5", "6"] },
        ],
      }),
    ).toThrow("categories must be 3-8");
    expect(() =>
      generate({
        size: 3,
        categoryNames: Array.from({ length: 9 }, (_, i) => ({
          name: `Cat${i}`,
          values: ["a", "b", "c"],
        })),
      }),
    ).toThrow("categories must be 3-8");
  });

  it("throws when custom category has too few values", () => {
    expect(() =>
      generate({
        size: 5,
        categoryNames: [
          { name: "Color", values: ["Red", "Blue"] },
          { name: "Pet", values: ["Cat", "Dog", "Fish", "Bird", "Rabbit"] },
          {
            name: "Drink",
            values: ["Tea", "Coffee", "Water", "Milk", "Juice"],
          },
        ],
      }),
    ).toThrow('Category "Color" has 2 values but size is 5');
  });

  it("position category gets identity assignment", () => {
    const puzzle = generate({
      size: 4,
      seed: 42,
      categoryNames: [
        { name: "Manager", values: ["Alice", "Bob", "Carol", "Dan"], noun: "" },
        {
          name: "Return",
          values: ["6%", "7%", "8%", "9%"],
          noun: "fund",
          isPosition: true,
          numericValues: [6, 7, 8, 9],
          orderingPhrases: {
            unit: ["percentage point", "percentage points"],
            comparators: { before: "has a larger return than" },
          },
        },
        {
          name: "Strategy",
          values: ["Long/Short", "Macro", "Quant", "Event"],
          noun: "strategist",
        },
      ],
    });

    // Position category should have identity mapping
    const returnAssignment = puzzle.solution.find((a) => "6%" in a)!;
    expect(returnAssignment["6%"]).toBe(0);
    expect(returnAssignment["7%"]).toBe(1);
    expect(returnAssignment["8%"]).toBe(2);
    expect(returnAssignment["9%"]).toBe(3);

    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it("position category is preserved in grid", () => {
    const puzzle = generate({
      size: 3,
      seed: 1,
      categoryNames: [
        { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
        {
          name: "Time",
          values: ["9am", "10am", "11am"],
          noun: "slot",
          isPosition: true,
        },
        { name: "Color", values: ["Red", "Blue", "Green"] },
      ],
    });

    const posCat = puzzle.grid.categories.find((c) => c.isPosition);
    expect(posCat).toBeDefined();
    expect(posCat!.name).toBe("Time");
    expect(posCat!.isPosition).toBe(true);
  });
});
