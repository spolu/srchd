import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentResource } from "../resources/agent";
import { errorToCallToolResult } from "../lib/mcp";
import { PublicationResource, Review } from "../resources/publication";
import { ExperimentResource } from "../resources/experiment";
import { SrchdError } from "../lib/error";

export const REVIEWER_COUNT = 3;

const SERVER_NAME = "publications";
const SERVER_VERSION = "0.1.0";

export const reviewHeader = (review: Review) => {
  return `\
grade=${review.grade || "pending"}
submitted=${review.created?.toISOString()}`;
};

export const publicationHeader = (
  publication: PublicationResource,
  { withAbstract }: { withAbstract: boolean }
) => {
  return (
    `\
reference=[${publication.toJSON().reference}]
submitted=${publication.toJSON().created.toISOString()}
title=${publication.toJSON().title}
author=${publication.toJSON().author.name}
reviews:${publication
      .toJSON()
      .reviews.map((r) => r.grade)
      .join(", ")}
status=${publication.toJSON().status}
citations_count=${publication.toJSON().citations.to.length}` +
    (withAbstract
      ? `\nabstract=${publication.toJSON().abstract.replace("\n", " ")}`
      : "")
  );
};

export const renderListOfPublications = (
  publications: PublicationResource[],
  {
    withAbstract,
  }: {
    withAbstract: boolean;
  }
) => {
  if (publications.length === 0) {
    return "(0 found)";
  }
  return publications
    .map((p) => {
      return publicationHeader(p, { withAbstract });
    })
    .join("\n\n");
};

export function createPublicationsServer(
  experiment: ExperimentResource,
  agent: AgentResource
): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    title: "Publications",
    description: "Tools to submit, review and access publications.",
    version: SERVER_VERSION,
  });

  server.tool(
    "list_publications",
    "List publications available in the system.",
    {
      order: z.enum(["latest", "citations"]).describe(
        `\
Ordering to use:
\`latest\` lists the most recent publications.
\`citations\` lists the most cited publications.`
      ),
      status: z
        .enum(["PUBLISHED", "SUBMITTED", "REJECTED"])
        .optional()
        .describe(
          `The status of the publications to list. Defaults to \`PUBLISHED\``
        ),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of publications to return. Defaults to 10."),
      offset: z
        .number()
        .optional()
        .describe("Offset for pagination. Defaults to 0."),
    },
    async ({ order, status = "PUBLISHED", limit = 10, offset = 0 }) => {
      const publications = await PublicationResource.listPublishedByExperiment(
        experiment,
        {
          order,
          status,
          limit,
          offset,
        }
      );

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: renderListOfPublications(publications, {
              withAbstract: false,
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "get_publication_abstract",
    "Retrieve the abstracts for a list of publications",
    {
      references: z
        .array(z.string())
        .describe("List of publication references"),
    },
    async ({ references }) => {
      const publications = await PublicationResource.findByReferences(
        experiment,
        references
      );

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: renderListOfPublications(publications, {
              withAbstract: true,
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "get_publication",
    "Retrieve a specific publication.",
    {
      reference: z.string().describe("Reference of the publication."),
    },
    async ({ reference }) => {
      const publication = await PublicationResource.findByReference(
        experiment,
        reference
      );
      if (!publication) {
        return errorToCallToolResult(
          new SrchdError("not_found_error", "Publication not found")
        );
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `\
${publicationHeader(publication, { withAbstract: true })}

${publication.toJSON().content}`,
          },
        ],
      };
    }
  );

  server.tool(
    "get_publication_reviews",
    "Retrieve a specific publication reviews.",
    {
      reference: z.string().describe("Reference of the publication."),
    },
    async ({ reference }) => {
      const publication = await PublicationResource.findByReference(
        experiment,
        reference
      );
      if (!publication) {
        return errorToCallToolResult(
          new SrchdError("not_found_error", "Publication not found")
        );
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `\
${publication
  .toJSON()
  .reviews.map((r) => {
    return `\
REVIEW:
${reviewHeader(r)}
${r.content}`;
  })
  .join("\n\n")}`,
          },
        ],
      };
    }
  );

  server.tool(
    "submit_publication",
    "Submit a new publication for review and publication.",
    {
      title: z.string().describe("Title of the publication."),
      abstract: z
        .string()
        .describe("Abstract of the publication (avoid newlines)."),
      content: z
        .string()
        .describe(
          "Full content of the publication. Use [{ref}] or [{ref},{ref}] inlined in content for citations."
        ),
    },
    async ({ title, abstract, content }) => {
      const pendingReviews =
        await PublicationResource.listByExperimentAndReviewRequested(
          experiment,
          agent
        );
      if (pendingReviews.length > 0) {
        return errorToCallToolResult(
          new SrchdError(
            "publication_error",
            "You have pending reviews. Please complete them before submitting a new publication."
          )
        );
      }

      const agents = await AgentResource.listByExperiment(experiment);
      const pool = agents.filter((a) => a.toJSON().id !== agent.toJSON().id);
      if (pool.length < REVIEWER_COUNT) {
        return errorToCallToolResult(
          new SrchdError("publication_error", "Not enough reviewers available")
        );
      }
      const reviewers = pool
        .sort(() => 0.5 - Math.random())
        .slice(0, REVIEWER_COUNT);

      const publication = await PublicationResource.submit(experiment, agent, {
        title,
        abstract,
        content,
      });
      if (publication.isErr()) {
        return errorToCallToolResult(publication.error);
      }

      const reviews = await publication.value.requestReviewers(reviewers);
      if (reviews.isErr()) {
        return errorToCallToolResult(reviews.error);
      }

      const res = publication.value.toJSON();
      delete (res as any).reviews;

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Publication submitted. Reference: [${
              publication.value.toJSON().reference
            }].`,
          },
        ],
      };
    }
  );

  server.tool(
    "list_received_review_requests",
    "List pending review requests received by the caller.",
    {},
    async () => {
      const publications =
        await PublicationResource.listByExperimentAndReviewRequested(
          experiment,
          agent
        );

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: renderListOfPublications(publications, {
              withAbstract: false,
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "list_submitted_publications",
    "List publications submitted by the caller.",
    {},
    async () => {
      const publications = await PublicationResource.listByAuthor(
        experiment,
        agent
      );

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: renderListOfPublications(publications, {
              withAbstract: false,
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "submit_review",
    "Submit a review for a publication.",
    {
      publication: z
        .string()
        .describe("The reference of the publication to review."),
      grade: z
        .enum(["STRONG_ACCEPT", "ACCEPT", "REJECT", "STRONG_REJECT"])
        .describe("Grade for the publication."),
      content: z.string().describe("Content of the review."),
    },
    async ({ publication: reference, grade, content }) => {
      const publication = await PublicationResource.findByReference(
        experiment,
        reference
      );
      if (!publication) {
        return errorToCallToolResult(
          new SrchdError("not_found_error", "Publication not found")
        );
      }

      const review = await publication.submitReview(agent, {
        grade,
        content,
      });

      if (review.isErr()) {
        return errorToCallToolResult(review.error);
      }

      await publication.maybePublishOrReject();

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Review submitted for publication [${reference}].`,
          },
        ],
      };
    }
  );

  return server;
}
