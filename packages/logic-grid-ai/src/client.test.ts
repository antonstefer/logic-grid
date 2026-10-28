import { describe, it, expect, vi, beforeEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient } from "./client";

const mockCreate =
  vi.fn<
    (
      params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
    ) => Promise<unknown>
  >();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    readonly beta = { messages: { create: mockCreate } };
  },
}));

/** A finished structured-output response carrying `value` as JSON. */
function jsonResponse(value: unknown) {
  return {
    stop_reason: "end_turn",
    stop_details: null,
    content: [{ type: "text", text: JSON.stringify(value) }],
  };
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe("createAnthropicClient", () => {
  it("requests structured output and parses the JSON text block", async () => {
    mockCreate.mockResolvedValueOnce({
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
    expect(mockCreate).toHaveBeenCalledWith({
      model: "claude-sonnet-5-5",
      max_tokens: 16000,
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
    mockCreate.mockResolvedValueOnce({
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
    mockCreate.mockResolvedValueOnce(jsonResponse({ clues: ["a", "b"] }));

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

    const sent = JSON.stringify(mockCreate.mock.calls[0][0].output_config);
    expect(sent).not.toContain('"minLength"');
    expect(sent).not.toContain('"minItems"');
    expect(sent).not.toContain('"maxItems"');
  });

  it("throws when the model declines the request", async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "cyber", explanation: null },
      content: [],
    });
    mockCreate.mockResolvedValueOnce({
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
    mockCreate.mockResolvedValueOnce({
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

  it("throws when the response has no text block", async () => {
    mockCreate.mockResolvedValueOnce({
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
    mockCreate.mockResolvedValueOnce(jsonResponse({}));

    const client = createAnthropicClient(undefined, {
      model: "claude-haiku-4-5",
    });
    await client.completeJSON("test", { type: "object" });

    const params = mockCreate.mock.calls[0][0];
    expect(params.model).toBe("claude-haiku-4-5");
    expect(params).not.toHaveProperty("betas");
    expect(params).not.toHaveProperty("fallbacks");
  });

  it("sends effort only when the option is set", async () => {
    mockCreate.mockResolvedValue(jsonResponse({}));

    await createAnthropicClient().completeJSON("test", { type: "object" });
    await createAnthropicClient(undefined, { effort: "high" }).completeJSON(
      "test",
      { type: "object" },
    );

    expect(mockCreate.mock.calls[0][0].output_config).not.toHaveProperty(
      "effort",
    );
    expect(mockCreate.mock.calls[1][0].output_config).toHaveProperty(
      "effort",
      "high",
    );
  });
});
