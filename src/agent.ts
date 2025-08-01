import { ExperimentResource } from "./resources/experiment";
import { AgentResource } from "./resources/agent";
import { DummyMCPServer } from "./tools/index";
import { BaseModel, Message, ModelResponse, Tool, ToolCall, ToolResult } from "./models/interface";

export interface AgentRunnerConfig {
  maxIterations?: number;
  verbose?: boolean;
}

/**
 * AgentRunner handles the execution environment for agents
 * It manages the agentic loop with tool execution through MCP protocol
 */
export class AgentRunner {
  private experiment: ExperimentResource;
  private agent: AgentResource;
  private mcpServer: DummyMCPServer;
  private model: BaseModel | null = null;
  private config: AgentRunnerConfig;
  private conversationHistory: Message[] = [];

  constructor(
    experiment: ExperimentResource,
    agent: AgentResource,
    config: AgentRunnerConfig = {}
  ) {
    this.experiment = experiment;
    this.agent = agent;
    this.config = {
      maxIterations: 10,
      verbose: false,
      ...config,
    };

    // Initialize MCP server
    this.mcpServer = new DummyMCPServer();
    this.initializeConversation();
  }

  /**
   * Set the model to use for generation
   */
  setModel(model: BaseModel) {
    this.model = model;
  }

  /**
   * Initialize conversation with system prompt
   */
  private initializeConversation() {
    const agentData = this.agent.toJSON();
    
    this.conversationHistory = [
      {
        role: "system",
        content: agentData.systemPrompt,
      },
    ];
  }

  /**
   * Get available tools from the MCP server
   */
  private async getAvailableTools(): Promise<Tool[]> {
    const tools = await this.mcpServer.listTools();
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Execute tool calls through the MCP server
   */
  private async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      try {
        if (this.config.verbose) {
          console.log(`Executing tool: ${toolCall.name} with args:`, toolCall.arguments);
        }

        const result = await this.mcpServer.callTool(toolCall.name, toolCall.arguments);
        
        results.push({
          toolCallId: toolCall.id,
          content: JSON.stringify(result, null, 2),
          isError: false,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (this.config.verbose) {
          console.error(`Tool execution error for ${toolCall.name}:`, errorMessage);
        }

        results.push({
          toolCallId: toolCall.id,
          content: `Error: ${errorMessage}`,
          isError: true,
        });
      }
    }

    return results;
  }

  /**
   * Run the agentic loop with a message
   */
  async run(message: string): Promise<string> {
    if (!this.model) {
      throw new Error("No model set. Call setModel() before running.");
    }

    // Add user message to conversation
    this.conversationHistory.push({
      role: "user",
      content: message,
    });

    let iterations = 0;
    const maxIterations = this.config.maxIterations || 10;

    while (iterations < maxIterations) {
      iterations++;

      if (this.config.verbose) {
        console.log(`\n--- Iteration ${iterations} ---`);
      }

      try {
        // Get available tools
        const tools = await this.getAvailableTools();

        // Generate response from model
        const response = await this.model.generate(this.conversationHistory, tools);

        if (this.config.verbose) {
          console.log("Model response:", response.content);
          if (response.toolCalls) {
            console.log("Tool calls:", response.toolCalls);
          }
        }

        // Add assistant response to history
        this.conversationHistory.push({
          role: "assistant",
          content: response.content,
          toolCalls: response.toolCalls,
        });

        // If no tool calls, we're done
        if (!response.toolCalls || response.toolCalls.length === 0) {
          return response.content;
        }

        // Execute tool calls
        const toolResults = await this.executeToolCalls(response.toolCalls);

        // Add tool results to conversation history
        for (const result of toolResults) {
          this.conversationHistory.push({
            role: "tool",
            content: result.content,
            toolCallId: result.toolCallId,
          });
        }

        // Continue the loop for next iteration
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (this.config.verbose) {
          console.error("Error in agentic loop:", errorMessage);
        }

        // Add error message and return
        const errorResponse = `Error in agentic loop: ${errorMessage}`;
        this.conversationHistory.push({
          role: "assistant",
          content: errorResponse,
        });

        return errorResponse;
      }
    }

    // Max iterations reached
    const maxIterationsResponse = `Maximum iterations (${maxIterations}) reached without completion.`;
    this.conversationHistory.push({
      role: "assistant",
      content: maxIterationsResponse,
    });

    return maxIterationsResponse;
  }

  /**
   * Get the current conversation history
   */
  getConversationHistory(): Message[] {
    return [...this.conversationHistory];
  }

  /**
   * Clear the conversation history (keeps system prompt)
   */
  clearHistory() {
    const systemMessage = this.conversationHistory.find(msg => msg.role === "system");
    this.conversationHistory = systemMessage ? [systemMessage] : [];
  }

  /**
   * Get the associated experiment
   */
  getExperiment(): ExperimentResource {
    return this.experiment;
  }

  /**
   * Get the associated agent
   */
  getAgent(): AgentResource {
    return this.agent;
  }

  /**
   * Get the MCP server instance
   */
  getMCPServer(): DummyMCPServer {
    return this.mcpServer;
  }
}