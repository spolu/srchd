import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentResource } from "../resources/agent";
import {
  errorToCallToolResult,
  STRING_EDIT_INSTRUCTIONS,
  stringEdit,
} from "../lib/mcp";
import { normalizeError, SrchdError } from "../lib/error";

const SERVER_NAME = "system_prompt_self_edit";
const SERVER_VERSION = "0.1.0";

export async function createSystemPromptSelfEditServer(
  agent: AgentResource
): Promise<McpServer> {
  const server = new McpServer({
    name: SERVER_NAME,
    title: "System prompt self-edit",
    description:
      "Tools to self-edit your system prompt. The new system prompt version will be effective immediately.",
    version: SERVER_VERSION,
  });

  server.tool(
    "append",
    "Append text to the end of the current system prompt (no characters or separators are injected).",
    {
      new_str: z.string().describe("The string to append."),
    },
    async (params) => {
      const system = agent.toJSON().system;
      const result = await agent.evolve({
        system: system + params.new_str,
      });

      if (result.isErr()) {
        return errorToCallToolResult(result.error);
      }
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: "System prompt updated",
          },
        ],
      };
    }
  );

  server.tool(
    "edit",
    `\
Modifies the content of the current system prompt by sustituting a specified text segment. This tool demands comprehensive contextual information surrounding the string to replace to ensure accurate targeting.

${STRING_EDIT_INSTRUCTIONS}`,
    {
      old_str: z
        .string()
        .describe(
          "The exact text to replace (must be an exact match of the file current content, including whitespaces and indentation)."
        ),
      new_str: z.string().describe("The edited text to replace `old_str`"),
      expected_replacements: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "The expected number of replacements to perform. Defaults to 1 if not specified."
        ),
    },
    async (params) => {
      try {
        const system = agent.toJSON().system;

        const update = stringEdit({
          content: system,
          oldStr: params.old_str,
          newStr: params.new_str,
          expectedReplacements: params.expected_replacements,
        });
        if (update.isErr()) {
          return errorToCallToolResult(update.error);
        }

        const result = await agent.evolve({
          system: update.value,
        });
        if (result.isErr()) {
          return errorToCallToolResult(result.error);
        }
        return {
          isError: false,
          content: [
            {
              type: "text",
              text: "System prompt updated",
            },
          ],
        };
      } catch (error) {
        return errorToCallToolResult(
          new SrchdError(
            "tool_execution_error",
            `Error editing system prompt`,
            normalizeError(error)
          )
        );
      }
    }
  );

  return server;
}
