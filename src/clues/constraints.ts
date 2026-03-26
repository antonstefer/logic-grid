import { Constraint } from '../types';

export function sameHouse(a: string, b: string): Constraint {
  return { type: 'same_house', a, b };
}

export function notSameHouse(a: string, b: string): Constraint {
  return { type: 'not_same_house', a, b };
}

export function nextTo(a: string, b: string): Constraint {
  return { type: 'next_to', a, b };
}

export function notNextTo(a: string, b: string): Constraint {
  return { type: 'not_next_to', a, b };
}

export function leftOf(a: string, b: string): Constraint {
  return { type: 'left_of', a, b };
}

export function between(outer1: string, middle: string, outer2: string): Constraint {
  return { type: 'between', outer1, middle, outer2 };
}

export function atPosition(value: string, position: number): Constraint {
  return { type: 'at_position', value, position };
}

export function notAtPosition(value: string, position: number): Constraint {
  return { type: 'not_at_position', value, position };
}
