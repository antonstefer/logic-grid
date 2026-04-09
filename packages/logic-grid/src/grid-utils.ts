import type { Grid } from "./types";

export const ORDINALS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
];

export function ordinal(position: number): string {
  const o = ORDINALS[position];
  if (!o) throw new Error(`Position ${position} out of supported range (0–7)`);
  return o;
}

export function posNoun(grid: Grid): string {
  const noun = grid.positionNoun[0];
  if (!noun) throw new RangeError("positionNoun singular must be non-empty");
  return noun;
}
export function posNounPlural(grid: Grid): string {
  const noun = grid.positionNoun[1];
  if (!noun) throw new RangeError("positionNoun plural must be non-empty");
  return noun;
}
export function posPrep(grid: Grid): string {
  const prep = grid.positionPreposition;
  if (!prep) throw new RangeError("positionPreposition must be non-empty");
  return prep;
}
