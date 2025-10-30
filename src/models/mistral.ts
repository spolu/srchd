import {
  BaseModel,
  ModelConfig,
  Message,
  Tool,
  ToolChoice,
  TextContent,
  ToolUse,
  Thinking,
  isUserMessageWithText,
} from "./index";
import { normalizeError, SrchdError } from "../lib/error";
import { Err, Ok, Result } from "../lib/result";
import { assertNever } from "../lib/assert";

import { Mistral } from "@mistralai/mistralai";
import type {
  ChatCompletionStreamRequest,
  ContentChunk,
  TextChunk,
  ToolCall,
} from "@mistralai/mistralai/models/components";
import { removeNulls } from "../lib/utils";

type MistralMessage = ChatCompletionStreamRequest["messages"][number];

export type MistralModels =
  | "mistral-large-latest"
  | "mistral-small-latest"
  | "codestral-latest";

export function isMistralModel(model: string): model is MistralModels {
  return [
    "mistral-large-latest",
    "mistral-small-latest",
    "codestral-latest",
  ].includes(model);
}

export class MistralModel extends BaseModel {
  private client: Mistral;
  private model: MistralModels;

  constructor(
    config: ModelConfig,
    model: MistralModels = "mistral-large-latest",
  ) {
    super(config);
    this.client = new Mistral();
    this.model = model;
  }

  messages(messages: Message[]) {
    const mistralMessages: MistralMessage[] = [];

    const agentMessageFromAccumulatedContent = (
      content: ContentChunk[],
      toolCalls: ToolCall[],
    ) => {
      if (content.length > 0 || toolCalls.length > 0) {
        mistralMessages.push({
          role: "assistant",
          content,
          toolCalls,
        });
      }
    };

    for (const msg of messages) {
      switch (msg.role) {
        case "user":
          mistralMessages.push({
            role: "user",
            content: msg.content
              .filter((c) => c.type === "text")
              .map((c) => ({
                type: "text",
                text: c.text,
              })),
          });
          break;
        case "agent":
          let content: ContentChunk[] = [];
          let toolCalls: ToolCall[] = [];
          for (const c of msg.content) {
            switch (c.type) {
              case "tool_result":
                agentMessageFromAccumulatedContent(content, toolCalls);
                content = [];
                toolCalls = [];
                mistralMessages.push({
                  role: "tool",
                  toolCallId: c.toolUseId,
                  name: c.toolUseName,
                  content: c.content as ContentChunk[],
                });
                break;
              case "text":
                content.push({
                  type: "text",
                  text: c.text,
                });
                break;
              case "tool_use":
                toolCalls.push({
                  id: c.id,
                  type: "function",
                  function: {
                    name: c.name,
                    arguments: c.input,
                  },
                });
                break;
              default:
                continue;
            }
          }
          agentMessageFromAccumulatedContent(content, toolCalls);
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
        model: this.model,
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
                  default: // Note: thinking is not implemented yet for mistral
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
                // We don't have any thinking models yet
                // return acc + c.thinking.length;
                throw new Error("Thinking not implemented yet for mistral");
                return acc;
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
