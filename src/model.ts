import type {
  JSONSchema7 as JSONSchema,
  JSONSchema7Definition as JSONSchemaDefinition,
} from "json-schema";

export interface TextContent {
  type: "text";
  content: string;
}

export interface ThinkingContent {
  type: "thinking";
  content: string;
}

export interface ToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: any;
}

export interface ToolResult {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError: boolean;
}

export interface Message {
  role: "user" | "agent";
  content: (TextContent | ThinkingContent | ToolUse | ToolResult)[];
}

export interface ModelConfig {
  temperature?: number;
  maxTokens?: number;
  model: string;
  thinking?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

export abstract class BaseModel {
  protected config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  abstract run(
    messages: Message[],
    prompt: string,
    tools: Tool[]
  ): Promise<Message>;
}

export { AnthropicModel } from "./anthropic-model.js";
