import { db } from "../db";
import { experiments } from "../db/schema";
import { eq, InferSelectModel, InferInsertModel } from "drizzle-orm";
import { normalizeError, SrchdError } from "../lib/error";
import { Err, Ok, Result } from "../lib/result";

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
  ): Promise<Result<ExperimentResource, SrchdError>> {
    try {
      const [created] = await db.insert(experiments).values(data).returning();
      return new Ok(new ExperimentResource(created));
    } catch (error) {
      return new Err(
        new SrchdError(
          "resource_creation_error",
          "Failed to create experiment",
          normalizeError(error)
        )
      );
    }
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
}
