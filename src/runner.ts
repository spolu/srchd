import { JSONSchema7 } from "json-schema";
import {
  BaseModel,
  Message,
  TextContent,
  Thinking,
  Tool,
  ToolResult,
  ToolUse,
} from "./models";
import { AgentResource } from "./resources/agent";
import { TokensResource } from "./resources/tokens";
import { ExperimentResource } from "./resources/experiment";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { normalizeError, SrchdError } from "./lib/error";
import { Err, Ok, Result } from "./lib/result";
import { MessageResource } from "./resources/messages";
import assert from "assert";
import { PublicationResource } from "./resources/publication";
import {
  createPublicationsServer,
  renderListOfPublications,
} from "./tools/publications";
import { createClientServerPair, errorToCallToolResult } from "./lib/mcp";
import { concurrentExecutor } from "./lib/async";
import { createSystemPromptSelfEditServer } from "./tools/system_prompt_self_edit";
import { AnthropicModel, AnthropicModels } from "./models/anthropic";
import { assertNever } from "./lib/assert";
import { createGoalSolutionServer } from "./tools/goal_solution";
import { GeminiModel, GeminiModels } from "./models/gemini";
import { OpenAIModel, OpenAIModels } from "./models/openai";
import { createComputerServer } from "./tools/computer";
import { MistralModel, MistralModels } from "./models/mistral";

export class Runner {
  private experiment: ExperimentResource;
  private agent: AgentResource;
  private mcpClients: Client[];
  private model: BaseModel;
  private lastAgenticLoopStartPosition: number; // last "agentic loop start position" used
  private messages: MessageResource[]; // ordered by position asc

  private constructor(
    experiment: ExperimentResource,
    agent: AgentResource,
    mcpClients: Client[],
    model: BaseModel,
  ) {
    this.experiment = experiment;
    this.agent = agent;
    this.mcpClients = mcpClients;
    this.model = model;
    this.messages = [];
    this.lastAgenticLoopStartPosition = 0;
  }

  public static async builder(
    experimentName: string,
    agentName: string,
  ): Promise<
    Result<
      { experiment: ExperimentResource; agent: AgentResource; runner: Runner },
      SrchdError
    >
  > {
    const experiment = await ExperimentResource.findByName(experimentName);
    if (!experiment) {
      return new Err(
        new SrchdError(
          "not_found_error",
          `Experiment '${experimentName}' not found.`,
        ),
      );
    }

    const agent = await AgentResource.findByName(experiment, agentName);
    if (!agent) {
      return new Err(
        new SrchdError(
          "not_found_error",
          `Agent '${agentName}' not found in experiment '${experimentName}'.`,
        ),
      );
    }

    const [publicationClient] = await createClientServerPair(
      await createPublicationsServer(experiment, agent),
    );
    const [systemPromptSelfEditClient] = await createClientServerPair(
      await createSystemPromptSelfEditServer(agent),
    );
    const [goalSolutionClient] = await createClientServerPair(
      await createGoalSolutionServer(experiment, agent),
    );
    const [computerClient] = await createClientServerPair(
      await createComputerServer(experiment, agent),
    );

    const model = (() => {
      const provider = agent.toJSON().provider;
      switch (provider) {
        case "anthropic":
          return new AnthropicModel(
            {
              thinking: agent.toJSON().thinking,
            },
            agent.toJSON().model as AnthropicModels,
          );
        case "gemini":
          return new GeminiModel(
            {
              thinking: agent.toJSON().thinking,
            },
            agent.toJSON().model as GeminiModels,
          );
        case "openai":
          return new OpenAIModel(
            {
              thinking: agent.toJSON().thinking,
            },
            agent.toJSON().model as OpenAIModels,
          );
        case "mistral":
          return new MistralModel(
            {
              thinking: agent.toJSON().thinking,
            },
            agent.toJSON().model as MistralModels,
          );
        default:
          assertNever(provider);
      }
    })();

    const runner = await Runner.initialize(
      experiment,
      agent,
      [
        publicationClient,
        systemPromptSelfEditClient,
        goalSolutionClient,
        computerClient,
      ],
      model,
    );
    if (runner.isErr()) {
      return runner;
    }

    return new Ok({
      experiment,
      agent,
      runner: runner.value,
    });
  }

