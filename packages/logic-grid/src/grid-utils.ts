import type { Grid } from "./types";

export function posNoun(grid: Grid): string {
  return grid.positionNoun?.[0] ?? "house";
}
export function posNounPlural(grid: Grid): string {
  return grid.positionNoun?.[1] ?? "houses";
}
export function posPrep(grid: Grid): string {
  return grid.positionPreposition ?? "in";
}
