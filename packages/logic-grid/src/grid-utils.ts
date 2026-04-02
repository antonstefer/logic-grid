import type { Category, Grid } from "./types";

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

/** Find the position category (isPosition: true), if any. */
export function findPositionCategory(grid: Grid): Category | undefined {
  return grid.categories.find((c) => c.isPosition);
}

/**
 * Human-readable position label. Returns the position category's value at that
 * index (e.g. "7am") when one exists, or "the first house" otherwise.
 */
export function positionLabel(position: number, grid: Grid): string {
  const posCat = findPositionCategory(grid);
  if (posCat) return posCat.values[position];
  return `the ${ordinal(position)} ${posNoun(grid)}`;
}

/**
 * Compute which position pairs satisfy a given value distance using the
 * position category's numericValues. Returns pairs as [p1, p2] where p1 < p2.
 * Falls back to position-based distance when no numericValues are defined.
 */
export function getDistancePairs(
  grid: Grid,
  distance: number,
): [number, number][] {
  const posCat = findPositionCategory(grid);
  const numVals = posCat?.numericValues;
  const n = grid.size;
  const pairs: [number, number][] = [];

  if (numVals) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(numVals[i] - numVals[j]) === distance) {
          pairs.push([i, j]);
        }
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      if (i + distance < n) {
        pairs.push([i, i + distance]);
      }
    }
  }

  return pairs;
}
