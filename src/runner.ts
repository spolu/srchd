import { BaseModel } from "./model";
import { AgentResource } from "./resources/agent";
import { ExperimentResource } from "./resources/experiment";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

export class Runner {
  private experiment: ExperimentResource;
  private agent: AgentResource;
  private mcpClients: Client[];
  // private model: BaseModel;

  constructor(
    experiment: ExperimentResource,
    agent: AgentResource,
    mcpClients: Client[],
    // model: BaseModel
  ) {
    this.experiment = experiment;
    this.agent = agent;
    this.mcpClients = mcpClients;
    // this.model = model;
  }
}
