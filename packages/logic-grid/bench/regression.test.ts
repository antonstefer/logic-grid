/**
 * Regression assertions for puzzle generation. Runs as part of `npm run bench`
 * (vitest.bench.ts config), not the main test suite — exercising 50+ puzzles
 * per (size, difficulty) is too slow for the standard `check` loop.
 *
 * Three layers:
 *   1. Difficulty contract — uses typesUpToTier / typesAtTier from difficulty.ts
 *      and the deduce-based expert promotion. Guarantees the generator never
 *      silently leaks a higher-tier constraint into a lower tier (or vice versa).
 *   2. Diversity sanity — catches degenerate generation (a single type
 *      dominating, or a documented type silently dropped).
 *   3. Perf budgets — ~50-100× current real values; calibrated to absorb
 *      shared-runner variance while still flagging an order-of-magnitude
 *      regression.
 */
import { beforeAll, describe, it, expect } from "vitest";
import { generate } from "../src";
import { deduce } from "../src/deduce";
import { typesAtTier, typesUpToTier } from "../src/difficulty";
import type { ConstraintType, Difficulty } from "../src/types";

// File-local aliases — they shadow nothing in the package; the helper calls
// happen once at module load. Names deliberately avoid the legacy
// EASY_TYPES / MEDIUM_TYPES / HARD_ONLY_TYPES exports (which no longer exist)
// so a future grep lands on these helper calls rather than a stale reference.
const allowedAtEasy = typesUpToTier("easy");
const allowedAtMedium = typesUpToTier("medium");
const hardOnly = typesAtTier("hard");

/** True when the deduction trace requires backtracking via contradiction
 *  (or never completes). Mirrors classify()'s expert-promotion rule. */
function isExpertSolution(puzzle: ReturnType<typeof generate>): boolean {
  const result = deduce(puzzle.constraints, puzzle.grid);
  return (
    !result.complete ||
    result.steps.some((s) => s.technique === "contradiction")
  );
}

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
  it("easy puzzles only use types allowed at easy and don't quietly need expert deduction", () => {
    for (const { seed, puzzle } of generateMany(4, 4, "easy", SAMPLES)) {
      for (const c of puzzle.constraints) {
        expect(
          allowedAtEasy.has(c.type),
          `seed=${seed}: ${c.type} not allowed at easy`,
        ).toBe(true);
      }
      expect(
        isExpertSolution(puzzle),
        `seed=${seed}: easy puzzle silently requires expert deduction`,
      ).toBe(false);
    }
  });

  it("medium puzzles only use types allowed at medium (with at least one beyond easy) and don't quietly need expert deduction", () => {
    for (const { seed, puzzle } of generateMany(4, 4, "medium", SAMPLES)) {
      let hasMediumOnly = false;
      for (const c of puzzle.constraints) {
        expect(
          allowedAtMedium.has(c.type),
          `seed=${seed}: ${c.type} not allowed at medium`,
        ).toBe(true);
        if (!allowedAtEasy.has(c.type)) hasMediumOnly = true;
      }
      expect(
        hasMediumOnly,
        `seed=${seed}: medium puzzle has no type beyond the easy tier`,
      ).toBe(true);
      expect(
        isExpertSolution(puzzle),
        `seed=${seed}: medium puzzle silently requires expert deduction`,
      ).toBe(false);
    }
  });

  it("hard puzzles include a hard-only type and don't quietly need expert deduction", () => {
    for (const { seed, puzzle } of generateMany(4, 4, "hard", SAMPLES)) {
      const hasHardOnly = puzzle.constraints.some(
        (c) => !allowedAtMedium.has(c.type),
      );
      expect(
        hasHardOnly,
        `seed=${seed}: hard puzzle has no type beyond the medium tier`,
      ).toBe(true);
      expect(
        isExpertSolution(puzzle),
        `seed=${seed}: hard puzzle silently requires expert deduction`,
      ).toBe(false);
    }
  });

  it("expert puzzles need contradiction (or fail to fully deduce)", () => {
    for (const { seed, puzzle } of generateMany(4, 4, "expert", SAMPLES)) {
      expect(
        isExpertSolution(puzzle),
        `seed=${seed}: expert puzzle solvable without contradiction`,
      ).toBe(true);
    }
  });
});

describe("constraint diversity", () => {
  it("every hard-only type appears across 50 seeds at 4×4 hard", () => {
    // NOT a reachability claim — only "we hit each type with these particular
    // 50 seeds at 4×4." A regression here can mean (a) the generator dropped
    // a type, or (b) the seed-to-type distribution shifted enough that none
    // of seeds 0..49 happen to land on the missing type.
    const samples = generateMany(4, 4, "hard", SAMPLES);
    const seen = new Set<ConstraintType>();
    for (const { puzzle } of samples) {
      for (const c of puzzle.constraints) {
        if (!allowedAtMedium.has(c.type)) seen.add(c.type);
      }
    }
    for (const type of hardOnly) {
      expect
        .soft(seen.has(type), `hard-only type ${type} never appeared`)
        .toBe(true);
    }
  });

  it("no single constraint type dominates > 80% of clues at medium/hard/expert", () => {
    // Easy is excluded — only 2 types allowed at easy, so dominance by
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
  // regressions, not micro-regressions.
  beforeAll(() => {
    // Warm JIT locally so the 3×3 budget doesn't flake from cold-start cost
    // if this describe block ever runs first. Don't rely on earlier describes.
    generate({ size: 4, categories: 4, seed: 0 });
  });
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
