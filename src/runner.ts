import { JSONSchema7 } from "json-schema";
import { BaseModel, Tool } from "./models";
import { AgentResource } from "./resources/agent";
import { ExperimentResource } from "./resources/experiment";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { normalizeError, SrchdError } from "./lib/error";
import { Err, Ok, Result } from "./lib/result";

export class Runner {
  private experiment: ExperimentResource;
  private agent: AgentResource;
  private mcpClients: Client[];
  private model: BaseModel;

  constructor(
    experiment: ExperimentResource,
    agent: AgentResource,
    mcpClients: Client[],
    model: BaseModel
  ) {
    this.experiment = experiment;
    this.agent = agent;
    this.mcpClients = mcpClients;
    this.model = model;
  }

  async tools(): Promise<Result<Tool[], SrchdError>> {
    const tools: Tool[] = [];

    for (const client of this.mcpClients) {
      try {
        const ct = await client.listTools();
        for (const tool of ct.tools) {
          tools.push({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema as JSONSchema7,
          });
        }
      } catch (error) {
        return new Err(
          new SrchdError(
            "tool_error",
            `Error listing tools from client ${
              client.getServerVersion()?.name
            }`,
            normalizeError(error)
          )
        );
      }
    }

    return new Ok(tools);
  }

  async tick(): Promise<Result<void, SrchdError>> {
    // Implement the logic for a single tick of the runner
    console.log(`Running tick for agent: ${this.agent.toJSON().name}`);
    const tools = await this.tools();
    if (tools.isErr()) {
      return tools;
    }

    const message = await this.model.run(
      [],
      this.experiment.toJSON().problem,
      "any",
      tools.value
    );
    if (message.isErr()) {
      return message;
    }

    console.log(message);
    return new Ok(undefined);
  }
}
