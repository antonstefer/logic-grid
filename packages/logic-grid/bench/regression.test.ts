/**
 * Regression assertions for puzzle generation. Runs as part of `npm run bench`
 * (vitest.bench.ts config), not the main test suite — exercising 50+ puzzles
 * per (size, difficulty) is too slow for the standard `check` loop.
 *
 * Three layers:
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
import { EASY_TYPES, HARD_ONLY_TYPES, MEDIUM_TYPES } from "../src/difficulty";
import type { ConstraintType, Difficulty } from "../src/types";

const SAMPLES = 50;

interface Sample {
  seed: number;
  puzzle: ReturnType<typeof generate>;
}

function generateMany(
  size: number,
  categories: number,
  difficulty: Difficulty,
  count: number,
): Sample[] {
  const out: Sample[] = [];
  for (let seed = 0; seed < count; seed++) {
    out.push({
      seed,
      puzzle: generate({ size, categories, difficulty, seed }),
    });
  }
  return out;
}

describe("difficulty contract", () => {
  it("easy puzzles use only EASY_TYPES", () => {
    for (const { seed, puzzle } of generateMany(4, 4, "easy", SAMPLES)) {
      for (const c of puzzle.constraints) {
        expect(
          EASY_TYPES.has(c.type),
          `seed=${seed}: ${c.type} not in EASY_TYPES`,
        ).toBe(true);
      }
    }
  });

  it("medium puzzles use only MEDIUM_TYPES, with at least one type beyond EASY_TYPES", () => {
    for (const { seed, puzzle } of generateMany(4, 4, "medium", SAMPLES)) {
      let hasMediumOnly = false;
      for (const c of puzzle.constraints) {
        expect(
          MEDIUM_TYPES.has(c.type),
          `seed=${seed}: ${c.type} not in MEDIUM_TYPES`,
        ).toBe(true);
        if (!EASY_TYPES.has(c.type)) hasMediumOnly = true;
      }
      expect(
        hasMediumOnly,
        `seed=${seed}: medium puzzle has no type beyond EASY_TYPES`,
      ).toBe(true);
    }
  });

  it("hard puzzles include at least one type outside MEDIUM_TYPES", () => {
    for (const { seed, puzzle } of generateMany(4, 4, "hard", SAMPLES)) {
      const hasHardOnly = puzzle.constraints.some(
        (c) => !MEDIUM_TYPES.has(c.type),
      );
      expect(
        hasHardOnly,
        `seed=${seed}: hard puzzle has no type outside MEDIUM_TYPES`,
      ).toBe(true);
    }
  });

  it("expert puzzles need contradiction (or fail to fully deduce)", () => {
    for (const { seed, puzzle } of generateMany(4, 4, "expert", SAMPLES)) {
      const result = deduce(puzzle.constraints, puzzle.grid);
      const requiresContradiction =
        !result.complete ||
        result.steps.some((s) => s.technique === "contradiction");
      expect(
        requiresContradiction,
        `seed=${seed}: expert puzzle solvable without contradiction`,
      ).toBe(true);
    }
  });
});

describe("constraint diversity", () => {
  it("every documented hard-only constraint type is reachable from hard generation", () => {
    // Across SAMPLES hard puzzles, each hard-only type should appear at least
    // once. Catches a regression that silently drops a type.
    const samples = generateMany(4, 4, "hard", SAMPLES);
    const seen = new Set<ConstraintType>();
    for (const { puzzle } of samples) {
      for (const c of puzzle.constraints) {
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
      const samples = generateMany(4, 4, difficulty, SAMPLES);
      const counts = new Map<ConstraintType, number>();
      let total = 0;
      for (const { puzzle } of samples) {
        for (const c of puzzle.constraints) {
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
    for (const { seed, puzzle } of generateMany(4, 4, "medium", SAMPLES)) {
      expect(puzzle.constraints.length, `seed=${seed}`).toBeGreaterThanOrEqual(
        3,
      );
      expect(puzzle.constraints.length, `seed=${seed}`).toBeLessThanOrEqual(15);
    }
  });
});

describe("performance budgets", () => {
  // Budgets are intentionally ~50-100× current measured values so shared-runner
  // variance doesn't cause flakes. They're tuned to catch order-of-magnitude
  // regressions, not micro-regressions. Earlier `describe` blocks have already
  // run hundreds of generations by the time we get here, so JIT is warm.
  const sizeBudgets: { size: number; medianMs: number; runs: number }[] = [
    { size: 3, medianMs: 30, runs: 10 },
    { size: 4, medianMs: 50, runs: 10 },
    { size: 5, medianMs: 100, runs: 10 },
    { size: 6, medianMs: 250, runs: 5 },
    { size: 7, medianMs: 600, runs: 5 },
    { size: 8, medianMs: 1200, runs: 5 },
  ];

  for (const { size, medianMs, runs } of sizeBudgets) {
    it(`generates ${size}×${size} puzzles within ${medianMs}ms (median of ${runs})`, () => {
      const times: number[] = [];
      for (let seed = 0; seed < runs; seed++) {
        const t0 = performance.now();
        generate({ size, categories: size, seed });
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      // Upper-middle for even N (matches profile.ts) — slightly conservative
      // versus the strict (5th + 6th) / 2 average. Bumping `runs` is the
      // first lever to pull if this gets noisy on shared runners.
      const median = times[Math.floor(times.length / 2)];
      expect(median).toBeLessThanOrEqual(medianMs);
    });
  }
});
