import { AgentRunner } from "../agent";
import { ExperimentResource } from "../resources/experiment";
import { AgentResource } from "../resources/agent";
import { BaseModel, Message, ModelResponse, Tool } from "../models/interface";

/**
 * Mock model implementation for testing
 */
class MockModel extends BaseModel {
  getModelName(): string {
    return "mock-model";
  }

  supportsTools(): boolean {
    return true;
  }

  async generate(messages: Message[], tools?: Tool[]): Promise<ModelResponse> {
    // Simple mock that uses the echo tool if available
    const lastMessage = messages[messages.length - 1];
    
    if (tools && tools.some(t => t.name === "echo") && lastMessage.content.includes("echo")) {
      return {
        content: "I'll echo your message using the echo tool.",
        finishReason: "tool_calls",
        toolCalls: [
          {
            id: "test-tool-call-1",
            name: "echo",
            arguments: {
              message: "Hello from the agent runner!"
            }
          }
        ]
      };
    }

    if (tools && tools.some(t => t.name === "add") && lastMessage.content.includes("add")) {
      return {
        content: "I'll add these numbers for you.",
        finishReason: "tool_calls",
        toolCalls: [
          {
            id: "test-tool-call-2",
            name: "add",
            arguments: {
              a: 5,
              b: 3
            }
          }
        ]
      };
    }

    return {
      content: `Mock response to: "${lastMessage.content}"`,
      finishReason: "stop"
    };
  }
}

/**
 * Example usage of AgentRunner
 * This would typically be called from the CLI or other parts of the application
 */
export async function exampleAgentRunner() {
  try {
    // This would normally come from the database
    // For this example, we create mock resources
    console.log("=== Agent Runner Example ===\n");

    // Note: In real usage, these would be loaded from the database
    const mockExperiment = {
      toJSON: () => ({ id: 1, name: "test-experiment", problem: "Test problem" })
    } as ExperimentResource;

    const mockAgent = {
      toJSON: () => ({ 
        id: 1, 
        name: "test-agent", 
        systemPrompt: "You are a helpful assistant that can use tools to help users.",
        experiment: 1
      }),
      get experiment() { return mockExperiment; }
    } as AgentResource;

    // Create agent runner
    const runner = new AgentRunner(mockExperiment, mockAgent, {
      maxIterations: 5,
      verbose: true
    });

    // Set mock model
    const mockModel = new MockModel();
    runner.setModel(mockModel);

    console.log("Tools available:");
    const tools = await runner.getMCPServer().listTools();
    tools.forEach(tool => {
      console.log(`- ${tool.name}: ${tool.description}`);
    });
    console.log();

    // Test basic message
    console.log("=== Test 1: Basic message ===");
    const response1 = await runner.run("Hello, how are you?");
    console.log("Response:", response1);
    console.log();

    // Test tool usage
    console.log("=== Test 2: Tool usage (echo) ===");
    const response2 = await runner.run("Can you echo a message for me?");
    console.log("Response:", response2);
    console.log();

    // Test math tool
    console.log("=== Test 3: Tool usage (add) ===");
    const response3 = await runner.run("Can you add some numbers for me?");
    console.log("Response:", response3);
    console.log();

    // Show conversation history
    console.log("=== Conversation History ===");
    const history = runner.getConversationHistory();
    history.forEach((msg, i) => {
      console.log(`${i + 1}. [${msg.role}]: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
      if (msg.toolCalls) {
        console.log(`   Tool calls: ${msg.toolCalls.map(tc => tc.name).join(', ')}`);
      }
    });

    console.log("\n=== Example completed successfully ===");

  } catch (error) {
    console.error("Error in agent runner example:", error);
  }
}

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  exampleAgentRunner();
}