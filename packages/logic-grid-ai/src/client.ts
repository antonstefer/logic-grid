import Anthropic from "@anthropic-ai/sdk";
import type { AIClient, JSONSchema } from "./types";

/**
 * Create an AIClient backed by the Anthropic SDK.
 *
 * Uses Claude's tool_use feature for structured JSON output.
 * If no apiKey is provided, the SDK reads from ANTHROPIC_API_KEY.
 */
export function createAnthropicClient(apiKey?: string): AIClient {
  const client = new Anthropic({ apiKey });

  return {
    async completeJSON<T>(prompt: string, schema: JSONSchema): Promise<T> {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        temperature: 0.8,
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
