import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketStreamingAgent } from '../../../src/agents/WebSocketStreamingAgent';
import { createMockAgent } from '../../test-utils';

// Mock OpenAI
vi.mock('openai', () => ({
  OpenAI: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn()
      }
    }
  }))
}));

describe('WebSocketStreamingAgent', () => {
  let agent: WebSocketStreamingAgent;
  let mockConnection: any;
  let mockEnv: any;
  let mockOpenAI: any;

  beforeEach(() => {
    mockEnv = {
      OPENAI_API_KEY: 'test-api-key',
      ENVIRONMENT: 'test'
    };
    
    agent = createMockAgent(WebSocketStreamingAgent, mockEnv);
    
    mockConnection = {
      id: 'test-connection-123',
      send: vi.fn(),
      close: vi.fn(),
      setState: vi.fn(),
      state: null
    };

    // Setup OpenAI mock
    const { OpenAI } = require('openai');
    mockOpenAI = new OpenAI();
  });

  describe('onConnect', () => {
    it('should send welcome message', async () => {
      await agent.onConnect(mockConnection);
      
      expect(mockConnection.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'connected', message: 'WebSocket connected! Send a prompt to start streaming.' })
      );
    });

    it('should log connection', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await agent.onConnect(mockConnection);
      
      expect(consoleSpy).toHaveBeenCalledWith('WebSocket connection established:', 'test-connection-123');
      consoleSpy.mockRestore();
    });
  });

  describe('onMessage', () => {
    it('should stream LLM response for valid prompt', async () => {
      // Mock streaming response
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: 'Hello ' } }] };
          yield { choices: [{ delta: { content: 'world!' } }] };
          yield { choices: [{ delta: {} }] };
        }
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockStream);

      await agent.onMessage(mockConnection, 'Test prompt');

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Test prompt' }],
        stream: true,
      });

      expect(mockConnection.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'chunk', content: 'Hello ' })
      );
      expect(mockConnection.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'chunk', content: 'world!' })
      );
      expect(mockConnection.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'done' })
      );
    });

    it('should handle empty prompts', async () => {
      await agent.onMessage(mockConnection, '');

      expect(mockConnection.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'error', message: 'Empty prompt received' })
      );
    });

    it('should handle OpenAI API errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));

      await agent.onMessage(mockConnection, 'Test prompt');

      expect(consoleSpy).toHaveBeenCalledWith('OpenAI streaming error:', expect.any(Error));
      expect(mockConnection.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'error', message: 'Failed to generate response' })
      );
      consoleSpy.mockRestore();
    });

    it('should handle missing API key', async () => {
      agent.env.OPENAI_API_KEY = undefined;

      await agent.onMessage(mockConnection, 'Test prompt');

      expect(mockConnection.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'error', message: 'OpenAI API key not configured' })
      );
    });
  });

  describe('onClose', () => {
    it('should log connection closure', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await agent.onClose(mockConnection, 1000, 'Normal close');
      
      expect(consoleSpy).toHaveBeenCalledWith('WebSocket connection closed:', 'test-connection-123', 'Code:', 1000, 'Reason:', 'Normal close');
      consoleSpy.mockRestore();
    });
  });

  describe('onError', () => {
    it('should handle connection-specific errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Connection error');

      await agent.onError(mockConnection, error);

      expect(consoleSpy).toHaveBeenCalledWith('WebSocket connection error:', 'test-connection-123', error);
      consoleSpy.mockRestore();
    });

    it('should handle general errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('General error');

      await agent.onError(error);

      expect(consoleSpy).toHaveBeenCalledWith('WebSocket agent error:', error);
      consoleSpy.mockRestore();
    });
  });
});