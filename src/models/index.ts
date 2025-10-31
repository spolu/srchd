import type { JSONSchema7 as JSONSchema } from "json-schema";
import { Result } from "../lib/result";
import { SrchdError } from "../lib/error";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";

export type provider = "gemini" | "anthropic" | "openai" | "mistral";
export function isProvider(str: string): str is provider {
  return ["gemini", "anthropic", "openai", "mistral"].includes(str);
}

export const DEFAULT_MAX_TOKENS = 4096;

export type ProviderData = Partial<Record<provider, any>>;

export type TokenUsage = {
  total: number;
  input: number;
  output: number;
  cached: number;
  thinking: number;
};

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
  ): Promise<Result<{ message: Message; tokenUsage?: TokenUsage }, SrchdError>>;

  abstract tokens(
    messages: Message[],
    prompt: string,
    toolChoice: ToolChoice,
    tools: Tool[],
  ): Promise<Result<number, SrchdError>>;

  abstract maxTokens(): number;
}
