import { db } from "../db";
import { solutions } from "../db/schema";
import { eq, InferSelectModel, InferInsertModel, and, desc } from "drizzle-orm";
import { ExperimentResource } from "./experiment";
import { AgentResource } from "./agent";

type Solution = InferSelectModel<typeof solutions>;

export class SolutionResource {
  private data: Solution;
  experiment: ExperimentResource;

  private constructor(data: Solution, experiment: ExperimentResource) {
    this.data = data;
    this.experiment = experiment;
  }

  static async findLatestByAgent(
    experiment: ExperimentResource,
    agent: AgentResource
  ): Promise<SolutionResource | null> {
    const [result] = await db
      .select()
      .from(solutions)
      .where(
        and(
          eq(solutions.experiment, experiment.toJSON().id),
          eq(solutions.agent, agent.toJSON().id)
        )
      )
      .orderBy(desc(solutions.created))
      .limit(1);

    if (!result) {
      return null;
    }

    return new SolutionResource(result, experiment);
  }

  static async listByAgent(
    experiment: ExperimentResource,
    agent: AgentResource
  ): Promise<SolutionResource[]> {
    const results = await db
      .select()
      .from(solutions)
      .where(
        and(
          eq(solutions.experiment, experiment.toJSON().id),
          eq(solutions.agent, agent.toJSON().id)
        )
      )
      .orderBy(desc(solutions.created));

    return results.map((sol) => new SolutionResource(sol, experiment));
  }

  static async listByExperiment(
    experiment: ExperimentResource
  ): Promise<SolutionResource[]> {
    const results = await db
      .select()
      .from(solutions)
      .where(and(eq(solutions.experiment, experiment.toJSON().id)))
      .orderBy(desc(solutions.created));

    return results.map((sol) => new SolutionResource(sol, experiment));
  }

  static async create(
    experiment: ExperimentResource,
    agent: AgentResource,
    data: Omit<
      InferInsertModel<typeof solutions>,
      "id" | "created" | "updated" | "experiment" | "agent"
    >
  ): Promise<SolutionResource> {
    const [created] = await db
      .insert(solutions)
      .values({
        ...data,
        experiment: experiment.toJSON().id,
        agent: agent.toJSON().id,
      })
      .returning();
    return new SolutionResource(created, experiment);
  }

  toJSON(): Solution {
    return this.data;
  }
}
