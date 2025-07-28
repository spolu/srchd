#!/usr/bin/env node

import { Command } from "commander";
import { db } from "./db";
import { experiments } from "./db/schema";
import { eq } from "drizzle-orm";

const program = new Command();

program
  .name("runner")
  .description("or1g1n/runner")
  .requiredOption("--experiment <name>", "Experiment ID to run")
  .option("--create", "Create experiment if it doesn't exist")
  .action(async (options) => {
    const { db: dbPath, experiment: xpName, create } = options;

    let experiment = await db
      .select()
      .from(experiments)
      .where(eq(experiments.name, xpName));

    if (!experiment && create) {
      experiment = await db
        .insert(experiments)
        .values({ name: xpName, problem: "" })
        .returning();
    }

    if (!experiment) {
      console.error(`Experiment '${xpName}' not found`);
      process.exit(1);
    }

    console.log(
      `Running experiment: ${experiment.name} (ID: ${experiment.id})`
    );
    // Your experiment logic here
  });

program.parse();
