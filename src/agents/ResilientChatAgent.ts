import { Agent, Connection } from "agents";
import type { WorkerEnv } from "../types";

interface ChatState {
  userCount: number;
}

export class ResilientChatAgent extends Agent<WorkerEnv> {
  constructor(context: any, env: WorkerEnv) {
    super(context, env);
    this.state = { userCount: 0 };
  }

  async onConnect(connection: Connection) {
    console.log(`Connection ${connection.id} established`);
    this.setState({ userCount: this.state.userCount + 1 });
    connection.send(JSON.stringify({ 
      type: 'connected', 
      userCount: this.state.userCount 
    }));
  }

  async onMessage(connection: Connection, message: string) {
    try {
      const data = JSON.parse(message);
      
      if (data.command === 'force_error') {
        connection.close(1011, 'Internal server error');
        return;
      }
      
      if (data.command === 'get_user_count') {
        connection.send(JSON.stringify({ 
          type: 'user_count', 
          count: this.state.userCount 
        }));
        return;
      }
      
      connection.send(JSON.stringify({ 
        type: 'echo', 
        message: data.message || message 
      }));
    } catch (error) {
      console.error('Message parsing error:', error);
      connection.send(JSON.stringify({ 
        type: 'error', 
        message: 'Invalid message format' 
      }));
    }
  }

  async onClose(connection: Connection, code: number, reason: string) {
    console.log(`Connection ${connection.id} closed: ${reason} (code: ${code})`);
    this.setState({ userCount: Math.max(0, this.state.userCount - 1) });
  }

  async onError(connection: Connection, error: unknown): Promise<void>;
  async onError(error: unknown): Promise<void>;
  async onError(connectionOrError: Connection | unknown, error?: unknown): Promise<void> {
    if (connectionOrError && typeof connectionOrError === 'object' && 'id' in connectionOrError) {
      const connection = connectionOrError as Connection;
      console.error(`Connection ${connection.id} error:`, error);
    } else {
      console.error('Agent error:', connectionOrError);
    }
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    
    if (pathSegments.includes('get-state')) {
      return new Response(JSON.stringify({ userCount: this.state.userCount }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Method not allowed', { status: 405 });
  }
}