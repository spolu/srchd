import { eq, sum } from "drizzle-orm";
import { token_usages } from "../db/schema";
import { AgentResource } from "./agent";
import { MessageResource } from "./messages";
import { db, Tx } from "../db";
import { TokenUsage } from "../models/index";
import { ExperimentResource } from "./experiment";

export class TokenUsageResource {
  static async getExperimentTokenUsage(
    experiment: ExperimentResource,
  ): Promise<TokenUsage> {
    const results = await db
      .select({
        total: sum(token_usages.total),
        input: sum(token_usages.input),
        output: sum(token_usages.output),
        cached: sum(token_usages.cached),
        thinking: sum(token_usages.thinking),
      })
      .from(token_usages)
      .where(eq(token_usages.experiment, experiment.toJSON().id));

    return {
      total: Number(results[0].total) ?? 0,
      input: Number(results[0].input) ?? 0,
      output: Number(results[0].output) ?? 0,
      cached: Number(results[0].cached) ?? 0,
      thinking: Number(results[0].thinking) ?? 0,
    };
  }

  static async logUsage(
    experiment: ExperimentResource,
    agent: AgentResource,
    message: MessageResource,
    tokenUsage: TokenUsage,
    options?: { tx?: Tx },
  ): Promise<void> {
    const executor = options?.tx ?? db;
    const [created] = await executor
      .insert(token_usages)
      .values({
        experiment: experiment.toJSON().id,
        agent: agent.toJSON().id,
        message: message.toJSON().id,
        ...tokenUsage,
      })
      .returning();
  }
}
