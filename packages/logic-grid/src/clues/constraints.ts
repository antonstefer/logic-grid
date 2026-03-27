import type { Constraint } from "../types";

/** `a` and `b` are at the same position. */
export function sameHouse(a: string, b: string): Constraint {
  return { type: "same_house", a, b };
}

/** `a` and `b` are at different positions. */
export function notSameHouse(a: string, b: string): Constraint {
  return { type: "not_same_house", a, b };
}

/** `a` and `b` are at adjacent positions. */
export function nextTo(a: string, b: string): Constraint {
  return { type: "next_to", a, b };
}

/** `a` and `b` are not adjacent. */
export function notNextTo(a: string, b: string): Constraint {
  return { type: "not_next_to", a, b };
}

/** `a` is immediately left of `b` (position of `a` = position of `b` - 1). */
export function leftOf(a: string, b: string): Constraint {
  return { type: "left_of", a, b };
}

/** `middle` is strictly between `outer1` and `outer2`. */
export function between(
  outer1: string,
  middle: string,
  outer2: string,
): Constraint {
  return { type: "between", outer1, middle, outer2 };
}

/** `middle` is NOT between `outer1` and `outer2`. */
export function notBetween(
  outer1: string,
  middle: string,
  outer2: string,
): Constraint {
  return { type: "not_between", outer1, middle, outer2 };
}

/** `a` is somewhere to the left of `b` (not necessarily adjacent). */
export function before(a: string, b: string): Constraint {
  return { type: "before", a, b };
}

/** `a` and `b` are exactly `distance` positions apart. */
export function exactDistance(
  a: string,
  b: string,
  distance: number,
): Constraint {
  return { type: "exact_distance", a, b, distance };
}

/** `value` is at the given 0-indexed position. */
export function atPosition(value: string, position: number): Constraint {
  return { type: "at_position", value, position };
}

/** `value` is not at the given 0-indexed position. */
export function notAtPosition(value: string, position: number): Constraint {
  return { type: "not_at_position", value, position };
}
