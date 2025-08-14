import type {
  JSONSchema7 as JSONSchema,
  JSONSchema7Definition as JSONSchemaDefinition,
} from "json-schema";
import { Result } from "../lib/result";
import { SrchdError } from "../lib/error";

export type provider = "gemini" | "anthropic";
export const DEFAULT_MAX_TOKENS = 2048;

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: any;
}

export interface Thinking {
  type: "thinking";
  thinking: string;
  provider: Partial<Record<provider, any>>;
}

export interface ToolResult {
  type: "tool_result";
  toolUseId: string;
  toolUseName: string;
  content: string;
  isError: boolean;
}

export interface Message {
  role: "user" | "agent";
  content: (TextContent | ToolUse | ToolResult | Thinking)[];
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
}
