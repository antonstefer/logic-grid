import Anthropic from "@anthropic-ai/sdk";
import type { AIClient, JSONSchema } from "./types";

/** Default model used when no `model` option is provided. */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

/** Default sampling temperature used when no `temperature` option is provided. */
export const DEFAULT_ANTHROPIC_TEMPERATURE = 0.8;

/** Optional knobs for the default Anthropic-backed client. */
export interface AnthropicClientOptions {
  /** Override the model. Defaults to {@link DEFAULT_ANTHROPIC_MODEL}. */
  model?: string;
  /**
   * Override the sampling temperature. Defaults to
   * {@link DEFAULT_ANTHROPIC_TEMPERATURE}. Use 0 for low-variance (greedy
   * decoding, near-deterministic — minor cross-run variance still possible)
   * verdicts
   * (e.g. validator clients in `translate`).
   */
  temperature?: number;
}

/**
 * Create an AIClient backed by the Anthropic SDK.
 *
 * Uses Claude's tool_use feature for structured JSON output. The Anthropic SDK
 * already retries transport-level errors (429s, 5xx, network) with exponential
 * backoff internally — `generateTheme`'s and `rewriteClues`' own retries only
 * cover semantic validation failures.
 *
 * If no apiKey is provided, the SDK reads from `ANTHROPIC_API_KEY`. Pass a
 * `model` option to swap the underlying Claude model (e.g. `claude-haiku-4-5`
 * for cheaper/faster generation).
 */
export function createAnthropicClient(
  apiKey?: string,
  options: AnthropicClientOptions = {},
): AIClient {
  const client = new Anthropic({ apiKey });
  const model = options.model ?? DEFAULT_ANTHROPIC_MODEL;
  const temperature = options.temperature ?? DEFAULT_ANTHROPIC_TEMPERATURE;

  return {
    async completeJSON<T>(prompt: string, schema: JSONSchema): Promise<T> {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        temperature,
        messages: [{ role: "user", content: prompt }],
        tools: [
          {
            name: "respond",
            description: "Provide the structured JSON result",
            input_schema: schema as Anthropic.Messages.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: "respond" },
      });

      const toolBlock = response.content.find(
        (block) => block.type === "tool_use",
      );
      if (!toolBlock || toolBlock.type !== "tool_use") {
        throw new Error("AI did not return structured output");
      }
      return toolBlock.input as T;
    },
  };
}