  public static async initialize(
    experiment: ExperimentResource,
    agent: AgentResource,
    mcpClients: Client[],
    model: BaseModel,
  ): Promise<Result<Runner, SrchdError>> {
    const runner = new Runner(experiment, agent, mcpClients, model);
    const messages = await MessageResource.listMessagesByAgent(
      runner.experiment,
      runner.agent,
    );

    runner.messages = messages;

    return new Ok(runner);
  }

  async tools(): Promise<Result<Tool[], SrchdError>> {
    const tools: Tool[] = [];

    for (const client of this.mcpClients) {
      try {
        const ct = await client.listTools();
        for (const tool of ct.tools) {
          tools.push({
            name: `${client.getServerVersion()?.name}-${tool.name}`,
            description: tool.description,
            inputSchema: tool.inputSchema as JSONSchema7,
          });
        }
      } catch (error) {
        return new Err(
          new SrchdError(
            "tool_error",
            `Error listing tools from client ${
              client.getServerVersion()?.name
            }`,
            normalizeError(error),
          ),
        );
      }
    }

    // console.log("--------------------------------");
    // console.log("Available Tools:");
    // tools.forEach((tool) => {
    //   console.log(`- ${tool.name}: ${tool.description}`);
    // });

    return new Ok(tools);
  }

  async executeTool(t: ToolUse): Promise<ToolResult> {
    for (const client of this.mcpClients) {
      try {
        const ct = await client.listTools();
        for (const tool of ct.tools) {
          if (`${client.getServerVersion()?.name}-${tool.name}` === t.name) {
            const result = await client.callTool({
              name: tool.name,
              arguments: t.input,
            });

            // console.log(result);
            // console.log(JSON.stringify(result, null, 2));

            return {
              type: "tool_result",
              toolUseId: t.id,
              toolUseName: t.name,
              // @ts-ignore TODO(spolu): investigate mismatch
              content: result.content,
              // @ts-ignore TODO(spolu): investigate mismatch
              isError: result.isError ?? false,
            };
          }
        }
      } catch (error) {
        return {
          type: "tool_result",
          toolUseId: t.id,
          toolUseName: t.name,
          content: errorToCallToolResult(
            new SrchdError(
              "tool_execution_error",
              `Error executing tool ${t.name}`,
              normalizeError(error),
            ),
          ).content,
          isError: true,
        };
      }
    }

    return {
      type: "tool_result",
      toolUseId: t.id,
      toolUseName: t.name,
      content: errorToCallToolResult(
        new SrchdError(
          "tool_execution_error",
          `No MCP client found to execute tool ${t.name}`,
          null,
        ),
      ).content,
      isError: true,
    };
  }

  isNewUserMessageNeeded(): boolean {
    if (this.messages.length === 0) {
      return true;
    }

    // If the role is agent it means we had no tool use in the last tick and we need a user message.
    const last = this.messages[this.messages.length - 1];
    if (last.toJSON().role === "agent") {
      return true;
    }

    return false;
  }

  async newUserMessage(): Promise<Result<MessageResource, SrchdError>> {
    const position =
      this.messages.length > 0
        ? this.messages[this.messages.length - 1].position() + 1
        : 0;

    const reviews =
      await PublicationResource.listByExperimentAndReviewRequested(
        this.experiment,
        this.agent,
      );

    const publications = await PublicationResource.listByAuthor(
      this.experiment,
      this.agent,
    );

    const m: Message = {
      role: "user",
      content: [
        {
          type: "text",
          text: `\
CURRENT_TIME: ${new Date().toISOString()}

SUBMITTED_PUBLICATIONS:
${renderListOfPublications(publications, { withAbstract: false })}

PENDING_REVIEWS (to prioritize):
${renderListOfPublications(reviews, { withAbstract: false })}

<system>
This is an automated system message. There is no user available to respond. Proceed autonomously. Make sure to use tools, only tools have visible side effects. Never stay idle, always pro-actively work on further research questions even if your publications are under review.
<system>
`,
          provider: null,
        },
      ],
    };

    const message = await MessageResource.create(
      this.experiment,
      this.agent,
      m,
      position,
    );

    return new Ok(message);
  }

