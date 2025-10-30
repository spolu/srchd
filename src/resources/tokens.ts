import { eq, InferSelectModel, inArray } from "drizzle-orm";
import { tokens } from "../db/schema";
import { AgentResource } from "./agent";
import { MessageResource } from "./messages";
import { db, Tx } from "../db";
import { TokenUsage } from "../lib/token";

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

  static async getAgentTokenUsage(agent: AgentResource): Promise<TokenUsage> {
    const results = await db
      .select()
      .from(tokens)
      .where(eq(tokens.agent, agent.toJSON().id));

    return results
      .map((r) => ({
        input: r.input,
        output: r.output,
        cached: r.cached ?? undefined,
        thinking: r.thinking ?? undefined,
        total: r.total,
      }))
      .reduce(
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

  static async getExperiment

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
