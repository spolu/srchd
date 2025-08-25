import { JSONSchema7 } from "json-schema";
import { BaseModel, Message, Tool, ToolResult, ToolUse } from "./models";
import { AgentResource } from "./resources/agent";
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
import { createSystemPromptSelfEditServer } from "./tools/system_prompt_edit";
import { AnthropicModel } from "./models/anthropic";

const MAX_TOKENS_COUNT = 128000;

export class Runner {
  private experiment: ExperimentResource;
  private agent: AgentResource;
  private mcpClients: Client[];
  private model: BaseModel;
  private lastAgenticLoopStartPosition: number; // last "agentic loop start position" used
  private messages: MessageResource[] | null; // ordered by position asc

  private constructor(
    experiment: ExperimentResource,
    agent: AgentResource,
    mcpClients: Client[],
    model: BaseModel
  ) {
    this.experiment = experiment;
    this.agent = agent;
    this.mcpClients = mcpClients;
    this.model = model;
    this.messages = null;
    this.lastAgenticLoopStartPosition = 0;
  }

  public static async builder(
    experimentName: string,
    agentName: string
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
          `Experiment '${experimentName}' not found.`
        )
      );
    }

    const agent = await AgentResource.findByName(experiment, agentName);
    if (!agent) {
      return new Err(
        new SrchdError(
          "not_found_error",
          `Agent '${agentName}' not found in experiment '${experimentName}'.`
        )
      );
    }

    const [publicationClient] = await createClientServerPair(
      createPublicationsServer(experiment, agent)
    );
    const [systemPromptSelfEditClient] = await createClientServerPair(
      createSystemPromptSelfEditServer(agent)
    );

    const model = new AnthropicModel(
      {
        thinking: "low",
      },
      "claude-sonnet-4-20250514"
    );
    const runner = await Runner.initialize(
      experiment,
      agent,
      [publicationClient, systemPromptSelfEditClient],
      model
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
    model: BaseModel
  ): Promise<Result<Runner, SrchdError>> {
    const runner = new Runner(experiment, agent, mcpClients, model);

    const messages = await MessageResource.listMessagesByAgent(
      runner.experiment,
      runner.agent
    );
    if (messages.isErr()) {
      return messages;
    }

    runner.messages = messages.value;

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
            normalizeError(error)
          )
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
              normalizeError(error)
            )
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
          null
        )
      ).content,
      isError: true,
    };
  }

  isNewUserMessageNeeded(): boolean {
    assert(this.messages !== null, "Runner not initialized with messages.");

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
    assert(this.messages !== null, "Runner not initialized with messages.");

    const position =
      this.messages.length > 0
        ? this.messages[this.messages.length - 1].position() + 1
        : 0;

    const reviews =
      await PublicationResource.listByExperimentAndReviewRequested(
        this.experiment,
        this.agent
      );

    const publications = await PublicationResource.listByAuthor(
      this.experiment,
      this.agent
    );

    const m: Message = {
      role: "user",
      content: [
        {
          type: "text",
          text: `\
CURRENT_TIME: ${new Date().toISOString()}

PENDING_REVIEWS:
${renderListOfPublications(reviews, { withAbstract: false })}

SUBMITTED_PUBLICATIONS:
${renderListOfPublications(publications, { withAbstract: false })}
`,
          provider: null,
        },
      ],
    };

    const message = await MessageResource.create(
      this.experiment,
      this.agent,
      m,
      position
    );

    if (message.isErr()) {
      return message;
    }

    return new Ok(message.value);
  }

  shiftLastAgenticLoopStartPosition(): Result<void, SrchdError> {
    assert(this.messages !== null, "Runner not initialized with messages.");
    assert(
      this.lastAgenticLoopStartPosition < this.messages.length,
      "lastAgenticLoopStartPosition is out of bounds."
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
          "No agentic loop start position found after last."
        )
      );
    }

    this.lastAgenticLoopStartPosition = idx;
    return new Ok(undefined);
  }

  async renderForModel(
    systemPrompt: string,
    tools: Tool[]
  ): Promise<Result<Message[], SrchdError>> {
    assert(this.messages !== null, "Runner not initialized with messages.");

    let tokenCount = 0;
    do {
      // Take messages from this.lastAgenticLoopStartPosition to the end.
      const messages = [...this.messages]
        .slice(this.lastAgenticLoopStartPosition)
        .map((m) => m.toJSON());

      const res = await this.model.tokens(
        messages,
        systemPrompt,
        "auto",
        tools
      );
      if (res.isErr()) {
        return res;
      }
      tokenCount = res.value;
      console.log("TOKEN COUNT: " + tokenCount);

      if (tokenCount > MAX_TOKENS_COUNT) {
        const res = this.shiftLastAgenticLoopStartPosition();
        if (res.isErr()) {
          return res;
        }
      } else {
        return new Ok(messages);
      }
    } while (tokenCount > MAX_TOKENS_COUNT);

    return new Err(new SrchdError("agent_loop_overflow_error", "Unreachable"));
  }

  async tick(): Promise<Result<void, SrchdError>> {
    assert(this.messages !== null, "Runner not initialized with messages.");

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
      tools.value
    );
    if (messagesForModel.isErr()) {
      return messagesForModel;
    }

    const m = await this.model.run(
      messagesForModel.value,
      systemPrompt,
      "auto",
      tools.value
    );
    if (m.isErr()) {
      return m;
    }

    m.value.content.forEach((c) => {
      if (c.type === "thinking") {
        console.log(
          `\x1b[1m\x1b[37m${this.agent.toJSON().name}\x1b[0m` + // name: bold white
            ` \x1b[90m>\x1b[0m ` + // separator: grey
            `\x1b[1m\x1b[95mThinking:\x1b[0m ` + // label: bold magenta/purple
            `\x1b[90m${c.thinking.replace(/\n/g, " ")}\x1b[0m` // text: grey
        );
      }
      if (c.type === "text") {
        console.log(
          `\x1b[1m\x1b[37m${this.agent.toJSON().name}\x1b[0m` + // name: bold white
            ` \x1b[90m>\x1b[0m ` + // separator: grey
            `\x1b[1m\x1b[38;5;208mText:\x1b[0m ` + // label: bold orange (256-color)
            `\x1b[90m${c.text.replace(/\n/g, " ")}\x1b[0m` // content: grey
        );
      }
      if (c.type === "tool_use") {
        console.log(
          `\x1b[1m\x1b[37m${this.agent.toJSON().name}\x1b[0m` + // name: bold white
            ` \x1b[90m>\x1b[0m ` + // separator: grey
            `\x1b[1m\x1b[32mToolUse::\x1b[0m ` + // label: bold green
            `${c.name}`
        );
      }
    });

    const toolResults = await concurrentExecutor(
      m.value.content.filter((content) => content.type === "tool_use"),
      async (t: ToolUse) => {
        const res = await this.executeTool(t);
        console.log(
          `${this.agent.toJSON().name} < ToolResult: ${res.toolUseName} ${
            res.isError ? "[error]" : "[success]"
          }`
        );
        if (res.isError) {
          console.error(res.content);
        }
        return res;
      },
      { concurrency: 8 }
    );

    let last = this.messages[this.messages.length - 1];

    const agentMessage = await MessageResource.create(
      this.experiment,
      this.agent,
      m.value,
      last.position() + 1
    );
    if (agentMessage.isErr()) {
      return agentMessage;
    }
    this.messages.push(agentMessage.value);

    if (toolResults.length > 0) {
      const toolResultsMessage = await MessageResource.create(
        this.experiment,
        this.agent,
        {
          role: "user",
          content: toolResults,
        },
        last.position() + 2
      );
      if (toolResultsMessage.isErr()) {
        return toolResultsMessage;
      }
      this.messages.push(toolResultsMessage.value);
    }

    return new Ok(undefined);
  }

  async replayAgentMessage(
    messageId: number
  ): Promise<Result<void, SrchdError>> {
    const agentMessage = await MessageResource.findById(
      this.experiment,
      this.agent,
      messageId
    );

    if (!agentMessage || agentMessage.toJSON().role !== "agent") {
      return new Err(
        new SrchdError(
          "not_found_error",
          `Agent message not found for id ${messageId}`
        )
      );
    }

    const content = agentMessage.toJSON().content;

    content.forEach((c) => {
      if (c.type === "thinking") {
        console.log(
          `\x1b[1m\x1b[37m${this.agent.toJSON().name}\x1b[0m` + // name: bold white
            ` \x1b[90m>\x1b[0m ` + // separator: grey
            `\x1b[1m\x1b[95mThinking:\x1b[0m ` + // label: bold magenta/purple
            `\x1b[90m${c.thinking.replace(/\n/g, " ")}\x1b[0m` // text: grey
        );
      }
      if (c.type === "text") {
        console.log(
          `\x1b[1m\x1b[37m${this.agent.toJSON().name}\x1b[0m` + // name: bold white
            ` \x1b[90m>\x1b[0m ` + // separator: grey
            `\x1b[1m\x1b[38;5;208mText:\x1b[0m ` + // label: bold orange (256-color)
            `\x1b[90m${c.text.replace(/\n/g, " ")}\x1b[0m` // content: grey
        );
      }
      if (c.type === "tool_use") {
        console.log(
          `\x1b[1m\x1b[37m${this.agent.toJSON().name}\x1b[0m` + // name: bold white
            ` \x1b[90m>\x1b[0m ` + // separator: grey
            `\x1b[1m\x1b[32mToolUse:\x1b[0m ` + // label: bold green
            `${c.name}`
        );
      }
    });

    const toolResults = await concurrentExecutor(
      content.filter((content) => content.type === "tool_use"),
      async (t: ToolUse) => {
        const res = await this.executeTool(t);
        console.log(
          `\x1b[1m\x1b[37m${this.agent.toJSON().name}\x1b[0m` + // name: bold white
            ` \x1b[90m<\x1b[0m ` + // separator: grey
            `\x1b[1m\x1b[34mToolResult:\x1b[0m ` +
            `${res.toolUseName} ` +
            `${
              res.isError
                ? "\x1b[1m\x1b[31m[error]\x1b[0m"
                : "\x1b[1m\x1b[32m[success]\x1b[0m"
            }`
        );
        if (res.isError) {
          console.error(res.content);
        }
        return res;
      },
      { concurrency: 8 }
    );

    console.log(JSON.stringify(toolResults, null, 2));

    return new Ok(undefined);
  }
}
