import type { Grid } from "./types";

export function posNoun(grid: Grid): string {
  const noun = grid.positionNoun?.[0];
  if (noun !== undefined && !noun)
    throw new RangeError("positionNoun singular must be non-empty");
  return noun ?? "house";
}
export function posNounPlural(grid: Grid): string {
  const noun = grid.positionNoun?.[1];
  if (noun !== undefined && !noun)
    throw new RangeError("positionNoun plural must be non-empty");
  return noun ?? "houses";
}
export function posPrep(grid: Grid): string {
  const prep = grid.positionPreposition;
  if (prep !== undefined && !prep)
    throw new RangeError("positionPreposition must be non-empty");
  return prep ?? "in";
}
