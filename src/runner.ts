import { BaseModel, Tool } from "./models";
import { AgentResource } from "./resources/agent";
import { ExperimentResource } from "./resources/experiment";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

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

  async tools(): Promise<Tool[]> {
    const tools: Tool[] = [];
    for (const client of this.mcpClients) {
      const clientTools = await client.listTools();
    }
  }

  async tick(): Promise<void> {
    // Implement the logic for a single tick of the runner
    console.log(`Running tick for agent: ${this.agent.toJSON().name}`);
  }
}
