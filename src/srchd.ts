#!/usr/bin/env node

import { Command } from "commander";

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
    if (!options.problem) {
      console.error("Error: Problem description is required.");
      process.exit(1);
    }

    // TODO: Implement experiment creation logic
  });

experimentCmd
  .command("list")
  .description("List all experiments")
  .action(async () => {
    console.log("Listing experiments:");
    // TODO: Implement experiment listing logic
  });

// Agent commands
const agentCmd = program.command("agent").description("Manage agents");

agentCmd
  .command("create <name>")
  .description("Create a new agent")
  .requiredOption("-e, --experiment <experiment>", "Experiment name")
  .option("-s, --system-prompt <prompt>", "System prompt for the agent")
  .action(async (name, options) => {
    console.log(
      `Creating agent: ${name} for experiment: ${options.experiment}`
    );
    // TODO: Implement agent creation logic
  });

agentCmd
  .command("list")
  .description("List agents")
  .requiredOption("-e, --experiment <experiment>", "Experiment name")
  .action(async (options) => {
    console.log(`Listing agents for experiment: ${options.experiment}`);
    // TODO: Implement agent listing logic
  });

program.parse();
