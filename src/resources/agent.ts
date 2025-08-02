import { db } from "../db";
import { agents } from "../db/schema";
import { eq, InferSelectModel, InferInsertModel, and } from "drizzle-orm";
import { ExperimentResource } from "./experiment";
import { Err, Ok, Result } from "../lib/result";
import { normalizeError, SrchdError } from "../lib/error";

type Agent = InferSelectModel<typeof agents>;

export class AgentResource {
  private data: Agent;
  experiment: ExperimentResource;

  private constructor(data: Agent, experiment: ExperimentResource) {
    this.data = data;
    this.experiment = experiment;
  }

  static async findByName(
    experiment: ExperimentResource,
    name: string
  ): Promise<AgentResource | null> {
    const result = await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.name, name),
          eq(agents.experiment, experiment.toJSON().id)
        )
      )
      .limit(1);

    return result[0] ? new AgentResource(result[0], experiment) : null;
  }

  static async findById(id: number): Promise<AgentResource | null> {
    const result = await db
      .select()
      .from(agents)
      .where(eq(agents.id, id))
      .limit(1);

    if (!result[0]) return null;

    const experiment = await ExperimentResource.findById(result[0].experiment);
    if (!experiment) return null;

    return new AgentResource(result[0], experiment);
  }

  static async listByExperiment(
    experiment: ExperimentResource
  ): Promise<AgentResource[]> {
    const results = await db
      .select()
      .from(agents)
      .where(eq(agents.experiment, experiment.toJSON().id));

    return results.map((data) => new AgentResource(data, experiment));
  }

  static async create(
    experiment: ExperimentResource,
    data: Omit<
      InferInsertModel<typeof agents>,
      "id" | "created" | "updated" | "experiment"
    >
  ): Promise<Result<AgentResource, SrchdError>> {
    try {
      const [created] = await db
        .insert(agents)
        .values({
          ...data,
          experiment: experiment.toJSON().id,
        })
        .returning();

      return new Ok(new AgentResource(created, experiment));
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

  async update(
    data: Partial<Omit<InferInsertModel<typeof agents>, "id" | "created">>
  ): Promise<AgentResource> {
    const [updated] = await db
      .update(agents)
      .set({ ...data, updated: new Date() })
      .where(eq(agents.id, this.data.id))
      .returning();

    this.data = updated;
    return this;
  }

  async delete(): Promise<void> {
    await db.delete(agents).where(eq(agents.id, this.data.id));
  }

  // Return raw data if needed
  toJSON() {
    return this.data;
  }
}

