/**
 * Thrown by {@link requireEnv} when a required environment variable is missing
 * or empty. Endpoints should catch this and return 503 with a clear message
 * pointing operators at the missing variable.
 */
export class MissingEnvError extends Error {
  readonly code = "missing_env" as const;
  readonly variable: string;

  constructor(variable: string) {
    super(`Missing required environment variable: ${variable}`);
    this.name = "MissingEnvError";
    this.variable = variable;
  }
}

/**
 * Return the value of `name` or throw {@link MissingEnvError} if it is undefined
 * or empty. Use at the start of any handler that depends on a server-side env
 * variable so the failure surfaces with a clear, actionable message instead of
 * a generic 500.
 */
export function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new MissingEnvError(name);
  }
  return value;
}
