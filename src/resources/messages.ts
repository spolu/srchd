import { db } from "../db";
import { messages } from "../db/schema";
import { eq, InferSelectModel, and, desc } from "drizzle-orm";
import { ExperimentResource } from "./experiment";
import { Err, Ok, Result } from "../lib/result";
import { normalizeError, SrchdError } from "../lib/error";
import { AgentResource } from "./agent";
import { Message } from "../models";

export class MessageResource {
  private data: InferSelectModel<typeof messages>;
  experiment: ExperimentResource;

  private constructor(
    data: InferSelectModel<typeof messages>,
    experiment: ExperimentResource
  ) {
    this.data = data;
    this.experiment = experiment;
  }

  static async listMessagesByAgent(
    experiment: ExperimentResource,
    agent: AgentResource,
    options: {
      limit?: number;
    } = {}
  ): Promise<Result<MessageResource[], SrchdError>> {
    const results = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.experiment, experiment.toJSON().id),
          eq(messages.agent, agent.toJSON().id)
        )
      )
      .orderBy(desc(messages.position))
      .limit(options.limit ?? 128);

    return new Ok(results.map((msg) => new MessageResource(msg, experiment)));
  }

  static async create(
    experiment: ExperimentResource,
    agent: AgentResource,
    message: Message,
    positon: number
  ): Promise<Result<MessageResource, SrchdError>> {
    try {
      const [created] = await db
        .insert(messages)
        .values({
          experiment: experiment.toJSON().id,
          agent: agent.toJSON().id,
          ...message,
          position: positon,
        })
        .returning();

      return new Ok(new MessageResource(created, experiment));
    } catch (error) {
      return new Err(
        new SrchdError(
          "resource_creation_error",
          "Failed to create agent",
          normalizeError(error)
        )
      );
    }
  }

  toJSON(): Message {
    return {
      role: this.data.role,
      content: this.data.content,
    };
  }
}
