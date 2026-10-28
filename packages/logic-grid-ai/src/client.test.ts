import { describe, it, expect, vi, beforeEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient } from "./client";

const mockStream = vi.fn<
  (params: Anthropic.Beta.Messages.MessageCreateParams) => {
    finalMessage(): Promise<unknown>;
  }
>();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    readonly beta = { messages: { stream: mockStream } };
  },
}));

/** Make the next request's stream end with `message`. */
function respondWith(message: unknown) {
  mockStream.mockReturnValueOnce({
    finalMessage: () => Promise.resolve(message),
  });
}

/** A finished structured-output response carrying `value` as JSON. */
function jsonResponse(value: unknown) {
  return {
    stop_reason: "end_turn",
    stop_details: null,
    content: [{ type: "text", text: JSON.stringify(value) }],
  };
}

beforeEach(() => {
  mockStream.mockReset();
});

describe("createAnthropicClient", () => {
  it("requests structured output and parses the JSON text block", async () => {
    respondWith({
      stop_reason: "end_turn",
      stop_details: null,
      // Models that think by default put thinking blocks before the text.
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: '{"answer":42}' },
      ],
    });

    const client = createAnthropicClient("test-key");
    const result = await client.completeJSON<{ answer: number }>(
      "test prompt",
      { type: "object", properties: { answer: { type: "number" } } },
    );

    expect(result).toEqual({ answer: 42 });
    expect(mockStream).toHaveBeenCalledWith({
      model: "claude-sonnet-5-5",
      max_tokens: 64000,
      messages: [{ role: "user", content: "test prompt" }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { answer: { type: "number" } },
            additionalProperties: false,
          },
        },
      },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  });

  it("reads the JSON after a fallback block", async () => {
    respondWith({
      stop_reason: "end_turn",
      stop_details: null,
      // A request the default model declined, served by its fallback.
      content: [
        {
          type: "fallback",
          from: { model: "claude-sonnet-5-5" },
          to: { model: "claude-sonnet-5" },
        },
        { type: "text", text: '{"answer":42}' },
      ],
    });

    const client = createAnthropicClient();
    const result = await client.completeJSON<{ answer: number }>("test", {
      type: "object",
    });

    expect(result).toEqual({ answer: 42 });
  });

  it("keeps keywords structured outputs reject out of the request", async () => {
    respondWith(jsonResponse({ clues: ["a", "b"] }));

    const client = createAnthropicClient();
    await client.completeJSON("test", {
      type: "object",
      properties: {
        clues: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 2,
          maxItems: 2,
        },
      },
    });

    const sent = JSON.stringify(mockStream.mock.calls[0][0].output_config);
    expect(sent).not.toContain('"minLength"');
    expect(sent).not.toContain('"minItems"');
    expect(sent).not.toContain('"maxItems"');
  });

  it("adapts the schema for structured outputs, keeping enum", async () => {
    respondWith(jsonResponse({ verdicts: [] }));

    await createAnthropicClient().completeJSON("test", {
      type: "object",
      description: "Verdicts",
      properties: {
        verdicts: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["before", "not_between"] },
              note: { type: "string", minLength: 1, description: "Why" },
            },
            required: ["kind"],
          },
        },
      },
      required: ["verdicts"],
    });

    expect(mockStream.mock.calls[0][0].output_config?.format?.schema).toEqual({
      type: "object",
      description: "Verdicts",
      additionalProperties: false,
      properties: {
        verdicts: {
          type: "array",
          minItems: 1,
          description: "{maxItems: 3}",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { type: "string", enum: ["before", "not_between"] },
              note: { type: "string", description: "Why\n\n{minLength: 1}" },
            },
            required: ["kind"],
          },
        },
      },
      required: ["verdicts"],
    });
  });

  it("throws when the model declines the request", async () => {
    respondWith({
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "cyber", explanation: null },
      content: [],
    });
    respondWith({
      stop_reason: "refusal",
      stop_details: null,
      content: [],
    });

    const client = createAnthropicClient();
    await expect(
      client.completeJSON("test", { type: "object" }),
    ).rejects.toThrow("AI declined the request (refusal category: cyber)");
    await expect(
      client.completeJSON("test", { type: "object" }),
    ).rejects.toThrow(
      "AI declined the request (refusal category: unspecified)",
    );
  });

  it("throws when the response stops before the JSON is complete", async () => {
    respondWith({
      stop_reason: "max_tokens",
      stop_details: null,
      content: [{ type: "text", text: '{"answer":' }],
    });

    const client = createAnthropicClient();
    await expect(
      client.completeJSON("test", { type: "object" }),
    ).rejects.toThrow(
      "AI stopped before completing the JSON (stop_reason: max_tokens)",
    );
  });

  it("throws a descriptive error when the JSON doesn't parse", async () => {
    respondWith({
      stop_reason: "end_turn",
      stop_details: null,
      content: [{ type: "text", text: "{not json" }],
    });

    const client = createAnthropicClient();
    await expect(
      client.completeJSON("test", { type: "object" }),
    ).rejects.toThrow("AI returned malformed JSON: SyntaxError");
  });

  it("throws when the response has no text block", async () => {
    respondWith({
      stop_reason: "end_turn",
      stop_details: null,
      content: [],
    });

    const client = createAnthropicClient();
    await expect(
      client.completeJSON("test", { type: "object" }),
    ).rejects.toThrow("AI did not return structured output");
  });

  it("uses overridden model, without fallbacks, when passed via options", async () => {
    respondWith(jsonResponse({}));

    const client = createAnthropicClient(undefined, {
      model: "claude-haiku-4-5",
    });
    await client.completeJSON("test", { type: "object" });

    const params = mockStream.mock.calls[0][0];
    expect(params.model).toBe("claude-haiku-4-5");
    expect(params).not.toHaveProperty("betas");
    expect(params).not.toHaveProperty("fallbacks");
  });

  it("opts into fallback on other models that offer it", async () => {
    respondWith(jsonResponse({}));

    const client = createAnthropicClient(undefined, {
      model: "claude-opus-5-5",
    });
    await client.completeJSON("test", { type: "object" });

    expect(mockStream).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-opus-5-5",
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      }),
    );
  });

  it("sends effort only when the option is set", async () => {
    respondWith(jsonResponse({}));
    respondWith(jsonResponse({}));

    await createAnthropicClient().completeJSON("test", { type: "object" });
    await createAnthropicClient(undefined, { effort: "high" }).completeJSON(
      "test",
      { type: "object" },
    );

    expect(mockStream.mock.calls[0][0].output_config).not.toHaveProperty(
      "effort",
    );
    expect(mockStream.mock.calls[1][0].output_config).toHaveProperty(
      "effort",
      "high",
    );
  });
});
