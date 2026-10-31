/**
 * Thrown when a required environment variable is unset. Endpoints should
 * catch this and return 503 with a clear message pointing operators at the
 * missing variable.
 */
export class MissingEnvError extends Error {
  readonly variable: string;

  constructor(variable: string) {
    super(`Missing required environment variable: ${variable}`);
    this.name = "MissingEnvError";
    this.variable = variable;
  }
}
