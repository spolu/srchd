import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentResource } from "../resources/agent";
import { errorToCallToolResult, stringEdit } from "../lib/mcp";

const SERVER_NAME = "system_prompt_edit";
const SERVER_VERSION = "0.1.0";

export function createSystemPromptEditServer(agent: AgentResource): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    title: "System prompt edit",
    description:
      "Tools to self-edit your system prompt. " +
      "The new system prompt version will be effective immediately.",
    version: SERVER_VERSION,
  });

  server.tool(
    "append",
    "Append text to the end of the current system prompt (no character or separator are injected)",
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
Modifies the content of the current system prompt by sustituting a specified text segment. This
tool demands comprehensive contextual information surrounding the string to replace to ensure
accurate targeting.

Requirements:
(i) \`old_str\` NEEDS TO contain the precise literal content for substituation (preserving all
spacing, formatting, line breaks, etc).
(ii) \`new_str\` NEEDS TO contain the precise literal content that will substitute \`old_str\`
(maintaining all spacing, formatting, line breaks, etc). Verify the output maintains proper syntax
and follows best practices.
(iii) DO NOT apply escaping to \`old_str\` or \`new_str\`, as this violates the literal text
requirement.

**Critical**:
- Failure to meet these requirements will cause the tool to fail.
- \`old_str\` NEEDS TO provide unique identification for the specific instance to replace.Include
  surrounding textual context BEFORE and AFTER the target content. Multiple matches or inexact
  matches will cause failure.

**Batch replacements**:
Define \`expected_replacements\` (optional, defaults to 1) when the change is meant to impact more
than one occurrence. If there is a mismatch the tool will error.`,
    {
      old_str: z
        .string()
        .describe(
          "The exact text to replace (must match the file contents exactly, including all " +
            "whitespace and indentation)."
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
    }
  );

  return server;
}
