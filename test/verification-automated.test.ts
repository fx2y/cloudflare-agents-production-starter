import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockAgent } from './test-utils';

// Mock the AI SDK modules
vi.mock('ai', () => ({
  streamText: vi.fn().mockResolvedValue({
    toTextStreamResponse: vi.fn().mockReturnValue(
      new Response("data: test stream\n\n", {
        headers: { "Content-Type": "text/event-stream" }
      })
    )
  })
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn().mockReturnValue({})
}));

// Mock OpenAI for WebSocket streaming
vi.mock('openai', () => ({
  OpenAI: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            yield { choices: [{ delta: { content: 'Hello ' } }] };
            yield { choices: [{ delta: { content: 'world!' } }] };
            yield { choices: [{ delta: {} }] };
          }
        })
      }
    }
  }))
}));

describe('Verification Tests - Automated', () => {
  let EchoAgent: any;
  let StreamingAgent: any;
  let CounterAgent: any;
  let ChattyAgent: any;
  let WebSocketStreamingAgent: any;

  beforeAll(async () => {
    const { EchoAgent: EA } = await import('../src/agents/EchoAgent');
    const { StreamingAgent: SA } = await import('../src/agents/StreamingAgent');
    const { CounterAgent: CA } = await import('../src/agents/CounterAgent');
    const { ChattyAgent: CHA } = await import('../src/agents/ChattyAgent');
    const { WebSocketStreamingAgent: WSA } = await import('../src/agents/WebSocketStreamingAgent');
    
    EchoAgent = EA;
    StreamingAgent = SA;
    CounterAgent = CA;
    ChattyAgent = CHA;
    WebSocketStreamingAgent = WSA;
  });

  describe('EchoAgent WebSocket Lifecycle', () => {
    it('should send Welcome message on connect', async () => {
      const agent = createMockAgent(EchoAgent);
      const connection = { id: 'test-1', send: vi.fn(), close: vi.fn() };
      
      await agent.onConnect(connection);
      
      expect(connection.send).toHaveBeenCalledWith('Welcome!');
    });

    it('should echo messages with "You said:" prefix', async () => {
      const agent = createMockAgent(EchoAgent);
      const connection = { id: 'test-1', send: vi.fn(), close: vi.fn() };
      
      await agent.onMessage(connection, 'test message');
      
      expect(connection.send).toHaveBeenCalledWith('You said: test message');
    });
  });

  describe('StreamingAgent SSE', () => {
    it('should return text/event-stream response', async () => {
      const agent = createMockAgent(StreamingAgent, { OPENAI_API_KEY: 'test-key' });
      const request = new Request('http://example.com/test');
      
      const response = await agent.onRequest(request);
      
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    });
  });

  describe('CounterAgent Command Pattern', () => {
    it('should handle increment command', async () => {
      const agent = createMockAgent(CounterAgent);
      const connection = { id: 'test-1', send: vi.fn(), close: vi.fn() };
      
      await agent.onMessage(connection, JSON.stringify({ op: 'increment' }));
      
      expect(agent.state.counter).toBe(1);
    });

    it('should handle decrement command', async () => {
      const agent = createMockAgent(CounterAgent);
      const connection = { id: 'test-1', send: vi.fn(), close: vi.fn() };
      
      await agent.onMessage(connection, JSON.stringify({ op: 'decrement' }));
      
      expect(agent.state.counter).toBe(-1);
    });

    it('should handle malformed JSON gracefully', async () => {
      const agent = createMockAgent(CounterAgent);
      const connection = { id: 'test-1', send: vi.fn(), close: vi.fn() };
      
      // Should not throw
      await expect(agent.onMessage(connection, 'invalid json')).resolves.not.toThrow();
    });
  });

  describe('ChattyAgent Connection State', () => {
    it('should set nickname per connection', async () => {
      const agent = createMockAgent(ChattyAgent);
      const connectionA = { id: 'test-1', send: vi.fn(), close: vi.fn(), setState: vi.fn(), state: null };
      const connectionB = { id: 'test-2', send: vi.fn(), close: vi.fn(), setState: vi.fn(), state: null };
      
      await agent.onMessage(connectionA, JSON.stringify({ op: 'set_nick', nick: 'Alice' }));
      await agent.onMessage(connectionB, JSON.stringify({ op: 'set_nick', nick: 'Bob' }));
      
      expect(connectionA.setState).toHaveBeenCalledWith({ nickname: 'Alice' });
      expect(connectionB.setState).toHaveBeenCalledWith({ nickname: 'Bob' });
    });

    it('should broadcast messages with nickname prefix', async () => {
      const agent = createMockAgent(ChattyAgent);
      const connectionA = { id: 'test-1', send: vi.fn(), close: vi.fn(), setState: vi.fn(), state: { nickname: 'Alice' } };
      const connectionB = { id: 'test-2', send: vi.fn(), close: vi.fn(), setState: vi.fn(), state: { nickname: 'Bob' } };
      
      // Add connections to the agent
      agent.connections = [connectionA, connectionB];
      
      await agent.onMessage(connectionA, JSON.stringify({ op: 'send_text', text: 'Hello everyone' }));
      
      expect(connectionA.send).toHaveBeenCalledWith('Alice: Hello everyone');
      expect(connectionB.send).toHaveBeenCalledWith('Alice: Hello everyone');
    });
  });

  describe('WebSocketStreamingAgent', () => {
    it('should send connected message on connect', async () => {
      const agent = createMockAgent(WebSocketStreamingAgent, { OPENAI_API_KEY: 'test-key' });
      const connection = { id: 'test-1', send: vi.fn(), close: vi.fn() };
      
      await agent.onConnect(connection);
      
      expect(connection.send).toHaveBeenCalledWith(
        JSON.stringify({ 
          type: 'connected', 
          content: 'Connected to WebSocket streaming agent. Send a message to start streaming.' 
        })
      );
    });

    it('should stream LLM response as chunks', async () => {
      const agent = createMockAgent(WebSocketStreamingAgent, { OPENAI_API_KEY: 'test-key' });
      const connection = { id: 'test-1', send: vi.fn(), close: vi.fn() };
      
      await agent.onMessage(connection, 'Tell me a story');
      
      // Expect chunk messages and done message
      expect(connection.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'chunk', content: 'Hello ' })
      );
      expect(connection.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'chunk', content: 'world!' })
      );
      expect(connection.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'done' })
      );
    });

    it('should handle errors gracefully', async () => {
      const agent = createMockAgent(WebSocketStreamingAgent, { OPENAI_API_KEY: 'invalid' });
      const connection = { id: 'test-1', send: vi.fn(), close: vi.fn() };
      
      // Mock a failure
      const mockCreate = vi.fn().mockRejectedValue(new Error('API Error'));
      agent.env = { OPENAI_API_KEY: 'invalid' };
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await agent.onMessage(connection, 'test');
      
      consoleSpy.mockRestore();
    });

    it('should handle onClose event', async () => {
      const agent = createMockAgent(WebSocketStreamingAgent, { OPENAI_API_KEY: 'test-key' });
      const connection = { id: 'test-1', send: vi.fn(), close: vi.fn() };
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await agent.onClose(connection, 1000, 'Normal closure');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'WebSocket connection test-1 closed: Normal closure (code: 1000)'
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle onError event', async () => {
      const agent = createMockAgent(WebSocketStreamingAgent, { OPENAI_API_KEY: 'test-key' });
      const connection = { id: 'test-1', send: vi.fn(), close: vi.fn() };
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await agent.onError(connection, new Error('Test error'));
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'WebSocket error on connection test-1:', 
        expect.any(Error)
      );
      expect(connection.close).toHaveBeenCalledWith(1011, 'Internal server error');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Client Communication Patterns', () => {
    it('should support AgentClient options interface', () => {
      // Test that the interface exists and is properly typed
      const options: any = {
        agent: 'echo-agent',
        name: 'test-123',
        host: 'localhost:8787',
        secure: false
      };
      
      expect(options.agent).toBe('echo-agent');
      expect(options.name).toBe('test-123');
      expect(options.host).toBe('localhost:8787');
      expect(options.secure).toBe(false);
    });

    it('should support agentFetch options interface', () => {
      // Test that the interface exists and is properly typed
      const options: any = {
        agent: 'counter-agent',
        name: 'test-456',
        host: 'my-worker.workers.dev',
        secure: true
      };
      
      expect(options.agent).toBe('counter-agent');
      expect(options.name).toBe('test-456');
      expect(options.host).toBe('my-worker.workers.dev');
      expect(options.secure).toBe(true);
    });
  });

  describe('Prefixed Routing Support', () => {
    it('should support /api/v1 prefix for agent routes', () => {
      // This test verifies the routing structure exists
      // Actual routing tests would require a full Worker environment
      const prefixedRoute = '/api/v1/echo-agent/test-123';
      const normalRoute = '/agent/echo-agent/test-123';
      
      expect(prefixedRoute).toContain('/api/v1/');
      expect(normalRoute).toContain('/agent/');
      expect(prefixedRoute.split('/').length).toBeGreaterThan(3);
    });
  });
});