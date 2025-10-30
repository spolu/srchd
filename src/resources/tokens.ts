import { eq, InferSelectModel, inArray } from "drizzle-orm";
import { agents, tokens } from "../db/schema";
import { AgentResource } from "./agent";
import { MessageResource } from "./messages";
import { db, Tx } from "../db";
import { ExperimentResource } from "./experiment";
import { TokenUsage } from "../models/index";

export class TokensResource {
  private data: InferSelectModel<typeof tokens>;
  agent: AgentResource;
  message: MessageResource;

  private constructor(
    data: InferSelectModel<typeof tokens>,
    agent: AgentResource,
    message: MessageResource,
  ) {
    this.data = data;
    this.agent = agent;
    this.message = message;
  }

  private static extractTokenUsage(data: InferSelectModel<typeof tokens>) {
    return {
      total: data.total,
      input: data.input,
      output: data.output,
      cached: data.cached ?? undefined,
      thinking: data.thinking ?? undefined,
    };
  }

  private static tokenUsageReduce(tokenUsages: TokenUsage[]): TokenUsage {
    return tokenUsages.reduce(
      (a, b) => ({
        total: a.total + b.total,
        input: a.input + b.input,
        output: a.output + b.output,
        cached:
          a.cached && b.cached ? a.cached + b.cached : (a.cached ?? b.cached),
        thinking:
          a.thinking && b.thinking
            ? a.thinking + b.thinking
            : (a.thinking ?? b.thinking),
      }),
      {
        total: 0,
        input: 0,
        output: 0,
        cached: undefined,
        thinking: undefined,
      },
    );
  }

  static async getAgentTokenUsage(agent: AgentResource): Promise<TokenUsage> {
    const results = await db
      .select()
      .from(tokens)
      .where(eq(tokens.agent, agent.toJSON().id));
    return this.tokenUsageReduce(results.map(this.extractTokenUsage));
  }

  static async getExperimentTokenUsage(
    experiment: ExperimentResource,
  ): Promise<TokenUsage | undefined> {
    const experimentAgents = await db
      .select()
      .from(agents)
      .where(eq(agents.experiment, experiment.toJSON().id));

    if (experimentAgents.length === 0) {
      return undefined;
    }

    const results = await db
      .select()
      .from(tokens)
      .where(
        inArray(
          tokens.agent,
          experimentAgents.map((a) => a.id),
        ),
      );

    return this.tokenUsageReduce(results.map(this.extractTokenUsage));
  }

  static async create(
    agent: AgentResource,
    message: MessageResource,
    tokenCount: TokenUsage,
    options?: { tx?: Tx },
  ): Promise<TokensResource> {
    const executor = options?.tx ?? db;
    const [created] = await executor
      .insert(tokens)
      .values({
        message: message.toJSON().id,
        agent: agent.toJSON().id,
        ...tokenCount,
      })
      .returning();

    return new TokensResource(created, agent, message);
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
