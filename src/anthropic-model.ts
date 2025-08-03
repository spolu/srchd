import Anthropic from "@anthropic-ai/sdk";
import {
  BaseModel,
  Message,
  Tool,
  TextContent,
  ThinkingContent,
  ToolUse,
  ToolResult,
  ModelConfig,
} from "./model.js";

export class AnthropicModel extends BaseModel {
  private client: Anthropic;

  constructor(config: ModelConfig, apiKey: string) {
    super(config);
    this.client = new Anthropic({
      apiKey,
    });
  }

  async run(messages: Message[], prompt: string, tools: Tool[]): Promise<Message> {
    // Convert our Message format to Anthropic's format
    const anthropicMessages: Anthropic.Messages.MessageParam[] = messages.map(
      (msg) => ({
        role: msg.role === "agent" ? "assistant" : "user",
        content: msg.content.map((content) => {
          switch (content.type) {
            case "text":
              return {
                type: "text",
                text: content.content,
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
                content: content.content,
                is_error: content.isError,
              };
            case "thinking":
              // Thinking content is handled through the thinking parameter
              return {
                type: "text",
                text: content.content,
              };
            default:
              throw new Error(`Unknown content type: ${(content as any).type}`);
          }
        }),
      })
    );

    // Add the prompt as a user message
    anthropicMessages.push({
      role: "user",
      content: prompt,
    });

    // Convert our Tool format to Anthropic's format
    const anthropicTools: Anthropic.Messages.Tool[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature,
        messages: anthropicMessages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
        thinking: this.config.thinking,
      });

      // Convert Anthropic's response back to our Message format
      const content: (TextContent | ThinkingContent | ToolUse | ToolResult)[] = [];

      for (const block of response.content) {
        switch (block.type) {
          case "text":
            content.push({
              type: "text",
              content: block.text,
            });
            break;
          case "tool_use":
            content.push({
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: block.input,
            });
            break;
          case "thinking":
            content.push({
              type: "thinking",
              content: block.content,
            });
            break;
          default:
            throw new Error(`Unknown response block type: ${(block as any).type}`);
        }
      }

      return {
        role: "agent",
        content,
      };
    } catch (error) {
      throw new Error(`Anthropic API error: ${error}`);
    }
  }
}