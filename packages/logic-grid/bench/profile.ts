/**
 * Benchmark puzzle generation across grid sizes.
 *
 * Usage:
 *   npm run bench            # run via vitest (no build needed)
 *   npm run bench:profile    # build + node --cpu-prof for flamegraph
 *
 * Open .cpuprofile in Chrome DevTools or https://www.speedscope.app.
 */
import { generate } from "../src";

const sizes: [number, number][] = [
  [3, 3],
  [4, 4],
  [5, 5],
  [6, 6],
  [8, 8],
];

export function runBench(): void {
  // Warm up JIT
  generate({ size: 4, categories: 4, seed: 1 });

  console.log("size        time");
  console.log("----        ----");
  for (const [size, cats] of sizes) {
    const start = performance.now();
    generate({ size, categories: cats, seed: 42 });
    const ms = performance.now() - start;
    console.log(
      `${String(size).padStart(2)}x${String(cats).padEnd(2)}   ${ms.toFixed(0).padStart(7)}ms`,
    );
  }

  // Per-difficulty timing (4x4, 50 samples each)
  console.log("\n4x4 by difficulty (50 samples)");
  console.log("diff       median    p95");
  console.log("----       ------    ---");
  const samples = 50;
  const diffs = ["easy", "medium", "hard", "expert"] as const;
  for (const diff of diffs) {
    const times: number[] = [];
    let failures = 0;
    for (let seed = 0; seed < samples; seed++) {
      const start = performance.now();
      try {
        generate({ size: 4, categories: 4, difficulty: diff, seed });
      } catch {
        failures++;
      }
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length * 0.5)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const failStr = failures > 0 ? `  (${failures} failed)` : "";
    console.log(
      `${diff.padEnd(10)} ${median.toFixed(1).padStart(6)}ms  ${p95.toFixed(1).padStart(6)}ms${failStr}`,
    );
  }
}

interface SizeStats {
  size: number;
  cats: number;
  avgClues: number;
  avgTypes: number;
  maxType: string;
  maxPct: number;
  types: Map<string, number>;
  totalClues: number;
}

function collectStats(sizes: [number, number][], samples: number): SizeStats[] {
  return sizes.map(([size, cats]) => {
    const types = new Map<string, number>();
    let totalClues = 0;
    let totalDistinct = 0;

    for (let seed = 0; seed < samples; seed++) {
      const puzzle = generate({ size, categories: cats, seed });
      totalClues += puzzle.constraints.length;
      const seen = new Set<string>();
      for (const c of puzzle.constraints) {
        types.set(c.type, (types.get(c.type) ?? 0) + 1);
        seen.add(c.type);
      }
      totalDistinct += seen.size;
    }

    const maxEntry = [...types.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      size,
      cats,
      avgClues: totalClues / samples,
      avgTypes: totalDistinct / samples,
      maxType: maxEntry[0],
      maxPct: (maxEntry[1] / totalClues) * 100,
      types,
      totalClues,
    };
  });
}

export function runDiversity(): void {
  const samples = 20;
  const sizes: [number, number][] = [
    [3, 3],
    [4, 4],
    [5, 5],
    [5, 4],
    [6, 6],
  ];

  const stats = collectStats(sizes, samples);

  // Per-size detail
  for (const s of stats) {
    console.log(
      `\n${s.size}x${s.cats}  avg ${s.avgClues.toFixed(1)} clues, ${s.avgTypes.toFixed(1)} types, max ${s.maxType} ${s.maxPct.toFixed(0)}%`,
    );
    const sorted = [...s.types.entries()].sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sorted) {
      const avg = (count / samples).toFixed(1);
      const pct = ((count / s.totalClues) * 100).toFixed(0);
      console.log(
        `  ${type.padEnd(18)} ${avg.padStart(5)} avg  ${pct.padStart(3)}%`,
      );
    }
  }

  // Summary table
  console.log(`\n--- Summary (${samples} puzzles per size) ---`);
  console.log("size   clues  types  max type          max %");
  console.log("----   -----  -----  --------          -----");
  for (const s of stats) {
    console.log(
      `${s.size}x${s.cats}   ${s.avgClues.toFixed(1).padStart(5)}  ${s.avgTypes.toFixed(1).padStart(5)}  ${s.maxType.padEnd(18)}${s.maxPct.toFixed(0).padStart(3)}%`,
    );
  }

  // Overall averages
  const avgClues = stats.reduce((a, s) => a + s.avgClues, 0) / stats.length;
  const avgTypes = stats.reduce((a, s) => a + s.avgTypes, 0) / stats.length;
  const avgMaxPct = stats.reduce((a, s) => a + s.maxPct, 0) / stats.length;
  console.log(
    `avg    ${avgClues.toFixed(1).padStart(5)}  ${avgTypes.toFixed(1).padStart(5)}  ${"".padEnd(18)}${avgMaxPct.toFixed(0).padStart(3)}%`,
  );

  // Cross-size type averages
  const globalTypes = new Map<string, number>();
  let globalClues = 0;
  const totalSamples = samples * stats.length;
  for (const s of stats) {
    globalClues += s.totalClues;
    for (const [type, count] of s.types) {
      globalTypes.set(type, (globalTypes.get(type) ?? 0) + count);
    }
  }
  console.log("\n--- Avg clues per type (across all sizes) ---");
  const sortedGlobal = [...globalTypes.entries()].sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedGlobal) {
    const avg = (count / totalSamples).toFixed(1);
    const pct = ((count / globalClues) * 100).toFixed(0);
    console.log(
      `  ${type.padEnd(18)} ${avg.padStart(5)} avg  ${pct.padStart(3)}%`,
    );
  }
}

// Auto-run when executed directly (node), not when imported (vitest)
const isDirectRun =
  typeof process !== "undefined" && process.argv[1]?.includes("profile");
if (isDirectRun) runBench();
