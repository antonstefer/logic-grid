import { describe, it, expect, vi } from "vitest";
import { createAnthropicClient } from "./client";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    readonly messages = { create: mockCreate };
  },
}));

describe("createAnthropicClient", () => {
  it("returns structured output from tool_use block", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "call_1",
          name: "respond",
          input: { answer: 42 },
        },
      ],
    });

    const client = createAnthropicClient("test-key");
    const result = await client.completeJSON<{ answer: number }>(
      "test prompt",
      { type: "object", properties: { answer: { type: "number" } } },
    );

    expect(result).toEqual({ answer: 42 });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "test prompt" }],
        tools: [
          expect.objectContaining({
            name: "respond",
            input_schema: {
              type: "object",
              properties: { answer: { type: "number" } },
            },
          }),
        ],
        tool_choice: { type: "tool", name: "respond" },
      }),
    );
  });

  it("throws when AI returns no tool_use block", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "no tool use here" }],
    });

    const client = createAnthropicClient();
    await expect(
      client.completeJSON("test", { type: "object" }),
    ).rejects.toThrow("AI did not return structured output");
  });

  it("uses default API key when none provided", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", id: "call_2", name: "respond", input: {} }],
    });

    const client = createAnthropicClient();
    await client.completeJSON("test", { type: "object" });

    expect(mockCreate).toHaveBeenCalled();
  });

  it("uses overridden model when passed via options", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", id: "call_3", name: "respond", input: {} }],
    });

    const client = createAnthropicClient(undefined, {
      model: "claude-haiku-4-5",
    });
    await client.completeJSON("test", { type: "object" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5" }),
    );
  });

  it("uses default temperature 0.8 when none provided", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", id: "call_4", name: "respond", input: {} }],
    });

    const client = createAnthropicClient();
    await client.completeJSON("test", { type: "object" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.8 }),
    );
  });

  it("uses overridden temperature when passed via options", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", id: "call_5", name: "respond", input: {} }],
    });

    const client = createAnthropicClient(undefined, { temperature: 0 });
    await client.completeJSON("test", { type: "object" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0 }),
    );
  });
});
