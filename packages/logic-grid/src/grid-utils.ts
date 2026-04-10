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
