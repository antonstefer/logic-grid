/**
 * Benchmark puzzle generation across grid sizes.
 *
 * Usage:
 *   npm run bench            # run via vitest (no build needed)
 *   npm run bench:profile    # build + node --cpu-prof for flamegraph
 *
 * Open .cpuprofile in Chrome DevTools or https://www.speedscope.app.
 */
import { generate } from '../src/index';

const sizes: [number, number][] = [
  [4, 4],
  [6, 6],
  [10, 10],
  [15, 10],
  [20, 10],
  [25, 10],
  [30, 6],
  [50, 4],
];

export function runBench(): void {
  // Warm up JIT
  generate({ size: 10, categories: 6, seed: 1 });

  console.log('size        time');
  console.log('----        ----');
  for (const [size, cats] of sizes) {
    const start = performance.now();
    generate({ size, categories: cats, seed: 42 });
    const ms = performance.now() - start;
    console.log(`${String(size).padStart(2)}x${String(cats).padEnd(2)}   ${ms.toFixed(0).padStart(7)}ms`);
  }
}

// Auto-run when executed directly (node), not when imported (vitest)
const isDirectRun = typeof process !== 'undefined'
  && process.argv[1]?.includes('profile');
if (isDirectRun) runBench();
