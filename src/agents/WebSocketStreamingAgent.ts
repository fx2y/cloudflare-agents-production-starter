import { Agent, Connection } from "agents";
import { OpenAI } from "openai";
import type { WorkerEnv } from "../types";

export interface WebSocketStreamChunk {
  type: "chunk" | "done";
  content?: string;
}

export class WebSocketStreamingAgent extends Agent<WorkerEnv> {
  async onMessage(connection: Connection, prompt: string) {
    try {
      const openai = new OpenAI({ apiKey: this.env.OPENAI_API_KEY });
      
      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          const message: WebSocketStreamChunk = { type: 'chunk', content };
          connection.send(JSON.stringify(message));
        }
      }
      
      const doneMessage: WebSocketStreamChunk = { type: 'done' };
      connection.send(JSON.stringify(doneMessage));
    } catch (error) {
      console.error('Error in WebSocket streaming:', error);
      connection.send(JSON.stringify({ 
        type: 'error', 
        content: 'Failed to generate response' 
      }));
    }
  }

  async onConnect(connection: Connection) {
    connection.send(JSON.stringify({ 
      type: 'connected', 
      content: 'Connected to WebSocket streaming agent. Send a message to start streaming.' 
    }));
  }

  async onClose(connection: Connection, code: number, reason: string) {
    console.log(`WebSocket connection ${connection.id} closed: ${reason} (code: ${code})`);
  }

  async onError(connection: Connection, error: unknown): Promise<void>;
  async onError(error: unknown): Promise<void>;
  async onError(connectionOrError: Connection | unknown, error?: unknown): Promise<void> {
    if (connectionOrError && typeof connectionOrError === 'object' && 'id' in connectionOrError) {
      // Called with connection and error
      const connection = connectionOrError as Connection;
      console.error(`WebSocket error on connection ${connection.id}:`, error);
      try {
        connection.close(1011, "Internal server error");
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    } else {
      // Called with just error
      console.error('WebSocket error:', connectionOrError);
    }
  }
}