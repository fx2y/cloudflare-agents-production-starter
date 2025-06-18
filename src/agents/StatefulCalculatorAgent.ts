import { McpAgent, McpTool } from './McpAgent';
import { Connection } from 'agents';
import type { WorkerEnv } from '../types';
import { z } from 'zod';

interface CalculatorState {
  total: number;
  serverInfo: {
    name: string;
    version: string;
  };
  tools: Record<string, any>;
  resources: Record<string, any>;
}

export class StatefulCalculatorAgent extends McpAgent {
  // Override the initialState to include our calculator-specific state
  initialState: CalculatorState = {
    total: 0,
    serverInfo: {
      name: 'Stateful Calculator MCP Server',
      version: '1.0.0'
    },
    tools: {},
    resources: {}
  };

  constructor(state: DurableObjectState, env: WorkerEnv) {
    super(state, env);
    // Initialize with our custom state
    this.setState(this.initialState);
  }

  protected async init(): Promise<void> {
    // Define the add tool with zod validation
    const addTool: McpTool = {
      name: 'add',
      description: 'Add a value to the running total for this session',
      inputSchema: {
        type: 'object',
        properties: {
          value: {
            type: 'number',
            description: 'The number to add to the total'
          }
        },
        required: ['value'],
        additionalProperties: false
      },
      handler: async (params: any) => {
        // Validate input with zod
        const schema = z.object({
          value: z.number()
        });
        
        const { value } = schema.parse(params);
        
        // Update the ephemeral session state
        const newTotal = (this.state as CalculatorState).total + value;
        this.setState({
          ...this.state,
          total: newTotal
        } as CalculatorState);
        
        return {
          content: [
            {
              type: 'text',
              text: `New total: ${newTotal}`
            }
          ]
        };
      }
    };

    // Define the reset tool
    const resetTool: McpTool = {
      name: 'reset',
      description: 'Reset the running total to zero for this session',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      handler: async () => {
        this.setState({
          ...this.state,
          total: 0
        } as CalculatorState);
        
        return {
          content: [
            {
              type: 'text',
              text: 'Total reset to 0'
            }
          ]
        };
      }
    };

    // Define the get_total tool
    const getTotalTool: McpTool = {
      name: 'get_total',
      description: 'Get the current running total for this session',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      handler: async () => {
        return {
          content: [
            {
              type: 'text',
              text: `Current total: ${(this.state as CalculatorState).total}`
            }
          ]
        };
      }
    };

    // Register all tools
    this.addTool(addTool);
    this.addTool(resetTool);
    this.addTool(getTotalTool);
  }

  protected async readResource(uri: string): Promise<string> {
    // This calculator doesn't have resources, but we need to implement the abstract method
    throw new Error(`Resource not found: ${uri}`);
  }

  async onConnect(connection: Connection): Promise<void> {
    // Send welcome message when a new connection is established  
    connection.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {
        message: `Welcome to Stateful Calculator! Your current total is: ${(this.state as CalculatorState).total}`
      }
    }));
  }
}