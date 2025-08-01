import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: Record<string, any>) => Promise<any>;
}

/**
 * Dummy MCP server for agent tools
 * This is a minimal implementation that can be extended with actual tools
 */
export class DummyMCPServer {
  private server: Server;
  private tools: Map<string, Tool> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: "dummy-tools-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.registerDummyTools();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Array.from(this.tools.values()).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const tool = this.tools.get(name);

      if (!tool) {
        throw new Error(`Tool ${name} not found`);
      }

      try {
        const result = await tool.handler(args || {});
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private registerDummyTools() {
    // Dummy echo tool
    this.registerTool({
      name: "echo",
      description: "Echo back the input message",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Message to echo back",
          },
        },
        required: ["message"],
      },
      handler: async (args) => {
        return { echo: args.message };
      },
    });

    // Dummy math tool
    this.registerTool({
      name: "add",
      description: "Add two numbers",
      inputSchema: {
        type: "object",
        properties: {
          a: {
            type: "number",
            description: "First number",
          },
          b: {
            type: "number",
            description: "Second number",
          },
        },
        required: ["a", "b"],
      },
      handler: async (args) => {
        return { result: args.a + args.b };
      },
    });
  }

  registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  async connect(transport?: any): Promise<void> {
    // For in-memory usage, we don't need actual transport connection
    // This method exists for future extensibility
    console.log("Dummy MCP server connected");
  }

  async listTools() {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async callTool(name: string, args: Record<string, any>) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }
    return await tool.handler(args);
  }

  getServer(): Server {
    return this.server;
  }
}