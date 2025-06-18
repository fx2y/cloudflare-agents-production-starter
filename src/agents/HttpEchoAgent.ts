import { Agent } from "agents";
import type { WorkerEnv } from "../types";

export class HttpEchoAgent extends Agent<WorkerEnv> {
  async onRequest(request: Request): Promise<Response> {
    try {
      if (request.method === 'GET') {
        return new Response(JSON.stringify({ 
          message: 'HttpEchoAgent is running', 
          path: new URL(request.url).pathname 
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (request.method === 'POST') {
        const body = await request.text();
        let data;
        
        try {
          data = JSON.parse(body);
        } catch {
          data = { raw: body };
        }
        
        return new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('Method not allowed', { status: 405 });
    } catch (error) {
      console.error('HttpEchoAgent error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}