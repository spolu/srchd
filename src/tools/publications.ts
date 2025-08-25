import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentResource } from "../resources/agent";
import { errorToCallToolResult } from "../lib/mcp";
import { PublicationResource } from "../resources/publication";
import { ExperimentResource } from "../resources/experiment";
import { SrchdError } from "../lib/error";

export const REVIEWER_COUNT = 3;

const SERVER_NAME = "publications";
const SERVER_VERSION = "0.1.0";

export const renderListOfPublications = (
  publications: PublicationResource[]
) => {
  if (publications.length === 0) {
    return "(0 found)";
  }
  return publications
    .map((p) => p.toJSON())
    .map((p) => {
      return `[${p.reference}] ${p.title} {author=${p.author.name} citations=${p.citations.to.length}}`;
    })
    .join("\n");
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
      order: z
        .enum(["latest", "citations"])
        .describe(
          "Ordering to use. `latest` lists the most recent publications, while `citations` lists the most cited publications."
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
    async ({ order, limit = 10, offset = 0 }) => {
      const publications = await PublicationResource.listPublishedByExperiment(
        experiment,
        {
          order,
          limit,
          offset,
        }
      );

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: renderListOfPublications(publications),
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
[${publication.toJSON().reference}] ${publication.toJSON().title}
author: ${publication.toJSON().author.name}
citations=${publication.toJSON().citations.to.length}

ABSTRACT

${publication.toJSON().abstract}

CONTENT

${publication.toJSON().content}`,
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
      abstract: z.string().describe("Abstract or summary of the publication."),
      content: z.string().describe("Full content of the publication."),
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
    "get_review_requests",
    "Get pending review requests received.",
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
            text: renderListOfPublications(publications),
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
            text: `Review submitted for publication [${publication}].`,
          },
        ],
      };
    }
  );

  return server;
}
