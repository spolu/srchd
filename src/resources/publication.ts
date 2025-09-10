import { db } from "../db";
import { citations, publications, reviews } from "../db/schema";
import {
  eq,
  InferSelectModel,
  InferInsertModel,
  and,
  desc,
  inArray,
  count,
  isNull,
  getTableColumns,
} from "drizzle-orm";
import { ExperimentResource } from "./experiment";
import { Agent, AgentResource } from "./agent";
import { Err, Ok, Result } from "../lib/result";
import { normalizeError, SrchdError } from "../lib/error";
import { newID4, removeNulls } from "../lib/utils";
import { concurrentExecutor } from "../lib/async";
import { assertNever } from "../lib/assert";

const REVIEW_SCORES = {
  STRONG_ACCEPT: 2,
  ACCEPT: 1,
  REJECT: -1,
  STRONG_REJECT: -2,
};
const MIN_REVIEW_SCORE = 2;

export type Publication = InferSelectModel<typeof publications>;
export type Review = Omit<InferInsertModel<typeof reviews>, "author"> & {
  author: Agent | null;
};
export type Citation = InferInsertModel<typeof citations>;

export class PublicationResource {
  private data: Publication;
  private citations: { from: Citation[]; to: Citation[] };
  private reviews: Review[];
  private author: Agent;
  experiment: ExperimentResource;

