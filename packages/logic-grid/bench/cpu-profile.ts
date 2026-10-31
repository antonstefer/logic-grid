/**
 * Entry point for `npm run bench:profile`, which bundles this file and runs it
 * under `node --cpu-prof`. The benchmark itself lives in profile.ts, so the
 * vitest bench suite can import it without running it.
 */
import { runBench } from "./profile";

runBench();
