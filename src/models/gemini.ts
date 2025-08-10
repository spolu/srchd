import {
  Content,
  FunctionCallingConfigMode,
  FunctionDeclaration,
  GoogleGenAI,
} from "@google/genai";
import { BaseModel, ModelConfig, Message, Tool, ToolChoice } from "./index";
import { Err, Ok, Result } from "../lib/result";
import { normalizeError, SrchdError } from "../lib/error";
import { assertNever } from "../lib/assert";
import { removeNulls } from "../lib/utils";

export type GeminiModels =
  | "gemini-2.5-pro"
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-lite";

export class GeminiModel extends BaseModel {
  private client: GoogleGenAI;
  private model: GeminiModels;

  constructor(
    config: ModelConfig,
    model: GeminiModels = "gemini-2.5-flash-lite"
  ) {
    super(config);
    this.client = new GoogleGenAI({});
    this.model = model;
  }

  async run(
    messages: Message[],
    prompt: string,
    toolChoice: ToolChoice,
    tools: Tool[]
  ): Promise<Result<Message, SrchdError>> {
    try {
      const contents: Content[] = messages.map((msg) => {
        return {
          role: msg.role === "agent" ? "model" : "user",
          parts: msg.content.map((content) => {
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
              default:
                assertNever(content);
            }
          }),
        };
      });

      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt + "use 2 echo tool at the same time" }],
          },
          ...contents,
        ],
        config: {
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
            null
          )
        );
      }
      const candidate = response.candidates[0];
      const content = candidate.content;
      if (!content) {
        return new Err(
          new SrchdError(
            "model_error",
            "Gemini model returned no content",
            null
          )
        );
      }

      return new Ok({
        role: content.role === "model" ? "agent" : "user",
        content: removeNulls(
          (content.parts || []).map((part) => {
            if (part.text) {
              return {
                type: "text",
                text: part.text,
              };
            }
            if (part.functionCall) {
              return {
                type: "tool_use",
                id:
                  part.functionCall.id ??
                  `tool_use_${Math.random().toString(36).substring(2)}`,
                name: part.functionCall.name ?? "tool_use_gemini_no_name",
                input: part.functionCall.args,
              };
            }
            // TODO(spolu): add support for thinking
            return null;
          })
        ),
      });
    } catch (error) {
      return new Err(
        new SrchdError(
          "model_error",
          "Failed to run model",
          normalizeError(error)
        )
      );
    }
  }
}
