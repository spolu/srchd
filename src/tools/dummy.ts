import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function createServer(): McpServer {
  const server = new McpServer({
    name: "dummy",
    title: "Dummy Tools",
    description: "Dummy tools for testing purposes.",
    version: "0.1.0",
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

export default createServer;
