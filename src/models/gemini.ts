import {
  Content,
  FunctionCallingConfigMode,
  FunctionDeclaration,
  GoogleGenAI,
} from "@google/genai";
import {
  BaseModel,
  ModelConfig,
  Message,
  Tool,
  ToolChoice,
  TextContent,
  ToolUse,
  TokenUsage,
} from "./index";
import { Err, Ok, Result } from "../lib/result";
import { normalizeError, SrchdError } from "../lib/error";
import { assertNever } from "../lib/assert";
import { removeNulls } from "../lib/utils";

export type GeminiModels =
  | "gemini-2.5-pro"
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-lite";
export function isGeminiModel(model: string): model is GeminiModels {
  return [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ].includes(model);
}

export class GeminiModel extends BaseModel {
  private client: GoogleGenAI;
  private model: GeminiModels;

  constructor(
    config: ModelConfig,
    model: GeminiModels = "gemini-2.5-flash-lite",
  ) {
    super(config);
    this.client = new GoogleGenAI({});
    this.model = model;
  }

  contents(messages: Message[]) {
    const contents: Content[] = messages.map((msg) => {
      return {
        role: msg.role === "agent" ? "model" : "user",
        parts: removeNulls(
          msg.content.map((content) => {
            switch (content.type) {
              case "text":
                return {
                  text: content.text,
                };
              case "tool_use":
                return {
                  functionCall: {
                    args: content.input,
                    id: content.id,
                    name: content.name,
                  },
                };
              case "tool_result":
                return {
                  functionResponse: {
                    id: content.toolUseId,
                    name: content.toolUseName,
                    response: content.isError
                      ? {
                          error: content.content,
                        }
                      : {
                          output: content.content,
                        },
                  },
                };
              case "thinking": {
                if (content.provider?.gemini) {
                  return {
                    thought: true,
                    text: content.thinking,
                    thoughtSignature: content.provider.gemini.thoughtSignature,
                  };
                }
                return null;
              }
              default:
                assertNever(content);
            }
          }),
        ),
      };
    });

    return contents;
  }

  async run(
    messages: Message[],
    prompt: string,
    toolChoice: ToolChoice,
    tools: Tool[],
  ): Promise<
    Result<{ message: Message; tokenUsage?: TokenUsage }, SrchdError>
  > {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
          ...this.contents(messages),
        ],
        config: {
          thinkingConfig: {
            thinkingBudget: -1,
            includeThoughts: true,
          },
          toolConfig: {
            functionCallingConfig: {
              mode: (() => {
                switch (toolChoice) {
                  case "auto":
                    return FunctionCallingConfigMode.AUTO;
                  case "any":
                    return FunctionCallingConfigMode.ANY;
                  case "none":
                    return FunctionCallingConfigMode.NONE;
                }
              })(),
            },
          },
          tools: [
            {
              functionDeclarations: tools.map((tool) => {
                return {
                  name: tool.name,
                  description: tool.description || "",
                  parametersJsonSchema: tool.inputSchema,
                } as FunctionDeclaration;
              }),
            },
          ],
        },
      });

      if (!response.candidates || response.candidates.length !== 1) {
        return new Err(
          new SrchdError(
            "model_error",
            "Gemini model returned no candidates",
            null,
          ),
        );
      }
      const candidate = response.candidates[0];
      const content = candidate.content;
      if (!content) {
        return new Ok({
          message: {
            role: "agent",
            content: [],
          },
        });
      }

      const tokenUsage =
        response.usageMetadata &&
        response.usageMetadata.totalTokenCount &&
        response.usageMetadata.promptTokenCount &&
        response.usageMetadata.candidatesTokenCount
          ? {
              total: response.usageMetadata.totalTokenCount,
              input: response.usageMetadata.promptTokenCount,
              output: response.usageMetadata.candidatesTokenCount,
              cached: response.usageMetadata.cachedContentTokenCount ?? 0,
              thinking: response.usageMetadata.thoughtsTokenCount ?? 0,
            }
          : undefined;

      return new Ok({
        message: {
          role: content.role === "model" ? "agent" : "user",
          content: removeNulls(
            (content.parts || []).map((part) => {
              if (part.text) {
                if (part.thought) {
                  return {
                    type: "thinking",
                    thinking: part.text,
                    provider: {
                      gemini: {
                        thought: true,
                        thoughtSignature: part.thoughtSignature,
                      },
                    },
                  };
                } else {
                  const c: TextContent = {
                    type: "text",
                    text: part.text,
                    provider: null,
                  };
                  if (part.thoughtSignature) {
                    c.provider = {
                      gemini: { thoughtSignature: part.thoughtSignature },
                    };
                  }
                  return c;
                }
              }
              if (part.functionCall) {
                const c: ToolUse = {
                  type: "tool_use",
                  id:
                    part.functionCall.id ??
                    `tool_use_${Math.random().toString(36).substring(2)}`,
                  name: part.functionCall.name ?? "tool_use_gemini_no_name",
                  input: part.functionCall.args,
                  provider: null,
                };
                if (part.thoughtSignature) {
                  c.provider = {
                    gemini: { thoughtSignature: part.thoughtSignature },
                  };
                }
                return c;
              }
              return null;
            }),
          ),
        },
        tokenUsage,
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
      const response = await this.client.models.countTokens({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
          ...this.contents(messages),
        ],
        config: {
          // No tools for countTokens
        },
      });

      if (!response.totalTokens) {
        return new Err(
          new SrchdError(
            "model_error",
            "Gemini model returned no token counts",
            null,
          ),
        );
      }

      return new Ok(response.totalTokens);
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
      case "gemini-2.5-pro":
      case "gemini-2.5-flash":
      case "gemini-2.5-flash-lite":
        return 1048576 - 65536;
      default:
        assertNever(this.model);
    }
  }
}
