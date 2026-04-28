/**
 * Test-only helper. Returns true if any error in the array has the given code.
 * Generic over the code union so passing a foreign code fails type-check.
 */
export function hasCode<C extends string>(
  errors: { code: C }[],
  code: C,
): boolean {
  return errors.some((e) => e.code === code);
}
