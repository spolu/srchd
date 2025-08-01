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
  .requiredOption("-p, --problem <problem>", "Problem description file path")
  .action(async (name, options) => {
    console.log(`Creating experiment: ${name}`);
    
    // Read problem from file
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
  .requiredOption("-s, --system-prompt <prompt>", "System prompt file path")
  .action(async (name, options) => {
    console.log(
      `Creating agent: ${name} for experiment: ${options.experiment}`
    );
    
    // Read system prompt from file
    const systemPrompt = await readFileContent(options.systemPrompt);
    if (systemPrompt.isErr()) {
      return exitWithError(systemPrompt);
    }
    
    // Find the experiment first
    const experiment = await ExperimentResource.findByName(options.experiment);
    if (!experiment) {
      return exitWithError(new Err(new SrchdError("not_found_error", `Experiment '${options.experiment}' not found.`)));
    }

    // Check if agent already exists
    const existingAgent = await AgentResource.findByName(experiment, name);
    if (existingAgent) {
      return exitWithError(new Err(new SrchdError("not_found_error", `Agent '${name}' already exists in experiment '${options.experiment}'.`)));
    }

    const agent = await AgentResource.create(experiment, {
      name,
      systemPrompt: systemPrompt.value,
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
      return exitWithError(new Err(new SrchdError("not_found_error", `Experiment '${options.experiment}' not found.`)));
    }

    const agents = await AgentResource.listByExperiment(experiment);
    
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
      return exitWithError(new Err(new SrchdError("not_found_error", `Experiment '${options.experiment}' not found.`)));
    }

    const agent = await AgentResource.findByName(experiment, name);
    if (!agent) {
      return exitWithError(new Err(new SrchdError("not_found_error", `Agent '${name}' not found in experiment '${options.experiment}'.`)));
    }

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
      return exitWithError(new Err(new SrchdError("not_found_error", `Experiment '${options.experiment}' not found.`)));
    }

    const agent = await AgentResource.findByName(experiment, name);
    if (!agent) {
      return exitWithError(new Err(new SrchdError("not_found_error", `Agent '${name}' not found in experiment '${options.experiment}'.`)));
    }

    await agent.delete();
    console.log(`Agent '${name}' deleted successfully.`);
  });

program.parse();
