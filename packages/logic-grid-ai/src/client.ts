import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import type { AIClient, JSONSchema } from "./types";

/** Default model used when no `model` option is provided. */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

/** Effort levels accepted by {@link AnthropicClientOptions.effort}. */
export type AnthropicEffort = NonNullable<
  Anthropic.Messages.OutputConfig["effort"]
>;

/** Optional knobs for the default Anthropic-backed client. */
export interface AnthropicClientOptions {
  /** Override the model. Defaults to {@link DEFAULT_ANTHROPIC_MODEL}. */
  model?: string;
  /**
   * How much the model thinks before answering, sent as
   * `output_config.effort`. Higher levels trade latency and output tokens
   * for more deliberate answers (e.g. for a validator client in
   * `translate`). Omit it to use the model's default. Not every model
   * accepts every level, and Claude Haiku 4.5 accepts none.
   */
  effort?: AnthropicEffort;
}

/**
 * Create an AIClient backed by the Anthropic SDK.
 *
 * Uses structured outputs (`output_config.format`), so the response is JSON
 * matching the schema. Keywords the API can't enforce (such as `maxItems`,
 * `minLength`, or `minItems` above 1) move into the field descriptions; the
 * package's validators still check them. The Anthropic SDK already retries
 * transport-level errors (429s, 5xx, network) with exponential backoff
 * internally — `generateTheme`'s and `rewriteClues`' own retries only cover
 * semantic validation failures. Requests stream with a 64K `max_tokens`, so
 * thinking has room at any `effort`; every current model accepts that cap.
 *
 * If no apiKey is provided, the SDK resolves credentials from the
 * environment, `ANTHROPIC_API_KEY` first. Pass a `model` option to swap the
 * underlying Claude model (e.g. `claude-haiku-5-5` for cheaper/faster
 * generation).
 *
 * On {@link DEFAULT_ANTHROPIC_MODEL}, requests opt into server-side refusal
 * fallback (beta): a request its safety classifiers decline is retried on
 * the model Anthropic recommends for that refusal category, where one
 * exists. `completeJSON` throws when the request is still declined
 * (`stop_reason: "refusal"`) or stops before the JSON is complete.
 */
export function createAnthropicClient(
  apiKey?: string,
  options: AnthropicClientOptions = {},
): AIClient {
  const client = new Anthropic({ apiKey });
  const model = options.model ?? DEFAULT_ANTHROPIC_MODEL;

  return {
    async completeJSON<T>(prompt: string, schema: JSONSchema): Promise<T> {
      // Streamed, so the generous cap below doesn't run into the SDK's
      // limit for non-streaming requests (~21K tokens).
      const response = await client.beta.messages
        .stream({
          model,
          // 64000 tokens leaves room for thinking, which counts toward the
          // cap and grows with `effort`, on top of the heaviest output we
          // produce — a `translate` call on an 8×8 puzzle returns ~56 clues +
          // 64 value labels + 8 category names in one structured JSON, which
          // in verbose locales (German is roughly 1.5× English) can approach
          // 4096 tokens on its own. Output tokens are billed on actual use,
          // so a higher cap doesn't cost more.
          max_tokens: 64000,
          messages: [{ role: "user", content: prompt }],
          output_config: {
            format: {
              type: "json_schema",
              // The SDK helper adapts the schema to what structured outputs
              // accept: `additionalProperties: false` on every object, and
              // unsupported keywords moved into descriptions. The package's
              // schemas are all objects at the top level.
              schema: jsonSchemaOutputFormat(schema as { type: "object" })
                .schema,
            },
            ...(options.effort && { effort: options.effort }),
          },
          // Server-side fallback is only documented for current models, so it
          // stays limited to the default rather than any model a caller picks.
          ...(model === DEFAULT_ANTHROPIC_MODEL && {
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          }),
        })
        .finalMessage();

      if (response.stop_reason === "refusal") {
        throw new Error(
          `AI declined the request (refusal category: ${response.stop_details?.category ?? "unspecified"})`,
        );
      }
      if (response.stop_reason !== "end_turn") {
        throw new Error(
          `AI stopped before completing the JSON (stop_reason: ${response.stop_reason})`,
        );
      }
      const textBlock = response.content.find(
        (block): block is Anthropic.Beta.BetaTextBlock => block.type === "text",
      );
      if (!textBlock) {
        throw new Error("AI did not return structured output");
      }
      return JSON.parse(textBlock.text) as T;
    },
  };
}