  shiftLastAgenticLoopStartPosition(): Result<void, SrchdError> {
    assert(
      this.lastAgenticLoopStartPosition < this.messages.length,
      "lastAgenticLoopStartPosition is out of bounds.",
    );

    // console.log(
    //   "this.lastAgenticLoopStartPosition: " + this.lastAgenticLoopStartPosition
    // );

    let idx = this.lastAgenticLoopStartPosition + 1;
    for (; idx < this.messages.length; idx++) {
      const m = this.messages[idx].toJSON();
      if (m.role === "user" && m.content.every((c) => c.type === "text")) {
        // Found the next user message, which marks the start of the next agentic loop.
        break;
      }
    }

    // console.log("shiftLastAgenticLoopStartPosition.idx: " + idx);

    if (idx >= this.messages.length) {
      return new Err(
        new SrchdError(
          "agent_loop_overflow_error",
          "No agentic loop start position found after last.",
        ),
      );
    }

    this.lastAgenticLoopStartPosition = idx;
    return new Ok(undefined);
  }

  /**
   * Render past agent messages to the model handling truncation to fit the model context window as
   * needed.
   *
   * @param systemPrompt System prompt to use for the model call.
   * @param tools Tools to provide to the model.
   */
  async renderForModel(
    systemPrompt: string,
    tools: Tool[],
  ): Promise<Result<Message[], SrchdError>> {
    let tokenCount = 0;
    do {
      // Take messages from this.lastAgenticLoopStartPosition to the end.
      const messages = [...this.messages]
        .slice(this.lastAgenticLoopStartPosition)
        .map((m) => m.toJSON());

      tokenCount = await TokensResource.getAgentTokenCount(this.agent);
      // console.log("TOKEN COUNT: " + tokenCount);

      if (this.messages.length === 0) {
        return new Ok(messages);
      }

      const lastMessage = messages[messages.length - 1];
      const res = await this.model.tokens(lastMessage);
      if (res.isErr()) {
        return res;
      }
      tokenCount += res.value;

      if (tokenCount > this.model.maxTokens()) {
        const res = this.shiftLastAgenticLoopStartPosition();
        if (res.isErr()) {
          return res;
        }
      } else {
        return new Ok(messages);
      }
    } while (tokenCount > this.model.maxTokens());

    return new Err(new SrchdError("agent_loop_overflow_error", "Unreachable"));
  }

  /**
   * Logs message content during runner execution to display progress.
   */
  logContent(
    c: TextContent | ToolUse | ToolResult | Thinking,
    messageId?: number,
  ) {
    let out = `\x1b[1m\x1b[37m${this.agent.toJSON().name}\x1b[0m`; // name: bold white
    if (messageId) {
      out += ` \x1b[1m\x1b[33m#${messageId}\x1b[0m`; // message id: bold yellow if available
    }
    switch (c.type) {
      case "thinking": {
        out += ` \x1b[90m>\x1b[0m `; // separator: grey
        out += `\x1b[1m\x1b[95mThinking:\x1b[0m `; // label: bold magenta/purple
        out += `\x1b[90m${c.thinking.replace(/\n/g, " ")}\x1b[0m`; // text: grey
        break;
      }
      case "text": {
        out += ` \x1b[90m>\x1b[0m `; // separator: grey
        out += `\x1b[1m\x1b[38;5;208mText:\x1b[0m `; // label: bold orange (256-color)
        out += `\x1b[90m${c.text.replace(/\n/g, " ")}\x1b[0m`; // content: grey
        break;
      }
      case "tool_use": {
        out += ` \x1b[90m>\x1b[0m `; // separator: grey
        out += `\x1b[1m\x1b[32mToolUse:\x1b[0m `; // label: bold green
        out += `${c.name}`;
        break;
      }
      case "tool_result": {
        out += ` \x1b[90m<\x1b[0m `; // separator: grey
        out += `\x1b[1m\x1b[34mToolResult:\x1b[0m `; // label: bold blue
        out +=
          `${c.toolUseName} ` +
          `${
            c.isError
              ? "\x1b[1m\x1b[31m[error]\x1b[0m"
              : "\x1b[1m\x1b[32m[success]\x1b[0m"
          }`;
        break;
      }
      default:
        assertNever(c);
    }
    console.log(out);
  }

