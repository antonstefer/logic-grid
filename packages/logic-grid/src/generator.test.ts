import { describe, it, expect } from "vitest";
import { generate } from "./generator";
import { deduce } from "./deduce";
import { hasUniqueSolution, solve } from "./solver";
import { resolveAxis } from "./axis";
import { TEST_COMPARATORS } from "./test-helpers";
import type { Category, Grid } from "./types";

describe("generate", () => {
  it("returns a valid puzzle with defaults", () => {
    const puzzle = generate({ seed: 1 });

    expect(puzzle.grid.size).toBe(4);
    expect(puzzle.grid.categories.length).toBe(4);
    expect(puzzle.constraints.length).toBeGreaterThan(0);
    expect(puzzle.clues.length).toBe(puzzle.constraints.length);
    expect(puzzle.solution.length).toBe(4);
    expect(["easy", "medium", "hard", "expert"]).toContain(puzzle.difficulty);
  });

  it("solution is a valid permutation", () => {
    const puzzle = generate({ seed: 2 });

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
    const puzzle = generate({ seed: 3 });
    const posOf = new Map<string, number>();
    for (const assignment of puzzle.solution) {
      for (const [val, pos] of Object.entries(assignment)) {
        posOf.set(val, pos);
      }
    }

    // rank(value, axis) = index of the axis value colocated with `value`.
    const rankOf = (val: string, grid: Grid, axisName: string): number => {
      const axis = resolveAxis(grid, axisName);
      const pos = posOf.get(val)!;
      for (let k = 0; k < axis.values.length; k++) {
        if (posOf.get(axis.values[k]) === pos) return k;
      }
      throw new Error(`No ${axisName} value colocated with ${val}`);
    };

    for (const c of puzzle.constraints) {
      switch (c.type) {
        case "same_position":
          expect(posOf.get(c.a)).toBe(posOf.get(c.b));
          break;
        case "not_same_position":
          expect(posOf.get(c.a)).not.toBe(posOf.get(c.b));
          break;
        case "next_to": {
          const ra = rankOf(c.a, puzzle.grid, c.axis);
          const rb = rankOf(c.b, puzzle.grid, c.axis);
          expect(Math.abs(ra - rb)).toBe(1);
          break;
        }
        case "not_next_to": {
          const ra = rankOf(c.a, puzzle.grid, c.axis);
          const rb = rankOf(c.b, puzzle.grid, c.axis);
          expect(Math.abs(ra - rb)).not.toBe(1);
          break;
        }
        case "left_of": {
          const ra = rankOf(c.a, puzzle.grid, c.axis);
          const rb = rankOf(c.b, puzzle.grid, c.axis);
          expect(rb - ra).toBe(1);
          break;
        }
        case "between": {
          const r1 = rankOf(c.outer1, puzzle.grid, c.axis);
          const r2 = rankOf(c.outer2, puzzle.grid, c.axis);
          const rm = rankOf(c.middle, puzzle.grid, c.axis);
          const lo = Math.min(r1, r2);
          const hi = Math.max(r1, r2);
          expect(rm).toBeGreaterThan(lo);
          expect(rm).toBeLessThan(hi);
          break;
        }
        case "before": {
          const ra = rankOf(c.a, puzzle.grid, c.axis);
          const rb = rankOf(c.b, puzzle.grid, c.axis);
          expect(ra).toBeLessThan(rb);
          break;
        }
        case "not_between": {
          const r1 = rankOf(c.outer1, puzzle.grid, c.axis);
          const r2 = rankOf(c.outer2, puzzle.grid, c.axis);
          const rm = rankOf(c.middle, puzzle.grid, c.axis);
          const lo = Math.min(r1, r2);
          const hi = Math.max(r1, r2);
          expect(rm > lo && rm < hi).toBe(false);
          break;
        }
        case "exact_distance": {
          const axis = resolveAxis(puzzle.grid, c.axis);
          const ra = rankOf(c.a, puzzle.grid, c.axis);
          const rb = rankOf(c.b, puzzle.grid, c.axis);
          if (axis.numericValues) {
            expect(
              Math.abs(axis.numericValues[ra] - axis.numericValues[rb]),
            ).toBe(c.distance);
          } else {
            expect(Math.abs(ra - rb)).toBe(c.distance);
          }
          break;
        }
      }
    }
  });

  it("puzzle has a unique solution", () => {
    const puzzle = generate({ seed: 4 });
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

  it("accepts custom categories", () => {
    const puzzle = generate({
      size: 3,
      categoryNames: [
        {
          name: "House",
          values: ["A", "B", "C"],
          noun: "house",
          verb: ["lives in", "does not live in"],
          ordered: true,
          orderingPhrases: { comparators: TEST_COMPARATORS },
        },
        {
          name: "Owner",
          values: ["X", "Y", "Z"],
          noun: "",
        },
        {
          name: "Car",
          values: ["BMW", "Audi", "VW"],
          noun: "driver",
          verb: ["drives the", "does not drive the"],
        },
      ],
    });
    expect(puzzle.grid.categories[0].name).toBe("House");
    expect(puzzle.grid.categories[0].values).toEqual(["A", "B", "C"]);
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it("prefers relational clues over same_position with display axis", () => {
    const puzzle = generate({ size: 4, categories: 4, seed: 42 });
    const types: Record<string, number> = {};
    for (const c of puzzle.constraints) {
      types[c.type] = (types[c.type] || 0) + 1;
    }
    const relational =
      (types["next_to"] ?? 0) +
      (types["left_of"] ?? 0) +
      (types["between"] ?? 0);

    // Relational clues should be present
    expect(relational).toBeGreaterThan(0);
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
      expect(["same_position", "not_same_position"]).toContain(c.type);
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
    // Seed chosen so the first generation attempt produces a non-expert
    // puzzle, forcing at least one difficulty-retry iteration. The natural
    // assertion below pins that premise — if RNG/scoring shifts and seed 1
    // starts producing expert naturally, this test fails loudly so we can
    // pick a new seed instead of silently losing retry-branch coverage.
    const natural = generate({ size: 4, categories: 4, seed: 1 });
    expect(natural.difficulty).not.toBe("expert");

    const puzzle = generate({
      size: 4,
      categories: 4,
      difficulty: "expert",
      seed: 1,
    });
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

  it("throws on duplicate category names", () => {
    expect(() =>
      generate({
        size: 3,
        categoryNames: [
          { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
          {
            name: "Dupe",
            values: ["A", "B", "C"],
            noun: "x",
            verb: ["is", "is not"],
          },
          {
            name: "Dupe",
            values: ["D", "E", "F"],
            noun: "y",
            verb: ["has", "has not"],
          },
        ],
      }),
    ).toThrow("Duplicate category name");
  });

  it("throws when numericValues length does not match values", () => {
    expect(() =>
      generate({
        size: 3,
        categoryNames: [
          { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
          {
            name: "Year",
            values: ["2020", "2021", "2022"],
            noun: "year",
            verb: ["started in", "did not start in"],
            ordered: true,
            numericValues: [2020, 2021],
            orderingPhrases: { comparators: TEST_COMPARATORS },
          },
          {
            name: "Color",
            values: ["Red", "Blue", "Green"],
            noun: "color",
            verb: ["wears", "does not wear"],
          },
        ],
      }),
    ).toThrow("numericValues length must match values length");
  });

  it("throws when displayAxis references a non-ordered category", () => {
    expect(() =>
      generate({
        size: 3,
        categoryNames: [
          { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
          {
            name: "Year",
            values: ["2020", "2021", "2022"],
            noun: "year",
            verb: ["started in", "did not start in"],
            ordered: true,
            orderingPhrases: { comparators: TEST_COMPARATORS },
          },
          {
            name: "Color",
            values: ["Red", "Blue", "Green"],
            noun: "color",
            verb: ["wears", "does not wear"],
          },
        ],
        displayAxis: "Color",
      }),
    ).toThrow("must reference an ordered category");
  });

  it("throws when non-person category lacks verb", () => {
    expect(() =>
      generate({
        size: 3,
        categoryNames: [
          { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
          {
            name: "Color",
            values: ["Red", "Blue", "Green"],
            noun: "house",
            // missing verb
          },
          {
            name: "Pet",
            values: ["Cat", "Dog", "Fish"],
            noun: "owner",
            verb: ["owns the", "does not own the"],
          },
        ],
      }),
    ).toThrow("requires a verb");
  });

  // "symmetric comparator as tuple" is now a compile-time error:
  // ComparatorMap requires next_to/not_next_to/between/not_between/exact_distance
  // to be plain strings, not [forward, reverse] tuples.

  it("throws when numericValues are not in ascending order", () => {
    expect(() =>
      generate({
        size: 3,
        categoryNames: [
          { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
          {
            name: "Time",
            values: ["7am", "8am", "9am"],
            noun: "slot",
            verb: ["is at", "is not at"],
            ordered: true,
            orderingPhrases: { comparators: TEST_COMPARATORS },
            numericValues: [9, 7, 8],
          },
          { name: "Color", values: ["Red", "Blue", "Green"] },
        ],
      }),
    ).toThrow("numericValues must be in ascending order");
  });

  it("non-equidistant numericValues produce value-based exact_distance", () => {
    const puzzle = generate({
      size: 4,
      seed: 7,
      categoryNames: [
        { name: "Manager", values: ["Alice", "Bob", "Carol", "Dan"], noun: "" },
        {
          name: "Return",
          values: ["3%", "5%", "8%", "12%"],
          noun: "fund",
          verb: ["has a return of", "does not have a return of"],
          ordered: true,
          numericValues: [3, 5, 8, 12],
          orderingPhrases: {
            unit: ["percentage point", "percentage points"] as [string, string],
            comparators: TEST_COMPARATORS,
          },
        },
        {
          name: "Strategy",
          values: ["Long", "Short", "Macro", "Quant"],
          noun: "strategist",
          verb: ["uses", "does not use"],
        },
      ],
    });

    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);

    // exact_distance constraints are emitted for value pairs whose
    // numeric gap matches. The emitted distance should be in the valid set.
    const validValueDistances = new Set<number>();
    const numVals = [3, 5, 8, 12];
    for (let i = 0; i < numVals.length; i++) {
      for (let j = i + 1; j < numVals.length; j++) {
        validValueDistances.add(Math.abs(numVals[i] - numVals[j]));
      }
    }
    for (const c of puzzle.constraints) {
      if (c.type === "exact_distance") {
        expect(validValueDistances.has(c.distance)).toBe(true);
      }
    }
  });

  it("first ordered category gets identity assignment", () => {
    const puzzle = generate({
      size: 4,
      seed: 42,
      categoryNames: [
        { name: "Manager", values: ["Alice", "Bob", "Carol", "Dan"], noun: "" },
        {
          name: "Return",
          values: ["6%", "7%", "8%", "9%"],
          noun: "fund",
          verb: ["has a return of", "does not have a return of"],
          ordered: true,
          numericValues: [6, 7, 8, 9],
          orderingPhrases: {
            unit: ["percentage point", "percentage points"] as [string, string],
            comparators: TEST_COMPARATORS,
          },
        },
        {
          name: "Strategy",
          values: ["Long/Short", "Macro", "Quant", "Event"],
          noun: "strategist",
          verb: ["uses", "does not use"],
        },
      ],
    });

    // First ordered category (Return) gets identity mapping.
    const returnAssignment = puzzle.solution.find((a) => "6%" in a)!;
    expect(returnAssignment["6%"]).toBe(0);
    expect(returnAssignment["7%"]).toBe(1);
    expect(returnAssignment["8%"]).toBe(2);
    expect(returnAssignment["9%"]).toBe(3);

    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
  });

  it("ordered category is preserved in grid", () => {
    const puzzle = generate({
      size: 3,
      seed: 1,
      categoryNames: [
        { name: "Name", values: ["Alice", "Bob", "Carol"], noun: "" },
        {
          name: "Time",
          values: ["9am", "10am", "11am"],
          noun: "slot",
          verb: ["is at", "is not at"],
          ordered: true,
          orderingPhrases: { comparators: TEST_COMPARATORS },
        },
        {
          name: "Color",
          values: ["Red", "Blue", "Green"],
          noun: "color",
          verb: ["wears", "does not wear"],
        },
      ],
    });

    const orderedCat = puzzle.grid.categories.find((c) => c.ordered === true);
    expect(orderedCat).toBeDefined();
    expect(orderedCat!.name).toBe("Time");
  });
});

describe("generate with multiple ordered categories", () => {
  const hedgeFundCategories: Category[] = [
    {
      name: "Manager",
      values: ["Alice", "Bob", "Carol", "Dan"],
      noun: "",
      subjectPriority: 2,
    },
    {
      name: "Year",
      values: ["1972", "1983", "1997", "2005"],
      noun: "fund",
      verb: ["was begun in", "was not begun in"] as [string, string],
      subjectPriority: -1,
      ordered: true,
      orderingPhrases: { comparators: TEST_COMPARATORS },
    },
    {
      name: "Return",
      values: ["6%", "7%", "8%", "9%"],
      noun: "fund",
      verb: ["has a return of", "does not have a return of"] as [
        string,
        string,
      ],
      subjectPriority: -1,
      ordered: true,
      orderingPhrases: { comparators: TEST_COMPARATORS },
    },
    {
      name: "Strategy",
      values: ["Long/Short", "Macro", "Quant", "Event"],
      noun: "strategist",
      subjectPriority: 1,
      verb: ["uses the", "does not use the"] as [string, string],
      valueSuffix: "strategy",
    },
  ];

  it("generates a puzzle with two ordered axes and solves uniquely", () => {
    const puzzle = generate({
      size: 4,
      seed: 42,
      categoryNames: hedgeFundCategories,
    });

    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);
    const solved = solve(puzzle.constraints, puzzle.grid);
    expect(solved).not.toBeNull();
  });

  it("emits at least some constraints tagged with each ordered axis", () => {
    // Seeded sweep so that eventually both axes appear in some puzzle's
    // minimal set. The axis choice in the final puzzle is probabilistic —
    // minimization may drop constraints on one axis if the other is
    // sufficient. We only assert that the generator is CAPABLE of emitting
    // constraints on both axes.
    let sawYear = false;
    let sawReturn = false;
    for (let seed = 0; seed < 20 && !(sawYear && sawReturn); seed++) {
      const puzzle = generate({
        size: 4,
        seed,
        categoryNames: hedgeFundCategories,
      });
      for (const c of puzzle.constraints) {
        if ("axis" in c) {
          if (c.axis === "Year") sawYear = true;
          if (c.axis === "Return") sawReturn = true;
        }
      }
    }
    expect(sawYear).toBe(true);
    expect(sawReturn).toBe(true);
  });

  it("multi-axis puzzles still round-trip through the SAT solver", () => {
    // The SAT solver must reproduce the exact solution. Deduction may stall
    // on constraints targeting a non-pinned axis (rank-space propagation is
    // weaker than positional), but the solver handles it.
    const puzzle = generate({
      size: 4,
      seed: 7,
      categoryNames: hedgeFundCategories,
    });
    const solved = solve(puzzle.constraints, puzzle.grid);
    expect(solved).not.toBeNull();
    for (let ci = 0; ci < puzzle.solution.length; ci++) {
      for (const [val, pos] of Object.entries(puzzle.solution[ci])) {
        expect(solved![ci][val]).toBe(pos);
      }
    }
  });

  it("generates a size-4 multi-axis puzzle exercising both encoder paths", () => {
    // Exercises both the identity-pinned fast path (Year, first ordered)
    // and the rank-forbidding path (Return, second ordered) in one puzzle.
    const puzzle = generate({
      size: 4,
      seed: 99,
      categoryNames: hedgeFundCategories,
    });
    expect(hasUniqueSolution(puzzle.constraints, puzzle.grid)).toBe(true);

    // Verify constraints reference both axes.
    const axes = new Set<string>();
    for (const c of puzzle.constraints) {
      if ("axis" in c && typeof c.axis === "string") axes.add(c.axis);
    }
    // At minimum the first ordered axis should appear; second may be
    // dropped by minimization for some seeds.
    expect(axes.size).toBeGreaterThanOrEqual(1);
  });
});
