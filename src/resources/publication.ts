import { db } from "../db";
import { citations, publications, reviews } from "../db/schema";
import {
  eq,
  InferSelectModel,
  InferInsertModel,
  and,
  inArray,
} from "drizzle-orm";
import { ExperimentResource } from "./experiment";
import { AgentResource } from "./agent";
import { Err, Ok, Result } from "../lib/result";
import { normalizeError, SrchdError } from "../lib/error";
import { newID4 } from "../lib/utils";

type Publication = InferSelectModel<typeof publications>;
type Review = InferInsertModel<typeof reviews>;

export class PublicationResource {
  private data: Publication;
  experiment: ExperimentResource;

  private constructor(data: Publication, experiment: ExperimentResource) {
    this.data = data;
    this.experiment = experiment;
  }

  static async findByReference(
    experiment: ExperimentResource,
    reference: string
  ): Promise<PublicationResource | null> {
    const [result] = await db
      .select()
      .from(publications)
      .where(
        and(
          eq(publications.reference, reference),
          eq(publications.experiment, experiment.toJSON().id)
        )
      )
      .limit(1);

    if (!result) return null;

    return new PublicationResource(result, experiment);
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

    return results.map((result) => new PublicationResource(result, experiment));
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
          "not_found_error",
          "Reference not found in publication submission content: " +
            notFound.join(",")
        )
      );
    }

    try {
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

      return new Ok(new PublicationResource(created, experiment));
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
    try {
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

      return new Ok(created);
    } catch (error) {
      return new Err(
        new SrchdError(
          "resource_creation_error",
          "Failed to request reviews",
          normalizeError(error)
        )
      );
    }
  }

  async listReviews(): Promise<Review[]> {
    const results = await db
      .select()
      .from(reviews)
      .where(
        and(
          eq(reviews.experiment, this.experiment.toJSON().id),
          eq(reviews.publication, this.data.id)
        )
      );
    return results;
  }

  async submitReview(
    reviewer: AgentResource,
    data: Omit<
      InferInsertModel<typeof reviews>,
      "id" | "created" | "updated" | "experiment" | "publication" | "author"
    >
  ): Promise<Result<Review, SrchdError>> {
    try {
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

      return new Ok(updated);
    } catch (error) {
      return new Err(
        new SrchdError(
          "resource_creation_error",
          "Failed to perform review",
          normalizeError(error)
        )
      );
    }
  }

  toJSON() {
    return { ...this.data };
  }
}
