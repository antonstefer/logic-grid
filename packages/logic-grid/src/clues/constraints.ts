import type { Constraint } from "../types";

/** `a` and `b` are at the same position. */
export function samePosition(a: string, b: string): Constraint {
  return { type: "same_position", a, b };
}

/** `a` and `b` are at different positions. */
export function notSamePosition(a: string, b: string): Constraint {
  return { type: "not_same_position", a, b };
}

/** `a` and `b` have adjacent ranks on `axis`. */
export function nextTo(a: string, b: string, axis: string): Constraint {
  return { type: "next_to", a, b, axis };
}

/** `a` and `b` do not have adjacent ranks on `axis`. */
export function notNextTo(a: string, b: string, axis: string): Constraint {
  return { type: "not_next_to", a, b, axis };
}

/** `a`'s rank on `axis` is exactly one less than `b`'s. */
export function leftOf(a: string, b: string, axis: string): Constraint {
  return { type: "left_of", a, b, axis };
}

/** `middle`'s rank on `axis` is strictly between `outer1` and `outer2`. */
export function between(
  outer1: string,
  middle: string,
  outer2: string,
  axis: string,
): Constraint {
  return { type: "between", outer1, middle, outer2, axis };
}

/** `middle`'s rank on `axis` is NOT strictly between `outer1` and `outer2`. */
export function notBetween(
  outer1: string,
  middle: string,
  outer2: string,
  axis: string,
): Constraint {
  return { type: "not_between", outer1, middle, outer2, axis };
}

/** `a`'s rank on `axis` is strictly less than `b`'s. */
export function before(a: string, b: string, axis: string): Constraint {
  return { type: "before", a, b, axis };
}

/** `a` and `b` are exactly `distance` apart on `axis` (rank steps, or numericValues units when present). */
export function exactDistance(
  a: string,
  b: string,
  distance: number,
  axis: string,
): Constraint {
  return { type: "exact_distance", a, b, distance, axis };
}

/** `value` is at the given 0-indexed row position. */
export function atPosition(value: string, position: number): Constraint {
  return { type: "at_position", value, position };
}

/** `value` is not at the given 0-indexed row position. */
export function notAtPosition(value: string, position: number): Constraint {
  return { type: "not_at_position", value, position };
}
