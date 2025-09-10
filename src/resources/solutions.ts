import { db } from "../db";
import { solutions } from "../db/schema";
import { eq, InferSelectModel, InferInsertModel, and, desc } from "drizzle-orm";
import { ExperimentResource } from "./experiment";
import { Agent, AgentResource } from "./agent";
import { concurrentExecutor } from "../lib/async";

type Solution = InferSelectModel<typeof solutions>;

export class SolutionResource {
  private data: Solution;
  private agent: Agent;
  experiment: ExperimentResource;

  private constructor(data: Solution, experiment: ExperimentResource) {
    this.data = data;
    this.agent = {
      id: 0,
      name: "",
      created: new Date(),
      updated: new Date(),
      experiment: experiment.toJSON().id,
      provider: "anthropic" as const,
      model: "claude-sonnet-4-20250514" as const,
      thinking: "low" as const,
    };
    this.experiment = experiment;
  }

  private async finalize(): Promise<SolutionResource> {
    const agent = await AgentResource.findById(this.data.agent);
    if (agent) {
      this.agent = agent.toJSON();
    }
    return this;
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

    return await new SolutionResource(result, experiment).finalize();
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

    return await concurrentExecutor(
      results,
      async (sol) => await new SolutionResource(sol, experiment).finalize(),
      { concurrency: 8 }
    );
  }

  static async listByExperiment(
    experiment: ExperimentResource
  ): Promise<SolutionResource[]> {
    const results = await db
      .select()
      .from(solutions)
      .where(and(eq(solutions.experiment, experiment.toJSON().id)))
      .orderBy(desc(solutions.created));

    return await concurrentExecutor(
      results,
      async (sol) => await new SolutionResource(sol, experiment).finalize(),
      { concurrency: 8 }
    );
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
    return await new SolutionResource(created, experiment).finalize();
  }

  toJSON() {
    return {
      ...this.data,
      agent: this.agent,
    };
  }
}
