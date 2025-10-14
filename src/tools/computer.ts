import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentResource } from "../resources/agent";
import {
  errorToCallToolResult,
  STRING_EDIT_INSTRUCTIONS,
  stringEdit,
} from "../lib/mcp";
import { ExperimentResource } from "../resources/experiment";
import { SrchdError } from "../lib/error";
import { Computer } from "../computer";
import { readFile } from "fs/promises";
import { join } from "path";

const SERVER_NAME = "computer";
const SERVER_VERSION = "0.1.0";

function computerId(experiment: ExperimentResource, agent: AgentResource) {
  return `${experiment.toJSON().name}-${agent.toJSON().name}`;
}

export async function createComputerServer(
  experiment: ExperimentResource,
  agent: AgentResource
): Promise<McpServer> {
  const dockerFile = await readFile(
    join(__dirname, "../computer/Dockerfile"),
    "utf8"
  );

  const server = new McpServer({
    name: SERVER_NAME,
    title: "Computer",
    description: `\
Tools to interact with a computer (docker container).

Dockerfile used to create the computer:
\`\`\`
${dockerFile}
\`\`\``,
    version: SERVER_VERSION,
  });

  server.tool(
    "execute",
    `\
Execute a bash command.

- \`stdout\` and \`stderr\` are truncated to 8196 characters.
- Run blocking commands as daemons using \`&\`.
- To search files use \`grep\` or \`rg\`.
- To read large files, use multi-turn \`sed\`, \`awk\`, \`head\` or \`tail\` to limit the output (e.g. \`sed 1,100p largefile.txt\`).
`,
    {
      cmd: z.string().describe("The bash command to execute."),
      cwd: z
        .string()
        .optional()
        .describe("Current working directory. Defaults to `/home/agent`."),
      env: z.record(z.string()).optional().describe("Environment variables."),
      timeout_ms: z
        .number()
        .optional()
        .describe("Timeout in milliseconds. Defaults to 60000ms."),
    },
    async ({ cmd, cwd, env, timeout_ms: timeoutMs }) => {
      const c = await Computer.ensure(computerId(experiment, agent));
      if (c.isErr()) {
        return errorToCallToolResult(
          new SrchdError(
            "computer_run_error",
            "Failed to access running computer"
          )
        );
      }

      const r = await c.value.execute(cmd, {
        cwd,
        env,
        timeoutMs,
      });

      if (r.isErr()) {
        return errorToCallToolResult(r.error);
      }

      const stdout =
        r.value.stdout.slice(0, 8196) +
        (r.value.stdout.length > 8196 ? "...[truncated]" : "");
      const stderr =
        r.value.stderr.slice(0, 8196) +
        (r.value.stderr.length > 8196 ? "...[truncated]" : "");

      return {
        isError: false,
        content: [
          {
            type: "text",
            text:
              `exit_code: ${r.value.exitCode}\n` +
              `duration_ms: ${r.value.durationMs}\n` +
              `stdout:\n\`\`\`\n${stdout}\n\`\`\`\n` +
              `stderr:\n\`\`\`\n${stderr}\`\`\``,
          },
        ],
      };
    }
  );

  server.tool(
    "file_edit",
    `\
Modifies the content of a file by sustituting a specified text segment. This tool demands comprehensive contextual information surrounding the string to replace to ensure accurate targeting.

${STRING_EDIT_INSTRUCTIONS}`,
    {
      path: z
        .string()
        .describe(
          "The path of the file to edit. Must be absolute and under `/home/agent`."
        ),
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
    async ({
      path,
      old_str: oldStr,
      new_str: newStr,
      expected_replacements: expectedReplacements,
    }) => {
      const c = await Computer.ensure(computerId(experiment, agent));
      if (c.isErr()) {
        return errorToCallToolResult(
          new SrchdError(
            "computer_run_error",
            "Failed to access running computer"
          )
        );
      }

      const read = await c.value.readFile(path);
      if (read.isErr()) {
        return errorToCallToolResult(read.error);
      }
      const decoded = read.value.toString("utf8");

      const update = stringEdit({
        content: decoded,
        oldStr,
        newStr,
        expectedReplacements,
      });
      if (update.isErr()) {
        return errorToCallToolResult(update.error);
      }

      const write = await c.value.writeFile(
        path,
        Buffer.from(update.value, "utf8")
      );
      if (write.isErr()) {
        return errorToCallToolResult(write.error);
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `File ${path} updated.`,
          },
        ],
      };
    }
  );

  server.tool(
    "file_append",
    "Append content to a file (no characters or separators are injected).",
    {
      path: z
        .string()
        .describe(
          "The path of the file to edit. Must be absolute and under `/home/agent`."
        ),
      new_str: z.string().describe("The string to append."),
    },
    async ({ path, new_str: newStr }) => {
      const c = await Computer.ensure(computerId(experiment, agent));
      if (c.isErr()) {
        return errorToCallToolResult(
          new SrchdError(
            "computer_run_error",
            "Failed to access running computer"
          )
        );
      }

      const read = await c.value.readFile(path);
      if (read.isErr()) {
        return errorToCallToolResult(read.error);
      }
      const decoded = read.value.toString("utf8");

      const write = await c.value.writeFile(
        path,
        Buffer.from(decoded + newStr, "utf8")
      );
      if (write.isErr()) {
        return errorToCallToolResult(write.error);
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `File ${path} updated.`,
          },
        ],
      };
    }
  );

  return server;
}
