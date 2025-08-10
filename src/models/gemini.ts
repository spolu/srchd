import { GoogleGenerativeAI, GenerativeModel, Content } from "@google/genai";
import { BaseModel, ModelConfig, Message, Tool, ToolChoice } from "./index";
import { normalizeError, SrchdError } from "../lib/error";
import { Err, Ok, Result } from "../lib/result";
import { assertNever } from "../lib/assert";
import { removeNulls } from "../lib/utils";

export type GeminiModels = "gemini-1.5-pro" | "gemini-1.5-flash";

export class GeminiModel extends BaseModel {
  private client: GoogleGenerativeAI;
  private model: GenerativeModel;
  private modelName: GeminiModels;

  constructor(
    config: ModelConfig,
    model: GeminiModels = "gemini-1.5-pro"
  ) {
    super(config);
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_GENAI_API_KEY environment variable is required");
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = model;
    this.model = this.client.getGenerativeModel({ model });
  }

  async run(
    messages: Message[],
    prompt: string,
    toolChoice: ToolChoice,
    tools: Tool[]
  ): Promise<Result<Message, SrchdError>> {
    const geminiMessages: Content[] = messages.map((msg) => ({
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
                name: content.name,
                args: content.input,
              },
            };
          case "tool_result":
            return {
              functionResponse: {
                name: content.toolUseId,
                response: {
                  content: content.content,
                  isError: content.isError,
                },
              },
            };
          default:
            assertNever(content);
        }
      }),
    }));

    try {
      const modelWithTools = tools.length > 0 
        ? this.client.getGenerativeModel({
            model: this.modelName,
            tools: [{
              functionDeclarations: tools.map((tool) => ({
                name: tool.name,
                description: tool.description || "",
                parameters: tool.inputSchema,
              })),
            }],
          })
        : this.model;

      const result = await modelWithTools.generateContent({
        contents: geminiMessages,
        systemInstruction: prompt,
        generationConfig: {
          maxOutputTokens: this.config.maxTokens ?? 1024,
        },
      });

      const response = result.response;
      const content = response.candidates?.[0]?.content;

      if (!content) {
        return new Err(
          new SrchdError(
            "model_error",
            "No content in Gemini response",
            new Error("Empty response from Gemini")
          )
        );
      }

      return new Ok({
        role: "agent",
        content: removeNulls(
          content.parts.map((part) => {
            if (part.text) {
              return {
                type: "text",
                text: part.text,
              };
            }
            if (part.functionCall) {
              return {
                type: "tool_use",
                id: `gemini_${Date.now()}_${Math.random()}`,
                name: part.functionCall.name,
                input: part.functionCall.args,
              };
            }
            return null;
          })
        ),
      });
    } catch (error) {
      return new Err(
        new SrchdError(
          "model_error",
          "Failed to run Gemini model",
          normalizeError(error)
        )
      );
    }
  }
}