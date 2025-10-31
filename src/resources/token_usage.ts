import { eq, InferSelectModel, inArray, sum } from "drizzle-orm";
import { token_usages } from "../db/schema";
import { AgentResource } from "./agent";
import { MessageResource } from "./messages";
import { db, Tx } from "../db";
import { TokenUsage } from "../models/index";
import { ExperimentResource } from "./experiment";

export class TokenUsageResource {
  private data: InferSelectModel<typeof token_usages>;
  agent: AgentResource;
  message: MessageResource;

  private constructor(
    data: InferSelectModel<typeof token_usages>,
    agent: AgentResource,
    message: MessageResource,
  ) {
    this.data = data;
    this.agent = agent;
    this.message = message;
  }

  static async getAgentTokenUsage(agent: AgentResource): Promise<TokenUsage> {
    const results = await db
      .select({
        total: sum(token_usages.total),
        input: sum(token_usages.input),
        output: sum(token_usages.output),
        cached: sum(token_usages.cached),
        thinking: sum(token_usages.thinking),
      })
      .from(token_usages)
      .where(eq(token_usages.agent, agent.toJSON().id));

    return {
      total: Number(results[0].total) ?? 0,
      input: Number(results[0].input) ?? 0,
      output: Number(results[0].output) ?? 0,
      cached: Number(results[0].cached) ?? 0,
      thinking: Number(results[0].thinking) ?? 0,
    };
  }

  static async create(
    agent: AgentResource,
    experiment: ExperimentResource,
    message: MessageResource,
    tokenCount: TokenUsage,
    options?: { tx?: Tx },
  ): Promise<TokenUsageResource> {
    const executor = options?.tx ?? db;
    const [created] = await executor
      .insert(token_usages)
      .values({
        experiment: experiment.toJSON().id,
        message: message.toJSON().id,
        agent: agent.toJSON().id,
        ...tokenCount,
      })
      .returning();

    return new TokenUsageResource(created, agent, message);
  }

  id(): number {
    return this.data.id;
  }

  toJSON(): { id: number; usage: TokenUsage; agent: number; message: number } {
    return {
      id: this.data.id,
      agent: this.data.agent,
      message: this.data.message,
      usage: {
        total: this.data.total,
        input: this.data.input,
        output: this.data.output,
        cached: this.data.cached ?? undefined,
        thinking: this.data.thinking ?? undefined,
      },
    };
  }
}
