import { eq, InferSelectModel } from "drizzle-orm";
import { tokens } from "../db/schema";
import { AgentResource } from "./agent";
import { MessageResource } from "./messages";
import { db, Tx } from "../db";

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

  static async getAgentTokenCount(agent: AgentResource): Promise<number> {
    const results = await db
      .select()
      .from(tokens)
      .where(eq(tokens.agent, agent.toJSON().id));

    return results.map((r) => r.count).reduce((a, b) => a + b, 0);
  }

  static async create(
    agent: AgentResource,
    message: MessageResource,
    tokenCount: number,
    options?: { tx?: Tx },
  ): Promise<TokensResource> {
    const executor = options?.tx ?? db;
    const [created] = await executor
      .insert(tokens)
      .values({
        message: message.toJSON().id,
        agent: agent.toJSON().id,
        count: tokenCount,
      })
      .returning();

    return new TokensResource(created, agent, message);
  }

  id(): number {
    return this.data.id;
  }

  toJSON(): { id: number; count: number; agent: number; message: number } {
    return {
      id: this.data.id,
      count: this.data.count,
      agent: this.data.agent,
      message: this.data.message,
    };
  }
}
