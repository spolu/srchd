import type { JSONSchema7 as JSONSchema } from "json-schema";
import { Ok, Result } from "../lib/result";
import { SrchdError } from "../lib/error";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";

export type provider = "gemini" | "anthropic" | "openai";
export function isProvider(str: string): str is provider {
  return ["gemini", "anthropic", "openai"].includes(str);
}

export const DEFAULT_MAX_TOKENS = 4096;

export type ProviderData = Partial<Record<provider, any>>;

export interface TextContent {
  type: "text";
  text: string;
  provider: ProviderData | null;
}

export interface ToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: any;
  provider: ProviderData | null;
}

export interface Thinking {
  type: "thinking";
  thinking: string;
  provider: ProviderData | null;
}

export interface ToolResult {
  type: "tool_result";
  toolUseId: string;
  toolUseName: string;
  content: CallToolResult["content"];
  isError: boolean;
}

export interface Message {
  role: "user" | "agent";
  content: (TextContent | ToolUse | ToolResult | Thinking)[];
}

export function isUserMessageWithText(
  message: Message,
): message is Message & { content: TextContent[] } {
  return (
    message.role === "user" && message.content.every((c) => c.type === "text")
  );
}

export type ThinkingConfig = "high" | "low" | "none";
export function isThinkingConfig(str: string): str is ThinkingConfig {
  return ["high", "low", "none"].includes(str);
}

export interface ModelConfig {
  maxTokens?: number;
  thinking?: ThinkingConfig;
}

export interface Tool {
  name: string;
  description?: string;
  inputSchema: JSONSchema;
}

export type ToolChoice = "auto" | "any" | "none";

export abstract class BaseModel {
  protected config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  abstract run(
    messages: Message[],
    prompt: string,
    toolChoice: ToolChoice,
    tools: Tool[],
  ): Promise<Result<{ message: Message; tokenCount?: number }, SrchdError>>;

  async tokens(message: Message): Promise<Result<number, SrchdError>> {
    // Default implementation of an approximate token count.
    return new Ok(
      message.content
        .map((c) => {
          switch (c.type) {
            case "text":
              return c.text.length;
            case "tool_use":
              return JSON.stringify(c.input).length;
            case "tool_result":
              return c.content
                .filter((c) => c.type === "text")
                .map((c) => c.text.length)
                .reduce((a, b) => a + b, 0);
            case "thinking":
              return c.thinking.length;
          }
        })
        .reduce((a, b) => a + b, 0),
    );
  }

  abstract maxTokens(): number;
}