  /**
   * Advance runer by one tick (one agent call + associated tools executions).
   */
  async tick(): Promise<Result<void, SrchdError>> {
    const tools = await this.tools();
    if (tools.isErr()) {
      return tools;
    }

    if (this.isNewUserMessageNeeded()) {
      const newMessage = await this.newUserMessage();
      if (newMessage.isErr()) {
        return newMessage;
      }
      this.messages.push(newMessage.value);
    }

    const systemPrompt = `\
<goal>
${this.experiment.toJSON().problem}
</goal>

${this.agent.toJSON().system}`;

    const messagesForModel = await this.renderForModel(
      systemPrompt,
      tools.value,
    );
    if (messagesForModel.isErr()) {
      return messagesForModel;
    }

    const res = await this.model.run(
      messagesForModel.value,
      systemPrompt,
      "auto",
      tools.value,
    );
    if (res.isErr()) {
      return res;
    }
    const { message, tokenCount } = res.value;

    if (message.content.length === 0) {
      console.log(
        `WARNING: Skipping empty agent response content for agent ${
          this.agent.toJSON().name
        }`,
      );
      return new Ok(undefined);
    }

    const toolResults = await concurrentExecutor(
      message.content.filter((content) => content.type === "tool_use"),
      async (t: ToolUse) => {
        return await this.executeTool(t);
      },
      { concurrency: 8 },
    );

    let last = this.messages[this.messages.length - 1];

    const agentMessage = await MessageResource.create(
      this.experiment,
      this.agent,
      message,
      last.position() + 1,
    );
    this.messages.push(agentMessage);

    if (tokenCount) {
      console.log(
        `INFO: Token count for agent ${this.agent.toJSON().name}: ${tokenCount}`,
      );
      await TokensResource.create(this.agent, agentMessage, tokenCount);
    } else {
      console.log(
        `WARNING: Skipping token count for agent ${this.agent.toJSON().name}`,
      );
    }

    message.content.forEach((c) => {
      this.logContent(c, agentMessage.toJSON().id);
    });

    if (toolResults.length > 0) {
      const toolResultsMessage = await MessageResource.create(
        this.experiment,
        this.agent,
        {
          role: "user",
          content: toolResults,
        },
        last.position() + 2,
      );
      this.messages.push(toolResultsMessage);

      toolResults.forEach((tr) => {
        this.logContent(tr, toolResultsMessage.toJSON().id);
        if (tr.isError) {
          console.error(tr.content);
        }
      });
    }

    return new Ok(undefined);
  }

  /**
   * Replay a specific agent message tool uses
   *
   * @param messageId ID of the agent message to replay.
   */
  async replayAgentMessage(
    messageId: number,
  ): Promise<Result<void, SrchdError>> {
    const agentMessage = await MessageResource.findById(
      this.experiment,
      this.agent,
      messageId,
    );

    if (!agentMessage || agentMessage.toJSON().role !== "agent") {
      return new Err(
        new SrchdError(
          "not_found_error",
          `Agent message not found for id ${messageId}`,
        ),
      );
    }

    const content = agentMessage.toJSON().content;

    content.forEach((c) => {
      this.logContent(c, agentMessage.toJSON().id);
    });

    const toolResults = await concurrentExecutor(
      content.filter((content) => content.type === "tool_use"),
      async (t: ToolUse) => {
        const res = await this.executeTool(t);
        this.logContent(res);
        if (res.isError) {
          console.error(res.content);
        }
        return res;
      },
      { concurrency: 8 },
    );

    console.log(JSON.stringify(toolResults, null, 2));

    return new Ok(undefined);
  }
}
