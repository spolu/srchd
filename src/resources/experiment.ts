import { db } from "../db";
import { experiments } from "../db/schema";
import { eq, InferSelectModel, InferInsertModel } from "drizzle-orm";

type Experiment = InferSelectModel<typeof experiments>;

export class ExperimentResource {
  private data: Experiment;

  private constructor(data: Experiment) {
    this.data = data;
  }

  static async findByName(name: string): Promise<ExperimentResource | null> {
    const result = await db
      .select()
      .from(experiments)
      .where(eq(experiments.name, name))
      .limit(1);

    return result[0] ? new ExperimentResource(result[0]) : null;
  }

  static async findById(id: number): Promise<ExperimentResource | null> {
    const result = await db
      .select()
      .from(experiments)
      .where(eq(experiments.id, id))
      .limit(1);

    return result[0] ? new ExperimentResource(result[0]) : null;
  }

  static async create(
    data: Omit<
      InferInsertModel<typeof experiments>,
      "id" | "created" | "updated"
    >
  ): Promise<ExperimentResource> {
    const [created] = await db.insert(experiments).values(data).returning();

    return new ExperimentResource(created);
  }

  static async all(): Promise<ExperimentResource[]> {
    const results = await db.select().from(experiments);
    return results.map((data) => new ExperimentResource(data));
  }

  async update(
    data: Partial<Omit<InferInsertModel<typeof experiments>, "id" | "created">>
  ): Promise<ExperimentResource> {
    const [updated] = await db
      .update(experiments)
      .set({ ...data, updated: new Date() })
      .where(eq(experiments.id, this.data.id))
      .returning();

    this.data = updated;
    return this;
  }

  async delete(): Promise<void> {
    await db.delete(experiments).where(eq(experiments.id, this.data.id));
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
}
