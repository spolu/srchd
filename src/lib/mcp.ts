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
        text: `Error [${error.code}] ${error.message}`,
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
