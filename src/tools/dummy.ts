import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const SERVER_NAME = "dummy";
const SERVER_VERSION = "0.1.0";

export function createDummyServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    title: "Dummy Tools",
    description: "Dummy tools for testing purposes.",
    version: SERVER_VERSION,
  });

  server.tool(
    "echo",
    "An echo tool that returns the input as output.",
    {
      data: z.string().describe("The data to echo back."),
    },
    async (params) => {
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: params.data,
          },
        ],
      };
    }
  );

  server.tool(
    "ping",
    "A ping tool that returns a simple `pong` message.",
    {},
    async () => {
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: "pong",
          },
        ],
      };
    }
  );

  return server;
}

export async function createDummyClientServerPair(): Promise<
  [Client, McpServer]
> {
  const server = createDummyServer();
  const client = new Client({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return [client, server];
}
