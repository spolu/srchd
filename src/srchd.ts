#!/usr/bin/env node

import { Command } from "commander";
import { readFileContent } from "./lib/fs";
import { SrchdError } from "./lib/error";
import { Err } from "./lib/result";
import { ExperimentResource } from "./resources/experiment";
import { AgentResource } from "./resources/agent";
import { Runner } from "./runner";
import { AnthropicModel } from "./models/anthropic";
import { GeminiModel } from "./models/gemini";
import { createClientServerPair } from "./lib/mcp";
import { createSystemPromptSelfEditServer } from "./tools/system_prompt_edit";
import { newID4 } from "./lib/utils";
import { createPublicationsServer } from "./tools/publications";

const exitWithError = (err: Err<SrchdError>) => {
  console.error(
    `\x1b[31mError [${err.error.code}] ${err.error.message}\x1b[0m`
  );
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
  .requiredOption(
    "-p, --problem <problem_file>",
    "Problem description file path"
  )
  .action(async (name, options) => {
    console.log(`Creating experiment: ${name}`);

    // Read problem from file
    const problem = await readFileContent(options.problem_file);
    if (problem.isErr()) {
      return exitWithError(problem);
    }

    const experiment = await ExperimentResource.create({
      name,
      problem: problem.value,
    });

    if (experiment.isErr()) {
      return exitWithError(experiment);
    }

    console.table([experiment.value.toJSON()]);
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

    console.table(
      experiments.map((exp) => {
        const e = exp.toJSON();
        e.problem =
          e.problem.substring(0, 32) + (e.problem.length > 32 ? "..." : "");
        return e;
      })
    );
  });

// Agent commands
const agentCmd = program.command("agent").description("Manage agents");

agentCmd
  .command("create")
  .description("Create a new agent")
  .requiredOption("-e, --experiment <experiment>", "Experiment name")
  .requiredOption(
    "-s, --system <system_prompt_file>",
    "System prompt file path"
  )
  .option("-n, --name <name>", "Agent name")
  .action(async (options) => {
    let name = options.name;

    if (!name) {
      name = newID4();
    }

    console.log(
      `Creating agent: ${name} for experiment: ${options.experiment}`
    );

    // Read system prompt from file
    const system = await readFileContent(options.system);
    if (system.isErr()) {
      return exitWithError(system);
    }

    // Find the experiment first
    const experiment = await ExperimentResource.findByName(options.experiment);
    if (!experiment) {
      return exitWithError(
        new Err(
          new SrchdError(
            "not_found_error",
            `Experiment '${options.experiment}' not found.`
          )
        )
      );
    }

    const agent = await AgentResource.create(
      experiment,
      { name },
      { system: system.value }
    );

    if (agent.isErr()) {
      return exitWithError(agent);
    }

    console.table(
      [agent.value].map((agent) => {
        const a = agent.toJSON();
        a.system =
          a.system.substring(0, 32) + (a.system.length > 32 ? "..." : "");
        // @ts-expect-error: clean-up hack
        delete a.evolutions;
        return a;
      })
    );
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
      return exitWithError(
        new Err(
          new SrchdError(
            "not_found_error",
            `Experiment '${options.experiment}' not found.`
          )
        )
      );
    }

    const agents = await AgentResource.listByExperiment(experiment);

    if (agents.length === 0) {
      console.log("No agents found for this experiment.");
      return;
    }

    console.table(
      agents.map((agent) => {
        const a = agent.toJSON();
        a.system =
          a.system.substring(0, 32) + (a.system.length > 32 ? "..." : "");
        // @ts-expect-error: clean-up hack
        delete a.evolutions;
        return a;
      })
    );
  });

agentCmd
  .command("show <name>")
  .description("Show agent details")
  .requiredOption("-e, --experiment <experiment>", "Experiment name")
  .action(async (name, options) => {
    // Find the experiment first
    const experiment = await ExperimentResource.findByName(options.experiment);
    if (!experiment) {
      return exitWithError(
        new Err(
          new SrchdError(
            "not_found_error",
            `Experiment '${options.experiment}' not found.`
          )
        )
      );
    }

    const agent = await AgentResource.findByName(experiment, name);
    if (!agent) {
      return exitWithError(
        new Err(
          new SrchdError(
            "not_found_error",
            `Agent '${name}' not found in experiment '${options.experiment}'.`
          )
        )
      );
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
      return exitWithError(
        new Err(
          new SrchdError(
            "not_found_error",
            `Experiment '${options.experiment}' not found.`
          )
        )
      );
    }

    const agent = await AgentResource.findByName(experiment, name);
    if (!agent) {
      return exitWithError(
        new Err(
          new SrchdError(
            "not_found_error",
            `Agent '${name}' not found in experiment '${options.experiment}'.`
          )
        )
      );
    }

    await agent.delete();
    console.log(`Agent '${name}' deleted successfully.`);
  });

agentCmd
  .command("test <name>")
  .description("Test an agent")
  .requiredOption("-e, --experiment <experiment>", "Experiment name")
  .action(async (name, options) => {
    // Find the experiment first
    const experiment = await ExperimentResource.findByName(options.experiment);
    if (!experiment) {
      return exitWithError(
        new Err(
          new SrchdError(
            "not_found_error",
            `Experiment '${options.experiment}' not found.`
          )
        )
      );
    }

    const agent = await AgentResource.findByName(experiment, name);
    if (!agent) {
      return exitWithError(
        new Err(
          new SrchdError(
            "not_found_error",
            `Agent '${name}' not found in experiment '${options.experiment}'.`
          )
        )
      );
    }

    const [publicationClient] = await createClientServerPair(
      createPublicationsServer(experiment, agent)
    );
    const [systemPromptSelfEditClient] = await createClientServerPair(
      createSystemPromptSelfEditServer(agent)
    );

    const model = new AnthropicModel(
      {
        thinking: "low",
      },
      "claude-sonnet-4-20250514"
    );
    // const model = new GeminiModel({}, "gemini-2.5-flash");
    const runner = await Runner.initialize(
      experiment,
      agent,
      [publicationClient, systemPromptSelfEditClient],
      model
    );

    if (runner.isErr()) {
      return exitWithError(runner);
    }

    const res = await runner.value.tick();
    if (res.isErr()) {
      return exitWithError(res);
    }
  });

program.parse();
