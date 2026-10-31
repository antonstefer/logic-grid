import { vi } from "vitest";

/**
 * Imports server code as if `ANTHROPIC_API_KEY` were `key`.
 *
 * SvelteKit reads `$app/env/private` once, when the module loads, so a test
 * can't change the key afterwards. This clears the module registry and mocks
 * the env module with `key`, then runs `load`, which should import the module
 * under test.
 */
export async function importWithApiKey<T>(
  key: string | undefined,
  load: () => Promise<T>,
): Promise<T> {
  vi.resetModules();
  vi.doMock("$app/env/private", () => ({ ANTHROPIC_API_KEY: key }));
  return load();
}
