import { db } from "../db";
import { agents } from "../db/schema";
import { eq, InferSelectModel, InferInsertModel, and } from "drizzle-orm";

type Agent = InferSelectModel<typeof agents>;

export class AgentResource {
  private data: Agent;

  private constructor(data: Agent) {
    this.data = data;
  }

  static async findByName(name: string, experimentId: number): Promise<AgentResource | null> {
    const result = await db
      .select()
      .from(agents)
      .where(and(eq(agents.name, name), eq(agents.experiment, experimentId)))
      .limit(1);

    return result[0] ? new AgentResource(result[0]) : null;
  }

  static async findById(id: number): Promise<AgentResource | null> {
    const result = await db
      .select()
      .from(agents)
      .where(eq(agents.id, id))
      .limit(1);

    return result[0] ? new AgentResource(result[0]) : null;
  }

  static async findByExperiment(experimentId: number): Promise<AgentResource[]> {
    const results = await db
      .select()
      .from(agents)
      .where(eq(agents.experiment, experimentId));

    return results.map((data) => new AgentResource(data));
  }

  static async create(
    data: Omit<
      InferInsertModel<typeof agents>,
      "id" | "created" | "updated"
    >
  ): Promise<AgentResource> {
    const [created] = await db.insert(agents).values(data).returning();

    return new AgentResource(created);
  }

  static async all(): Promise<AgentResource[]> {
    const results = await db.select().from(agents);
    return results.map((data) => new AgentResource(data));
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

  // Getters for common properties
  get id() {
    return this.data.id;
  }

  get name() {
    return this.data.name;
  }

  get experimentId() {
    return this.data.experiment;
  }

  get systemPrompt() {
    return this.data.systemPrompt;
  }
}