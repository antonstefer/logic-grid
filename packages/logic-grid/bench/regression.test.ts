/**
 * Regression assertions for puzzle generation. Runs as part of `npm run bench`
 * (vitest.bench.ts config), not the main test suite — exercising 50+ puzzles
 * per (size, difficulty) is too slow for the standard `check` loop.
 *
 * Two layers:
 *   1. Difficulty contract — directly mirrors EASY_TYPES / MEDIUM_TYPES from
 *      difficulty.ts and the deduce-based expert promotion. Guarantees the
 *      generator never silently leaks a higher-tier constraint into a lower
 *      tier (or vice versa).
 *   2. Diversity sanity — catches degenerate generation (a single type
 *      dominating, or a documented type silently dropped).
 *   3. Perf budgets — ~50-100× current real values; calibrated to absorb
 *      shared-runner variance while still flagging an order-of-magnitude
 *      regression.
 */
import { describe, it, expect } from "vitest";
import { generate } from "../src";
import { deduce } from "../src/deduce";
import { EASY_TYPES, MEDIUM_TYPES } from "../src/difficulty";
import type { ConstraintType, Difficulty } from "../src/types";

const HARD_ONLY_TYPES: ConstraintType[] = [
  "between",
  "not_between",
  "not_next_to",
  "exact_distance",
];

const SAMPLES = 50;

function generateMany(
  size: number,
  categories: number,
  difficulty: Difficulty,
  count: number,
): ReturnType<typeof generate>[] {
  const out: ReturnType<typeof generate>[] = [];
  for (let seed = 0; seed < count; seed++) {
    out.push(generate({ size, categories, difficulty, seed }));
  }
  return out;
}

describe("difficulty contract", () => {
  it("easy puzzles use only EASY_TYPES", () => {
    const puzzles = generateMany(4, 4, "easy", SAMPLES);
    for (const p of puzzles) {
      for (const c of p.constraints) {
        expect(EASY_TYPES.has(c.type)).toBe(true);
      }
    }
  });

  it("medium puzzles use only MEDIUM_TYPES, with at least one type beyond EASY_TYPES", () => {
    const puzzles = generateMany(4, 4, "medium", SAMPLES);
    for (const p of puzzles) {
      let hasMediumOnly = false;
      for (const c of p.constraints) {
        expect(MEDIUM_TYPES.has(c.type)).toBe(true);
        if (!EASY_TYPES.has(c.type)) hasMediumOnly = true;
      }
      expect(hasMediumOnly).toBe(true);
    }
  });

  it("hard puzzles include at least one type outside MEDIUM_TYPES", () => {
    const puzzles = generateMany(4, 4, "hard", SAMPLES);
    for (const p of puzzles) {
      const hasHardOnly = p.constraints.some((c) => !MEDIUM_TYPES.has(c.type));
      expect(hasHardOnly).toBe(true);
    }
  });

  it("expert puzzles need contradiction (or fail to fully deduce)", () => {
    const puzzles = generateMany(4, 4, "expert", SAMPLES);
    for (const p of puzzles) {
      const result = deduce(p.constraints, p.grid);
      const requiresContradiction =
        !result.complete ||
        result.steps.some((s) => s.technique === "contradiction");
      expect(requiresContradiction).toBe(true);
    }
  });
});

describe("constraint diversity", () => {
  it("every documented hard-only constraint type is reachable from hard generation", () => {
    // Across SAMPLES hard puzzles, each of the 4 hard-only types should appear
    // at least once. Catches a regression that silently drops a type.
    const puzzles = generateMany(4, 4, "hard", SAMPLES);
    const seen = new Set<ConstraintType>();
    for (const p of puzzles) {
      for (const c of p.constraints) {
        if (!MEDIUM_TYPES.has(c.type)) seen.add(c.type);
      }
    }
    for (const type of HARD_ONLY_TYPES) {
      expect
        .soft(seen.has(type), `hard-only type ${type} never appeared`)
        .toBe(true);
    }
  });

  it("no single constraint type dominates > 80% of clues at medium/hard/expert", () => {
    // Easy is excluded — EASY_TYPES has only 2 entries, so dominance by
    // same_position is structural, not a bug.
    const difficulties: Difficulty[] = ["medium", "hard", "expert"];
    for (const difficulty of difficulties) {
      const puzzles = generateMany(4, 4, difficulty, SAMPLES);
      const counts = new Map<ConstraintType, number>();
      let total = 0;
      for (const p of puzzles) {
        for (const c of p.constraints) {
          counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
          total++;
        }
      }
      for (const [type, count] of counts) {
        const pct = (count / total) * 100;
        expect
          .soft(pct, `${difficulty}: ${type} is ${pct.toFixed(0)}% of clues`)
          .toBeLessThanOrEqual(80);
      }
    }
  });

  it("4×4 medium puzzles have a sane clue count", () => {
    const puzzles = generateMany(4, 4, "medium", SAMPLES);
    for (const p of puzzles) {
      expect(p.constraints.length).toBeGreaterThanOrEqual(3);
      expect(p.constraints.length).toBeLessThanOrEqual(15);
    }
  });
});

describe("performance budgets", () => {
  // Budgets are intentionally ~50-100× current measured values so shared-runner
  // variance doesn't cause flakes. They're tuned to catch order-of-magnitude
  // regressions, not micro-regressions.
  const sizeBudgets: { size: number; medianMs: number; runs: number }[] = [
    { size: 3, medianMs: 30, runs: 10 },
    { size: 4, medianMs: 50, runs: 10 },
    { size: 5, medianMs: 100, runs: 10 },
    { size: 6, medianMs: 250, runs: 5 },
    { size: 7, medianMs: 600, runs: 5 },
    { size: 8, medianMs: 1200, runs: 5 },
  ];

  // Warm-up to avoid measuring JIT compile of the first generation.
  generate({ size: 4, categories: 4, seed: 1 });

  for (const { size, medianMs, runs } of sizeBudgets) {
    it(`generates ${size}×${size} puzzles within ${medianMs}ms (median of ${runs})`, () => {
      const times: number[] = [];
      for (let seed = 0; seed < runs; seed++) {
        const t0 = performance.now();
        generate({ size, categories: size, seed });
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      const median = times[Math.floor(times.length / 2)];
      expect(median).toBeLessThanOrEqual(medianMs);
    });
  }
});
