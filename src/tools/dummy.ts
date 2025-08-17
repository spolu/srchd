import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
