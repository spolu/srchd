import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import {
  BaseModel,
  ModelConfig,
  Message,
  Tool,
  ToolChoice,
  TokenUsage,
  DEFAULT_MAX_TOKENS,
} from "./index";
import Anthropic from "@anthropic-ai/sdk";
import { normalizeError, SrchdError } from "../lib/error";
import { Err, Ok, Result } from "../lib/result";
import { assertNever } from "../lib/assert";
import { removeNulls } from "../lib/utils";

const DEFAULT_LOW_THINKING_TOKENS = 4096;
const DEFAULT_HIGH_THINKING_TOKENS = 8192;

export type AnthropicModels =
  | "claude-opus-4-1-20250805"
  | "claude-sonnet-4-5-20250929"
  | "claude-haiku-4-5-20251001";
export function isAnthropicModel(model: string): model is AnthropicModels {
  return [
    "claude-opus-4-1-20250805",
    "claude-sonnet-4-5-20250929",
    "claude-haiku-4-5-20251001",
  ].includes(model);
}

export class AnthropicModel extends BaseModel {
  private client: Anthropic;
  private model: AnthropicModels;

  constructor(
    config: ModelConfig,
    model: AnthropicModels = "claude-sonnet-4-5-20250929",
  ) {
    super(config);
    this.client = new Anthropic();
    this.model = model;
  }

  messages(messages: Message[]) {
    const anthropicMessages: MessageParam[] = messages.map((msg) => ({
      role: msg.role === "agent" ? "assistant" : "user",
      content: removeNulls(
        msg.content.map((content) => {
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
                content: content.content.map((content) => {
                  switch (content.type) {
                    case "text":
                      return {
                        type: "text",
                        text: content.text,
                      };
                    case "image": {
                      return {
                        type: "image",
                        source: {
                          data: content.data,
                          media_type: content.mimeType as any,
                          type: "base64",
                        },
                      };
                    }
                    case "audio":
                      return {
                        type: "text",
                        text: "(unsupported audio content)",
                      };
                    case "resource":
                      return {
                        type: "text",
                        text: JSON.stringify(content, null, 2),
                      };
                    case "resource_link":
                      return {
                        type: "text",
                        text: JSON.stringify(content, null, 2),
                      };
                    default:
                      assertNever(content);
                  }
                }),
                is_error: content.isError,
              };
            case "thinking": {
              if (content.provider?.anthropic) {
                switch (content.provider.anthropic.type) {
                  case "thinking": {
                    return {
                      type: "thinking",
                      thinking: content.thinking,
                      signature: content.provider.anthropic.signature,
                    };
                  }
                  case "redacted_thinking": {
                    return {
                      type: "redacted_thinking",
                      data: content.provider.anthropic.data,
                    };
                  }
                  default:
                    return null;
                }
              }
              return null;
            }
            default:
              assertNever(content);
          }
        }),
      ),
    }));

    for (var i = anthropicMessages.length - 1; i >= 0; i--) {
      if (anthropicMessages[i].role === "user") {
        let found = false;
        for (var j = anthropicMessages[i].content.length - 1; j >= 0; j--) {
          const c = anthropicMessages[i].content[j];
          if (typeof c !== "string" && c.type === "text") {
            c.cache_control = { type: "ephemeral" };
            found = true;
            break;
          }
        }
        if (found) {
          break;
        }
      }
    }

    return anthropicMessages;
  }

  async run(
    messages: Message[],
    prompt: string,
    toolChoice: ToolChoice,
    tools: Tool[],
  ): Promise<
    Result<{ message: Message; tokenUsage?: TokenUsage }, SrchdError>
  > {
    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens:
          this.config.maxTokens ??
          (() => {
            switch (this.config.thinking) {
              case undefined:
              case "none":
                return DEFAULT_MAX_TOKENS;
              case "low": {
                return DEFAULT_LOW_THINKING_TOKENS + DEFAULT_MAX_TOKENS;
              }
              case "high": {
                return DEFAULT_HIGH_THINKING_TOKENS + DEFAULT_MAX_TOKENS;
              }
              default:
                assertNever(this.config.thinking);
            }
          })(),
        messages: this.messages(messages),
        system: [
          {
            type: "text",
            text: prompt,
            cache_control: {
              type: "ephemeral",
            },
          },
        ],
        thinking: (() => {
          switch (this.config.thinking) {
            case undefined:
              return {
                type: "disabled",
              };
            case "low": {
              return {
                type: "enabled",
                budget_tokens: DEFAULT_LOW_THINKING_TOKENS,
              };
            }
            case "high": {
              return {
                type: "enabled",
                budget_tokens: DEFAULT_HIGH_THINKING_TOKENS,
              };
            }
          }
        })(),
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as any,
        })),
        tool_choice: {
          type: toolChoice,
        },
      });

      const tokenUsage = {
        total: message.usage.output_tokens + message.usage.input_tokens,
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
        cached: message.usage.cache_read_input_tokens ?? 0,
        thinking: 0,
      };
      // console.log(message.usage);

      return new Ok({
        message: {
          role: message.role === "assistant" ? "agent" : "user",
          content: removeNulls(
            message.content.map((c) => {
              switch (c.type) {
                case "text":
                  return {
                    type: "text",
                    text: c.text,
                    provider: null,
                  };
                case "tool_use":
                  return {
                    type: "tool_use",
                    id: c.id,
                    name: c.name,
                    input: c.input,
                    provider: null,
                  };
                case "thinking": {
                  return {
                    type: "thinking",
                    thinking: c.thinking,
                    provider: {
                      anthropic: {
                        type: c.type,
                        signature: c.signature,
                      },
                    },
                  };
                }
                case "redacted_thinking": {
                  return {
                    type: "thinking",
                    thinking: "<redacted>",
                    provider: {
                      anthropic: {
                        type: c.type,
                        data: c.data,
                      },
                    },
                  };
                }
                case "server_tool_use":
                case "web_search_tool_result": {
                  return null;
                }
                default:
                  assertNever(c);
              }
            }),
          ),
        },
        tokenUsage, // also inlcude cached or input tokens ?
      });
    } catch (error) {
      return new Err(
        new SrchdError(
          "model_error",
          "Failed to run model",
          normalizeError(error),
        ),
      );
    }
  }

  async tokens(
    messages: Message[],
    prompt: string,
    toolChoice: ToolChoice,
    tools: Tool[],
  ): Promise<Result<number, SrchdError>> {
    try {
      const response = await this.client.messages.countTokens({
        model: this.model,
        messages: this.messages(messages),
        system: prompt,
        thinking: (() => {
          switch (this.config.thinking) {
            case undefined:
              return {
                type: "disabled",
              };
            case "low": {
              return {
                type: "enabled",
                budget_tokens: DEFAULT_LOW_THINKING_TOKENS,
              };
            }
            case "high": {
              return {
                type: "enabled",
                budget_tokens: DEFAULT_HIGH_THINKING_TOKENS,
              };
            }
          }
        })(),
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as any,
        })),
        tool_choice: {
          type: toolChoice,
        },
      });

      return new Ok(response.input_tokens);
    } catch (error) {
      return new Err(
        new SrchdError(
          "model_error",
          "Failed to count tokens",
          normalizeError(error),
        ),
      );
    }
  }

  maxTokens(): number {
    switch (this.model) {
      case "claude-opus-4-1-20250805":
      case "claude-sonnet-4-5-20250929":
      case "claude-haiku-4-5-20251001":
        return 200000 - 64000;
      default:
        assertNever(this.model);
    }
  }
}