  private constructor(data: Publication, experiment: ExperimentResource) {
    this.data = data;
    this.citations = { from: [], to: [] };
    this.reviews = [];
    this.author = {
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

  private async finalize(): Promise<PublicationResource> {
    const fromCitationsQuery = db
      .select()
      .from(citations)
      .where(eq(citations.from, this.data.id));
    const toCitationsQuery = db
      .select()
      .from(citations)
      .where(eq(citations.to, this.data.id));
    const reviewsQuery = db
      .select()
      .from(reviews)
      .where(eq(reviews.publication, this.data.id));
    const authorQuery = AgentResource.findById(this.data.author);

    const [fromCitationsResults, toCitationsResults, reviewsResults, author] =
      await Promise.all([
        fromCitationsQuery,
        toCitationsQuery,
        reviewsQuery,
        authorQuery,
      ]);

    this.citations.from = fromCitationsResults;
    this.citations.to = toCitationsResults;

    // Populate reviews with full agent information
    this.reviews = await Promise.all(
      reviewsResults.map(async (review) => {
        const reviewAgent = await AgentResource.findById(review.author);
        return {
          ...review,
          author: reviewAgent ? reviewAgent.toJSON() : null,
        };
      })
    );

    if (author) {
      this.author = author.toJSON();
    }
    return this;
  }

  static async listPublishedByExperiment(
    experiment: ExperimentResource,
    options: {
      order: "latest" | "citations";
      status: "PUBLISHED" | "SUBMITTED" | "REJECTED";
      limit: number;
      offset: number;
    }
  ): Promise<PublicationResource[]> {
    const { order, limit, offset } = options;

    const baseQuery = db
      .select({
        ...getTableColumns(publications),
        citationsCount: count(citations.id),
      })
      .from(publications)
      .leftJoin(citations, eq(citations.to, publications.id))
      .where(
        and(
          eq(publications.experiment, experiment.toJSON().id),
          eq(publications.status, "PUBLISHED")
        )
      )
      .groupBy(publications.id)
      .limit(limit)
      .offset(offset);

    const query = (() => {
      switch (order) {
        case "latest": {
          return baseQuery.orderBy(desc(publications.created));
        }
        case "citations": {
          return baseQuery.orderBy(desc(count(citations.id)));
        }
        default:
          assertNever(order);
      }
    })();
    const results = await query;

    return await concurrentExecutor(
      results,
      async (data) => {
        return await new PublicationResource(data, experiment).finalize();
      },
      { concurrency: 8 }
    );
  }

  static async listByExperimentAndReviewRequested(
    experiment: ExperimentResource,
    reviewer: AgentResource
  ): Promise<PublicationResource[]> {
    const results = await db
      .select()
      .from(reviews)
      .where(
        and(
          eq(reviews.experiment, experiment.toJSON().id),
          eq(reviews.author, reviewer.toJSON().id),
          isNull(reviews.grade)
        )
      );

    if (results.length === 0) return [];

    const publicationIds = results.map((r) => r.publication);
    const publicationsQuery = db
      .select()
      .from(publications)
      .where(
        and(
          eq(publications.experiment, experiment.toJSON().id),
          inArray(publications.id, publicationIds)
        )
      );

    const publicationsResults = await publicationsQuery;

    return await concurrentExecutor(
      publicationsResults,
      async (data) => {
        return await new PublicationResource(data, experiment).finalize();
      },
      { concurrency: 8 }
    );
  }

  static async listByAuthor(
    experiment: ExperimentResource,
    author: AgentResource
  ): Promise<PublicationResource[]> {
    const results = await db
      .select()
      .from(publications)
      .where(
        and(
          eq(publications.experiment, experiment.toJSON().id),
          eq(publications.author, author.toJSON().id)
        )
      );

    return await concurrentExecutor(
      results,
      async (data) => {
        return await new PublicationResource(data, experiment).finalize();
      },
      { concurrency: 8 }
    );
  }

  static async listByExperiment(
    experiment: ExperimentResource
  ): Promise<PublicationResource[]> {
    const results = await db
      .select()
      .from(publications)
      .where(eq(publications.experiment, experiment.toJSON().id))
      .orderBy(desc(publications.created));

    return await concurrentExecutor(
      results,
      async (data) => {
        return await new PublicationResource(data, experiment).finalize();
      },
      { concurrency: 8 }
    );
  }

  static async findByReference(
    experiment: ExperimentResource,
    reference: string
  ): Promise<PublicationResource | null> {
    const [r] = await PublicationResource.findByReferences(experiment, [
      reference,
    ]);

    return r ?? null;
  }

  static async findByReferences(
    experiment: ExperimentResource,
    references: string[]
  ): Promise<PublicationResource[]> {
    const results = await db
      .select()
      .from(publications)
      .where(
        and(
          eq(publications.experiment, experiment.toJSON().id),
          inArray(publications.reference, references)
        )
      );

    return await concurrentExecutor(
      results,
      async (data) => {
        return await new PublicationResource(data, experiment).finalize();
      },
      { concurrency: 8 }
    );
  }

  private static extractReferences(content: string) {
    const regex = /\[([a-z0-9]{4}(?:\s*,\s*[a-z0-9]{4})*)\]/g;
    const matches = [];

    let match;
    while ((match = regex.exec(content)) !== null) {
      // Split by comma and trim whitespace to get individual IDs
      const ids = match[1].split(",").map((id) => id.trim());
      matches.push(...ids);
    }

    return matches;
  }

  static async submit(
    experiment: ExperimentResource,
    author: AgentResource,
    data: {
      title: string;
      abstract: string;
      content: string;
    }
  ): Promise<Result<PublicationResource, SrchdError>> {
    const references = PublicationResource.extractReferences(data.content);
    const found = await PublicationResource.findByReferences(
      experiment,
      references
    );

    const foundFilter = new Set(found.map((c) => c.toJSON().reference));
    const notFound = references.filter((r) => !foundFilter.has(r));

    if (notFound.length > 0) {
      return new Err(
        new SrchdError(
          "reference_not_found_error",
          "Reference not found in publication submission content: " +
            notFound.join(",")
        )
      );
    }

    const [created] = await db
      .insert(publications)
      .values({
        experiment: experiment.toJSON().id,
        author: author.toJSON().id,
        ...data,
        reference: newID4(),
        status: "SUBMITTED",
      })
      .returning();

    // We don't create citations until the publication gets published.

    return new Ok(
      await new PublicationResource(created, experiment).finalize()
    );
  }

  async maybePublishOrReject(): Promise<
    "SUBMITTED" | "PUBLISHED" | "REJECTED"
  > {
    const grades = removeNulls(this.reviews.map((r) => r.grade ?? null));

    // If we are mising reviews return early
    if (grades.length < this.reviews.length) {
      return "SUBMITTED";
    }

    const score = grades.reduce((acc, g) => acc + REVIEW_SCORES[g], 0);

    if (score >= MIN_REVIEW_SCORE) {
      await this.publish();
    } else {
      await this.reject();
    }

    return this.data.status;
  }

  async publish() {
    const references = PublicationResource.extractReferences(this.data.content);
    const found = await PublicationResource.findByReferences(
      this.experiment,
      references
    );

    try {
      if (found.length > 0) {
        await db.insert(citations).values(
          found.map((c) => ({
            experiment: this.experiment.toJSON().id,
            from: this.data.id,
            to: c.toJSON().id,
          }))
        );
      }

      const [updated] = await db
        .update(publications)
        .set({
          status: "PUBLISHED",
          updated: new Date(),
        })
        .where(eq(publications.id, this.data.id))
        .returning();

      if (!updated) {
        return new Err(
          new SrchdError("not_found_error", "Publication not found", null)
        );
      }

      this.data = updated;
      return new Ok(this);
    } catch (error) {
      return new Err(
        new SrchdError(
          "resource_update_error",
          "Failed to publish publication",
          normalizeError(error)
        )
      );
    }
  }

  async reject() {
    try {
      const [updated] = await db
        .update(publications)
        .set({
          status: "REJECTED",
          updated: new Date(),
        })
        .where(eq(publications.id, this.data.id))
        .returning();

      if (!updated) {
        return new Err(
          new SrchdError("not_found_error", "Publication not found", null)
        );
      }

      this.data = updated;
      return new Ok(this);
    } catch (error) {
      return new Err(
        new SrchdError(
          "resource_update_error",
          "Failed to reject publication",
          normalizeError(error)
        )
      );
    }
  }

  async requestReviewers(
    reviewers: AgentResource[]
  ): Promise<Result<Review[], SrchdError>> {
    if (this.reviews.length > 0) {
      return new Err(
        new SrchdError(
          "resource_creation_error",
          "Reviews already exist for this publication"
        )
      );
    }

    const created = await db
      .insert(reviews)
      .values(
        reviewers.map((reviewer) => ({
          experiment: this.experiment.toJSON().id,
          publication: this.data.id,
          author: reviewer.toJSON().id,
        }))
      )
      .returning();

    this.reviews = created.map((r) => ({
      ...r,
      author: reviewers.find((rev) => rev.toJSON().id === r.author)!.toJSON(),
    }));

    return new Ok(this.reviews);
  }

  async submitReview(
    reviewer: AgentResource,
    data: Omit<
      InferInsertModel<typeof reviews>,
      "id" | "created" | "updated" | "experiment" | "publication" | "author"
    >
  ): Promise<Result<Review, SrchdError>> {
    const idx = this.reviews.findIndex(
      (r) => r.author?.id === reviewer.toJSON().id
    );
    if (idx === -1) {
      return new Err(
        new SrchdError(
          "resource_creation_error",
          "Review submitted does not match any review request."
        )
      );
    }

    const [updated] = await db
      .update(reviews)
      .set({
        grade: data.grade,
        content: data.content,
        updated: new Date(),
      })
      .where(
        and(
          eq(reviews.experiment, this.experiment.toJSON().id),
          eq(reviews.publication, this.data.id),
          eq(reviews.author, reviewer.toJSON().id)
        )
      )
      .returning();

    if (!updated) {
      return new Err(
        new SrchdError("not_found_error", "Review not found", null)
      );
    }

    this.reviews[idx] = { ...updated, author: reviewer.toJSON() };

    return new Ok(this.reviews[idx]);
  }

  toJSON() {
    return {
      ...this.data,
      citations: this.citations,
      reviews: this.reviews,
      author: this.author,
    };
  }
}
