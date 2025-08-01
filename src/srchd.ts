#!/usr/bin/env node

import { Command } from "commander";
import { readFileContent } from "./lib/fs";
import { SrchdError } from "./lib/error";
import { Err } from "./lib/result";
import { ExperimentResource } from "./resources/experiment";
import { AgentResource } from "./resources/agent";

const exitWithError = (err: Err<SrchdError>) => {
  console.error(`\x1b[31mError: ${err.error.message}\x1b[0m`);
  if (err.error.cause) {
    console.error(`\x1b[31mCause: ${err.error.cause.message}\x1b[0m`);
  }
  process.exit(1);
};

const program = new Command();

program
  .name("srchd")
  .description("Research experiment management CLI")
  .version("1.0.0");

// Experiment commands
const experimentCmd = program
  .command("experiment")
  .description("Manage experiments");

experimentCmd
  .command("run <name>")
  .description("Run an experiment")
  .action(async (name) => {
    console.log(`Running experiment: ${name}`);
    // TODO: Implement experiment run logic
  });

experimentCmd
  .command("create <name>")
  .description("Create a new experiment")
  .option("-p, --problem <problem>", "Problem description file")
  .action(async (name, options) => {
    console.log(`Creating experiment: ${name}`);
    if (!options.problem || typeof options.problem !== "string") {
      console.error("Error: Problem description is required.");
      process.exit(1);
    }

    const problem = await readFileContent(options.problem);

    if (problem.isErr()) {
      return exitWithError(problem);
    }

    const experiment = await ExperimentResource.create({
      name,
      problem: problem.value,
    });

    console.table([experiment.toJSON()]);
  });

experimentCmd
  .command("list")
  .description("List all experiments")
  .action(async () => {
    console.log("Listing experiments:");
    const experiments = await ExperimentResource.all();
    
    if (experiments.length === 0) {
      console.log("No experiments found.");
      return;
    }

    console.table(experiments.map(exp => exp.toJSON()));
  });

// Agent commands
const agentCmd = program.command("agent").description("Manage agents");

agentCmd
  .command("create <name>")
  .description("Create a new agent")
  .requiredOption("-e, --experiment <experiment>", "Experiment name")
  .option("-s, --system-prompt <prompt>", "System prompt for the agent", "You are a helpful AI research assistant.")
  .action(async (name, options) => {
    console.log(
      `Creating agent: ${name} for experiment: ${options.experiment}`
    );
    
    // Find the experiment first
    const experiment = await ExperimentResource.findByName(options.experiment);
    if (!experiment) {
      console.error(`Error: Experiment '${options.experiment}' not found.`);
      process.exit(1);
    }

    // Check if agent already exists
    const existingAgent = await AgentResource.findByName(name, experiment.toJSON().id);
    if (existingAgent) {
      console.error(`Error: Agent '${name}' already exists in experiment '${options.experiment}'.`);
      process.exit(1);
    }

    const agent = await AgentResource.create({
      name,
      experiment: experiment.toJSON().id,
      systemPrompt: options.systemPrompt,
    });

    console.table([agent.toJSON()]);
  });

agentCmd
  .command("list")
  .description("List agents")
  .requiredOption("-e, --experiment <experiment>", "Experiment name")
  .action(async (options) => {
    console.log(`Listing agents for experiment: ${options.experiment}`);
    
    // Find the experiment first
    const experiment = await ExperimentResource.findByName(options.experiment);
    if (!experiment) {
      console.error(`Error: Experiment '${options.experiment}' not found.`);
      process.exit(1);
    }

    const agents = await AgentResource.findByExperiment(experiment.toJSON().id);
    
    if (agents.length === 0) {
      console.log("No agents found for this experiment.");
      return;
    }

    console.table(agents.map(agent => agent.toJSON()));
  });

agentCmd
  .command("show <name>")
  .description("Show agent details")
  .requiredOption("-e, --experiment <experiment>", "Experiment name")
  .action(async (name, options) => {
    // Find the experiment first
    const experiment = await ExperimentResource.findByName(options.experiment);
    if (!experiment) {
      console.error(`Error: Experiment '${options.experiment}' not found.`);
      process.exit(1);
    }

    const agent = await AgentResource.findByName(name, experiment.toJSON().id);
    if (!agent) {
      console.error(`Error: Agent '${name}' not found in experiment '${options.experiment}'.`);
      process.exit(1);
    }

    console.table([agent.toJSON()]);
  });

agentCmd
  .command("update <name>")
  .description("Update an agent")
  .requiredOption("-e, --experiment <experiment>", "Experiment name")
  .option("-s, --system-prompt <prompt>", "New system prompt for the agent")
  .action(async (name, options) => {
    // Find the experiment first
    const experiment = await ExperimentResource.findByName(options.experiment);
    if (!experiment) {
      console.error(`Error: Experiment '${options.experiment}' not found.`);
      process.exit(1);
    }

    const agent = await AgentResource.findByName(name, experiment.toJSON().id);
    if (!agent) {
      console.error(`Error: Agent '${name}' not found in experiment '${options.experiment}'.`);
      process.exit(1);
    }

    const updateData: any = {};
    if (options.systemPrompt) {
      updateData.systemPrompt = options.systemPrompt;
    }

    if (Object.keys(updateData).length === 0) {
      console.log("No updates provided.");
      return;
    }

    await agent.update(updateData);
    console.log(`Agent '${name}' updated successfully.`);
    console.table([agent.toJSON()]);
  });

agentCmd
  .command("delete <name>")
  .description("Delete an agent")
  .requiredOption("-e, --experiment <experiment>", "Experiment name")
  .action(async (name, options) => {
    // Find the experiment first
    const experiment = await ExperimentResource.findByName(options.experiment);
    if (!experiment) {
      console.error(`Error: Experiment '${options.experiment}' not found.`);
      process.exit(1);
    }

    const agent = await AgentResource.findByName(name, experiment.toJSON().id);
    if (!agent) {
      console.error(`Error: Agent '${name}' not found in experiment '${options.experiment}'.`);
      process.exit(1);
    }

    await agent.delete();
    console.log(`Agent '${name}' deleted successfully.`);
  });

program.parse();
