import { McpAgent, McpTool } from './McpAgent';
import { Connection } from 'agents';
import type { WorkerEnv } from '../types';
import { z } from 'zod';

export class SecureMcpAgent extends McpAgent {
  initialState = {
    serverInfo: {
      name: 'Secure MCP Server',
      version: '1.0.0'
    },
    tools: {},
    resources: {}
  };

  protected async init(): Promise<void> {
    // Define a sample secure tool for demonstration
    const echoTool: McpTool = {
      name: 'echo',
      description: 'Echo back the provided message (requires OAuth authentication)',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The message to echo back'
          }
        },
        required: ['message'],
        additionalProperties: false
      },
      handler: async (params: any) => {
        const schema = z.object({
          message: z.string()
        });
        
        const { message } = schema.parse(params);
        
        return {
          content: [
            {
              type: 'text',
              text: `[SECURE ECHO] ${message}`
            }
          ]
        };
      }
    };

    // Define a tool that accesses environment variables
    const getTimeTool: McpTool = {
      name: 'get_time',
      description: 'Get the current server time (secure operation)',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      handler: async () => {
        const now = new Date().toISOString();
        
        return {
          content: [
            {
              type: 'text',
              text: `Current server time: ${now}`
            }
          ]
        };
      }
    };

    // Define a tool that demonstrates SQL access in a secure context
    const getInfoTool: McpTool = {
      name: 'get_info',
      description: 'Get server information (requires authentication)',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      handler: async () => {
        // This would typically access sensitive data that requires OAuth
        const info = {
          agentId: this.name,
          serverTime: new Date().toISOString(),
          environment: (this.env as any).ENVIRONMENT || 'development'
        };
        
        return {
          content: [
            {
              type: 'text',
              text: `Server Info: ${JSON.stringify(info, null, 2)}`
            }
          ]
        };
      }
    };

    // Register all tools
    this.addTool(echoTool);
    this.addTool(getTimeTool);
    this.addTool(getInfoTool);
  }

  protected async readResource(uri: string): Promise<string> {
    // This secure agent doesn't expose resources directly
    throw new Error(`Resource access denied: ${uri}`);
  }

  async onConnect(connection: Connection): Promise<void> {
    // Send authenticated welcome message
    connection.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {
        message: 'Welcome to Secure MCP Server! You are authenticated and can access secure tools.'
      }
    }));
  }

  // Static methods for OAuth integration
  static serveSSE(path: string) {
    return async (request: Request, env: WorkerEnv) => {
      // This would be the SSE endpoint handler for MCP over Server-Sent Events
      const response = new Response('SSE MCP endpoint not yet implemented', {
        status: 501,
        headers: {
          'Content-Type': 'text/plain'
        }
      });
      return response;
    };
  }

  static serve(path: string) {
    return async (request: Request, env: WorkerEnv) => {
      // This would be the WebSocket endpoint handler for MCP over WebSockets
      if (request.headers.get('upgrade') === 'websocket') {
        // Handle WebSocket upgrade for MCP protocol
        const [client, server] = Object.values(new WebSocketPair());
        
        // In a real implementation, we would:
        // 1. Get the agent instance based on authenticated user
        // 2. Connect the WebSocket to the agent
        // 3. Handle MCP protocol messages
        
        return new Response(null, {
          status: 200,
          headers: {
            'upgrade': 'websocket',
            'connection': 'upgrade'
          }
        });
      }
      
      return new Response('WebSocket MCP endpoint requires upgrade', {
        status: 400,
        headers: {
          'Content-Type': 'text/plain'
        }
      });
    };
  }
}