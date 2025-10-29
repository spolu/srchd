import {
  BaseModel,
  ModelConfig,
  Message,
  Tool,
  ToolChoice,
  DEFAULT_MAX_TOKENS,
  TextContent,
  ToolUse,
  Thinking,
  ThinkingConfig,
} from "./index";
import { normalizeError, SrchdError } from "../lib/error";
import { Err, Ok, Result } from "../lib/result";
import { assertNever } from "../lib/assert";

import { Mistral } from "@mistralai/mistralai";
import type {
  ChatCompletionStreamRequest,
  ContentChunk,
  TextChunk,
} from "@mistralai/mistralai/models/components";
import { removeNulls } from "../lib/utils";

type MistralMessage = ChatCompletionStreamRequest["messages"][number];

export type MistralModels =
  | "magistral-medium-latest" // reasoning model
  | "mistral-large-latest"
  | "mistral-small-latest"
  | "codestral-latest";

export function isMistralModel(model: string): model is MistralModels {
  return [
    "magistral-medium-latest",
    "mistral-large-latest",
    "mistral-small-latest",
    "codestral-latest",
  ].includes(model);
}

export class MistralModel extends BaseModel {
  private client: Mistral;
  private model: MistralModels;
  private thinking: ThinkingConfig;
  private tokenCount?: number;

  constructor(
    config: ModelConfig,
    model: MistralModels = "mistral-large-latest",
  ) {
    super(config);
    this.client = new Mistral();
    this.thinking = config.thinking ?? "none"; // Unused for Mistral
    this.model = model;
  }

  private contentChunk(content: TextContent | Thinking): ContentChunk {
    switch (content.type) {
      case "text":
        return {
          type: "text",
          text: content.text,
        };
      case "thinking":
        return {
          type: "thinking",
          thinking: [{ type: "text", text: content.thinking }],
        };
    }
  }

  messages(messages: Message[]) {
    const mistralMessages: MistralMessage[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      // Handle tool_result separately
      const toolResults = msg.content.filter((c) => c.type === "tool_result");
      const toolCalls = msg.content.filter((c) => c.type === "tool_use");
      const rest = msg.content.filter(
        (c) => c.type !== "tool_result" && c.type !== "tool_use",
      );

      switch (msg.role) {
        case "user":
          if (rest.length > 0) {
            mistralMessages.push({
              role: "user",
              content: rest.map(this.contentChunk),
            });
          }
          break;
        case "agent":
          if (rest.length > 0 || toolCalls.length > 0) {
            mistralMessages.push({
              role: "assistant",
              content: rest.map(this.contentChunk),
              toolCalls: toolCalls.map((c) => {
                return {
                  id: c.id,
                  function: {
                    name: c.name,
                    arguments: c.input,
                  },
                };
              }),
            });
          }
          break;
        default:
          assertNever(msg.role);
      }

      for (const toolResult of toolResults) {
        let content: ContentChunk[];
        mistralMessages.push({
          role: "tool",
          content: removeNulls(
            toolResult.content.map((c): ContentChunk | null => {
              switch (c.type) {
                case "text":
                  return {
                    type: "text",
                    text: c.text,
                  };
                default:
                  return null;
              }
            }),
          ),
          toolCallId: toolResult.toolUseId,
          name: toolResult.toolUseName,
        });
      }
    }

    return mistralMessages;
  }

  async run(
    messages: Message[],
    prompt: string,
    toolChoice: ToolChoice,
    tools: Tool[],
  ): Promise<Result<Message, SrchdError>> {
    try {
      const chatResponse = await this.client.chat.complete({
        model: "mistral-medium-latest",
        messages: [
          {
            role: "system",
            content: prompt,
          },
          ...this.messages(messages),
        ],
        toolChoice,
        tools: tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          },
        })),
      });

      const msg = chatResponse.choices[0].message;
      const finishReason = chatResponse.choices[0].finishReason;
      this.tokenCount = chatResponse.usage.completionTokens;
      if (finishReason !== "stop" && finishReason !== "tool_calls") {
        return new Err(
          new SrchdError(
            "model_error",
            `Unexpected finish reason: ${finishReason}`,
            normalizeError(`Unexpected finish reason: ${finishReason}`),
          ),
        );
      }

      const content: (TextContent | ToolUse | Thinking)[] = [];

      if (msg.toolCalls) {
        for (const toolCall of msg.toolCalls) {
          content.push({
            type: "tool_use",
            id: toolCall.id ?? "",
            name: toolCall.function.name,
            input:
              typeof toolCall.function.arguments === "string"
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments,
            provider: null,
          });
        }
      }

      if (msg.content) {
        if (typeof msg.content === "string") {
          content.push({
            type: "text",
            text: msg.content,
            provider: null,
          });
        } else {
          content.push(
            ...removeNulls(
              msg.content.map((c) => {
                switch (c.type) {
                  case "text":
                    return {
                      type: "text" as const,
                      text: c.text,
                      provider: null,
                    };
                  case "thinking":
                    return {
                      type: "thinking" as const,
                      thinking: c.thinking
                        .filter((t): t is TextChunk => t.type === "text")
                        .map((t) => t.text)
                        .join("\n"),
                      provider: null,
                    };
                  default:
                    return null;
                }
              }),
            ),
          );
        }
      }

      return new Ok({
        role: "agent",
        content,
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
      // Mistral's doesn't have a token counting API so we approximate with token ~= 4 chars.
      const tokens =
        messages.reduce((acc, m) => {
          m.content.reduce((acc, c) => {
            switch (c.type) {
              case "text":
                return acc + c.text.length;
              case "tool_use":
                return acc + c.name.length + c.input.length;
              case "thinking":
                return acc + c.thinking.length;
              case "tool_result":
                const contentLength = c.content
                  .filter((c) => c.type === "text")
                  .reduce((acc, c) => acc + c.text.length, 0);
                return acc + c.toolUseName.length + contentLength;
            }
          }, acc);
          return acc;
        }, 0) / 4;

      return new Ok(tokens);
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
      case "mistral-large-latest":
        return 128000;
      case "mistral-small-latest":
        return 128000;
      case "codestral-latest":
        return 32000;
      default:
        assertNever(this.model);
    }
  }
}
