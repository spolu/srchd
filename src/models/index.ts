import type { JSONSchema7 as JSONSchema } from "json-schema";
import { Result } from "../lib/result";
import { SrchdError } from "../lib/error";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";

export type provider = "gemini" | "anthropic" | "openai";
export const DEFAULT_MAX_TOKENS = 2048;

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
  message: Message
): message is Message & { content: TextContent[] } {
  return (
    message.role === "user" && message.content.every((c) => c.type === "text")
  );
}

export interface ModelConfig {
  maxTokens?: number;
  thinking?: "high" | "low" | "none";
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
    tools: Tool[]
  ): Promise<Result<Message, SrchdError>>;

  abstract tokens(
    messages: Message[],
    prompt: string,
    toolChoice: ToolChoice,
    tools: Tool[]
  ): Promise<Result<number, SrchdError>>;
}
