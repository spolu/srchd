import { db } from "../db";
import { messages } from "../db/schema";
import { eq, InferSelectModel, and, asc } from "drizzle-orm";
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

  static async findById(
    experiment: ExperimentResource,
    agent: AgentResource,
    id: number
  ): Promise<MessageResource | null> {
    const result = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.experiment, experiment.toJSON().id),
          eq(messages.agent, agent.toJSON().id),
          eq(messages.id, id)
        )
      )
      .limit(1);

    return result[0] ? new MessageResource(result[0], experiment) : null;
  }

  static async listMessagesByAgent(
    experiment: ExperimentResource,
    agent: AgentResource
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
      .orderBy(asc(messages.position));

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

  position(): number {
    return this.data.position;
  }

  toJSON(): Message {
    return {
      role: this.data.role,
      content: this.data.content,
    };
  }
}
