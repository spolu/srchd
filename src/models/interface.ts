/**
 * Generic interface for language models
 * Can be implemented by different providers (Anthropic, OpenAI, etc.)
 */

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface ModelResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "error";
}

export interface ModelConfig {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  model?: string;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export abstract class BaseModel {
  protected config: ModelConfig;

  constructor(config: ModelConfig = {}) {
    this.config = config;
  }

  /**
   * Generate a response from the model
   */
  abstract generate(
    messages: Message[],
    tools?: Tool[]
  ): Promise<ModelResponse>;

  /**
   * Get the model's name/identifier
   */
  abstract getModelName(): string;

  /**
   * Check if the model supports tool calling
   */
  abstract supportsTools(): boolean;
}

/**
 * Placeholder implementations for future model providers
 */

export interface AnthropicModelConfig extends ModelConfig {
  apiKey: string;
  model?: "claude-3-5-sonnet-20241022" | "claude-3-haiku-20240307";
}

export interface OpenAIModelConfig extends ModelConfig {
  apiKey: string;
  model?: "gpt-4" | "gpt-3.5-turbo";
}

// These would be implemented later
export abstract class AnthropicModel extends BaseModel {
  constructor(config: AnthropicModelConfig) {
    super(config);
  }
}

export abstract class OpenAIModel extends BaseModel {
  constructor(config: OpenAIModelConfig) {
    super(config);
  }
}