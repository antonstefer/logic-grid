import { it } from "vitest";
import { runBench, runDiversity } from "./profile";

it("benchmark", () => {
  runBench();
}, 120000);

it("constraint diversity", () => {
  runDiversity();
}, 120000);
