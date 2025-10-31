import { eq, InferSelectModel, inArray, sum, and } from "drizzle-orm";
import { token_usages } from "../db/schema";
import { AgentResource } from "./agent";
import { MessageResource } from "./messages";
import { db, Tx } from "../db";
import { TokenUsage } from "../models/index";
import { ExperimentResource } from "./experiment";

export class TokenUsageResource {
  private data: InferSelectModel<typeof token_usages>;
  experiment: ExperimentResource;
  agent: AgentResource;
  message: MessageResource;
  private constructor(
    data: InferSelectModel<typeof token_usages>,
    experiment: ExperimentResource,
    agent: AgentResource,
    message: MessageResource,
  ) {
    this.data = data;
    this.experiment = experiment;
    this.agent = agent;
    this.message = message;
  }

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

  static async getAgentTokenUsage(
    experiment: ExperimentResource,
    agent: AgentResource,
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
      .where(
        and(
          eq(token_usages.agent, agent.toJSON().id),
          eq(token_usages.experiment, experiment.toJSON().id),
        ),
      );

    return {
      total: Number(results[0].total) ?? 0,
      input: Number(results[0].input) ?? 0,
      output: Number(results[0].output) ?? 0,
      cached: Number(results[0].cached) ?? 0,
      thinking: Number(results[0].thinking) ?? 0,
    };
  }

  static async create(
    experiment: ExperimentResource,
    agent: AgentResource,
    message: MessageResource,
    tokenUsage: TokenUsage,
    options?: { tx?: Tx },
  ): Promise<TokenUsageResource> {
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

    return new TokenUsageResource(created, experiment, agent, message);
  }
}
