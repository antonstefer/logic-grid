import Anthropic from "@anthropic-ai/sdk";
import type { AIClient, JSONSchema } from "./types";

/** Default model used when no `model` option is provided. */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

/**
 * Models that offer server-side refusal fallback. Requests to them opt in;
 * other models don't send the beta parameter, since its behavior there
 * isn't documented. Add models here as Anthropic documents fallback for
 * them.
 */
const FALLBACK_MODELS = new Set([
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-fable-5-1",
  "claude-fable-5",
]);

/**
 * Adapt one of the package's schemas to what structured outputs accept.
 * Every object gets `additionalProperties: false`, and the limits the API
 * doesn't enforce (`minLength`, `maxItems`, `minItems` above 1) move into
 * the description, so the model still sees them and the package's
 * validators still check them. Unlike the SDK's JSON-schema helper, this
 * keeps `enum`, which the API does enforce.
 */
function toStructuredOutputSchema(schema: JSONSchema): Record<string, unknown> {
  const {
    properties,
    items,
    minItems,
    maxItems,
    minLength,
    description,
    ...rest
  } = schema;
  const result: Record<string, unknown> = { ...rest };
  const limits: string[] = [];
  if (minItems !== undefined) {
    if (minItems <= 1) result.minItems = minItems;
    else limits.push(`minItems: ${minItems}`);
  }
  if (maxItems !== undefined) limits.push(`maxItems: ${maxItems}`);
  if (minLength !== undefined) limits.push(`minLength: ${minLength}`);
  const notes = [description, limits.length > 0 && `{${limits.join(", ")}}`]
    .filter(Boolean)
    .join("\n\n");
  if (notes) result.description = notes;
  if (properties) {
    result.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [
        key,
        toStructuredOutputSchema(value),
      ]),
    );
  }
  if (items) result.items = toStructuredOutputSchema(items);
  if (schema.type === "object") result.additionalProperties = false;
  return result;
}

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
 * On models that offer it (Claude Sonnet 5.5, Opus 5.5, Opus 5, Fable 5.1
 * and Fable 5), requests opt into server-side refusal fallback (beta): a
 * request their safety classifiers decline is retried on the model
 * Anthropic recommends for that refusal category, where one exists.
 * `completeJSON` throws when the request is still declined
 * (`stop_reason: "refusal"`), stops before the JSON is complete, or returns
 * JSON that doesn't parse.
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
          // produce — a `translate` call on an 8×8 puzzle returns ~56
          // clues + 64 value labels + 8 category names in one structured
          // JSON, which in verbose locales (German is roughly 1.5× English)
          // can approach 4096 tokens on its own. Every model still served
          // accepts 64000 (Opus 4.1, at 32K, retired in August 2026).
          // Output tokens are billed on actual use, so a higher cap doesn't
          // cost more.
          max_tokens: 64000,
          messages: [{ role: "user", content: prompt }],
          output_config: {
            format: {
              type: "json_schema",
              schema: toStructuredOutputSchema(schema),
            },
            ...(options.effort && { effort: options.effort }),
          },
          ...(FALLBACK_MODELS.has(model) && {
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
      try {
        return JSON.parse(textBlock.text) as T;
      } catch (error) {
        throw new Error(`AI returned malformed JSON: ${String(error)}`);
      }
    },
  };
}
