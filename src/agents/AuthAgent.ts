import { Agent } from 'agents';
import type { WorkerEnv } from '../types';

export class AuthAgent extends Agent<WorkerEnv> {
  async onConnect(connection: any) {
    connection.send("Welcome to the secure connection!");
  }

  async onMessage(connection: any, message: string) {
    try {
      const data = JSON.parse(message);
      connection.send(`Secure echo: ${JSON.stringify(data)}`);
    } catch (e) {
      connection.send("Invalid JSON");
    }
  }

  async connect(request: Request): Promise<Response> {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    
    server.accept();
    
    const connection = {
      id: `conn-${Date.now()}`,
      send: (message: string) => server.send(message),
      close: () => server.close(),
      setState: (state: any) => { (connection as any).state = state; },
      state: null
    };
    
    server.addEventListener('message', async (event) => {
      try {
        await this.onMessage(connection as any, event.data as string);
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
    
    server.addEventListener('close', async (event) => {
      try {
        await (this as any).onClose?.(connection, event.code || 1000, event.reason || '', event.wasClean || true);
      } catch (error) {
        console.error('WebSocket close error:', error);
      }
    });
    
    try {
      await this.onConnect(connection as any);
    } catch (error) {
      console.error('WebSocket connect error:', error);
    }
    
    return new Response(null, { status: 101, webSocket: client });
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle authentication endpoints
    if (url.pathname === '/auth/login') {
      return this.handleLogin(request);
    }
    
    if (url.pathname === '/auth/protected' || url.pathname === '/secure') {
      return this.handleProtectedRoute(request);
    }
    
    // Default response for other auth endpoints requires authentication
    return this.handleProtectedRoute(request);
  }

  private async handleLogin(request: Request): Promise<Response> {
    try {
      const body = await request.json() as { username?: string; password?: string };
      
      if (!body.username || !body.password) {
        return new Response('Missing credentials', { status: 400 });
      }

      // Simple mock validation
      if (body.username === 'testuser' && body.password === 'testpass') {
        return new Response(JSON.stringify({ 
          token: 'valid-token',
          user: { id: 1, username: body.username }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('Invalid credentials', { status: 401 });
    } catch (error) {
      return new Response('Invalid request body', { status: 400 });
    }
  }

  private async handleProtectedRoute(request: Request): Promise<Response> {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('Missing or invalid authorization header', { status: 401 });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Validate token (mock validation)
    if (token === 'valid-token') {
      return new Response(JSON.stringify({ 
        message: 'Access granted',
        user: { id: 1, username: 'testuser' }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Invalid or expired token', { status: 403 });
  }
}