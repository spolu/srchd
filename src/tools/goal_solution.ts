import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentResource } from "../resources/agent";
import { errorToCallToolResult } from "../lib/mcp";
import { PublicationResource } from "../resources/publication";
import { ExperimentResource } from "../resources/experiment";
import { SrchdError } from "../lib/error";
import { SolutionResource } from "../resources/solutions";

const SERVER_NAME = "goal_solution";
const SERVER_VERSION = "0.1.0";

export function createGoalSolutionServer(
  experiment: ExperimentResource,
  agent: AgentResource
): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    title: "Research goal solution reporting",
    description:
      "Tools to report that a publication is the current best solution to the reseach goal.",
    version: SERVER_VERSION,
  });

  server.tool(
    "report",
    "Report belief that a publication is the curent best/valid solution towards the research goal.",
    {
      publication: z
        .string()
        .nullable()
        .describe(
          "The reference of the publication. `null` if the previous solution was proven wrong and there is no current valid solution."
        ),
      reason: z
        .enum([
          "no_previous",
          "previous_wrong",
          "previous_improved",
          "new_approach",
        ])
        .describe("Reason for the reporting a new solution."),
      rationale: z.string().describe("Short rationale"),
    },
    async ({ publication: reference, reason, rationale }) => {
      const publication = reference
        ? await PublicationResource.findByReference(experiment, reference)
        : null;

      if (reference && !publication) {
        return errorToCallToolResult(
          new SrchdError("not_found_error", "Publication not found")
        );
      }

      await SolutionResource.create(experiment, agent, {
        reason,
        rationale,
        publication: publication ? publication.toJSON().id : null,
      });

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Successfully reported.`,
          },
        ],
      };
    }
  );

  return server;
}
