import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SrchdError } from "./error";
import { Err, Ok, Result } from "./result";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";

export async function createClientServerPair(
  server: McpServer
): Promise<[Client, McpServer]> {
  const client = new Client({
    // @ts-ignore use private _serverInfo
    name: server.server._serverInfo.name,
    // @ts-ignore use private _serverInfo
    version: server.server._serverInfo.version,
  });

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return [client, server];
}

export function errorToCallToolResult(error: SrchdError): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text:
          `Error [${error.code}]: ${error.message}` +
          (error.cause ? ` (cause: ${error.cause?.message})` : ""),
      },
    ],
  };
}

export function stringEdit({
  content,
  oldStr,
  newStr,
  expectedReplacements = 1,
}: {
  content: string;
  oldStr: string;
  newStr: string;
  expectedReplacements?: number;
}): Result<string, SrchdError> {
  // Count occurrences of old_string
  const regex = new RegExp(oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  const matches = content.match(regex);
  const occurrences = matches ? matches.length : 0;

  // console.log("----------------------------");
  // console.log(content);
  // console.log("----------------------------");
  // console.log(oldStr);
  // console.log("----------------------------");
  // console.log(newStr);
  // console.log("----------------------------");

  if (occurrences === 0) {
    return new Err(
      new SrchdError(
        "string_edit_error",
        `String to replace not found in content to edit`
      )
    );
  }

  if (occurrences !== expectedReplacements) {
    return new Err(
      new SrchdError(
        "string_edit_error",
        `Expected ${expectedReplacements} replacements, but found ${occurrences} occurrences`
      )
    );
  }

  return new Ok(content.replace(regex, newStr));
}

export const STRING_EDIT_INSTRUCTIONS = `\
**Requirements**:
- \`old_str\` NEEDS TO contain the precise literal content for substituation (preserving all spacing, formatting, line breaks, etc).
- \`new_str\` NEEDS TO contain the precise literal content that will substitute \`old_str\` (maintaining all spacing, formatting, line breaks, etc). Verify the output maintains proper syntax and follows best practices.
- DO NOT apply escaping to \`old_str\` or \`new_str\`, as this violates the literal text requirement.
- \`old_str\` NEEDS TO provide unique identification for the specific instance to replace. Include surrounding textual context BEFORE and AFTER the target content.

**Batch replacements**:
Define \`expected_replacements\` (optional, defaults to 1) when the change is meant to impact more than one occurrence. If there is a mismatch the tool will error.`;
