import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { BaseModel, ModelConfig, Message, Tool, ToolChoice } from "./index";
import Anthropic from "@anthropic-ai/sdk";
import { normalizeError, SrchdError } from "../lib/error";
import { Err, Ok, Result } from "../lib/result";
import { assertNever } from "../lib/assert";
import { removeNulls } from "../lib/utils";

export type AnthropicModels = "claude-sonnet-4-20250514";

export class AnthropicModel extends BaseModel {
  private client: Anthropic;
  private model: AnthropicModels;

  constructor(
    config: ModelConfig,
    model: AnthropicModels = "claude-sonnet-4-20250514"
  ) {
    super(config);
    this.client = new Anthropic();
    this.model = model;
  }

  async run(
    messages: Message[],
    prompt: string,
    toolChoice: ToolChoice,
    tools: Tool[]
  ): Promise<Result<Message, SrchdError>> {
    const anthropicMessages: MessageParam[] = messages.map((msg) => ({
      role: msg.role === "agent" ? "assistant" : "user",
      content: msg.content.map((content) => {
        switch (content.type) {
          case "text":
            return {
              type: "text",
              text: content.text,
            };
          case "tool_use":
            return {
              type: "tool_use",
              id: content.id,
              name: content.name,
              input: content.input,
            };
          case "tool_result":
            return {
              type: "tool_result",
              tool_use_id: content.toolUseId,
              content: content.content,
              is_error: content.isError,
            };
          default:
            assertNever(content);
        }
      }),
    }));

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: this.config.maxTokens ?? 1024,
        messages: anthropicMessages,
        system: prompt,
        // TODO(spolu): add support for thinking
        thinking: {
          type: "disabled",
        },
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as any,
        })),
        tool_choice: {
          type: toolChoice,
        },
      });

      return new Ok({
        role: message.role === "assistant" ? "agent" : "user",
        content: removeNulls(
          message.content.map((c) => {
            switch (c.type) {
              case "text":
                return {
                  type: "text",
                  text: c.text,
                };
              case "tool_use":
                return {
                  type: "tool_use",
                  id: c.id,
                  name: c.name,
                  input: c.input,
                };
              case "server_tool_use":
              case "web_search_tool_result":
              case "redacted_thinking":
              case "thinking": {
                // TODO(spolu): add support for thinking
                return null;
              }
              default:
                assertNever(c);
            }
          })
        ),
      });
    } catch (error) {
      return new Err(
        new SrchdError(
          "model_error",
          "Failed to run model",
          normalizeError(error)
        )
      );
    }
  }
}
