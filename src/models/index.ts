import type { JSONSchema7 as JSONSchema } from "json-schema";
import { Err, Ok, Result } from "../lib/result";
import { normalizeError, SrchdError } from "../lib/error";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";

export type provider = "gemini" | "anthropic" | "openai" | "mistral";
export function isProvider(str: string): str is provider {
  return ["gemini", "anthropic", "openai", "mistral"].includes(str);
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

  protected abstract internalRun(
    messages: Message[],
    prompt: string,
    toolChoice: ToolChoice,
    tools: Tool[],
  ): Promise<Result<Message, SrchdError>>;

  async run(
    messages: Message[],
    prompt: string,
    toolChoice: ToolChoice,
    tools: Tool[],
  ): Promise<Result<Message, SrchdError>> {
    const res = await this.internalRun(messages, prompt, toolChoice, tools);
    if (res.isErr()) {
      return res;
    } else {
      return this.validateOutputMessage(res.value);
    }
  }

  abstract tokens(
    messages: Message[],
    prompt: string,
    toolChoice: ToolChoice,
    tools: Tool[],
  ): Promise<Result<number, SrchdError>>;

  abstract maxTokens(): number;

  validateOutputMessage(message: Message): Result<Message, SrchdError> {
    let valid = true;
    let reason = "";
    if (message.role === "user") {
      valid = false;
      reason = "User message not allowed\n";
    }

    if (message.content.some((c) => c.type === "tool_result")) {
      valid = false;
      reason += "Tool result not allowed\n";
    }

    for (const c of message.content) {
      if (c.type === "tool_use") {
        if (!c.name.match(/^[a-zA-Z0-9_-]+$/)) {
          valid = false;
          reason += "Tool name must be alphanumeric\n";
        }

        if (c.name.length > 256) {
          valid = false;
          reason += "Tool name must be less than 256 characters\n";
        }

        try {
          JSON.parse(c.input);
        } catch (e) {
          valid = false;
          reason += "Tool input must be valid JSON\n";
        }
      }
    }

    if (!valid) {
      return new Err(
        new SrchdError(
          "invalid_message_error",
          reason,
          normalizeError(new Error("Invalid message: " + reason)),
        ),
      );
    } else {
      return new Ok(message);
    }
  }
}
