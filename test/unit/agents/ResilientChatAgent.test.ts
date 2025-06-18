import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResilientChatAgent } from '../../../src/agents/ResilientChatAgent';
import { createMockAgent } from '../../test-utils';

describe('ResilientChatAgent', () => {
  let agent: ResilientChatAgent;
  let mockConnection: any;
  let mockEnv: any;

  beforeEach(() => {
    mockEnv = {
      ENVIRONMENT: 'test'
    };
    
    agent = createMockAgent(ResilientChatAgent, mockEnv);
    agent.state = { userCount: 0 }; // Initialize state
    
    mockConnection = {
      id: 'test-connection-123',
      send: vi.fn(),
      close: vi.fn(),
      setState: vi.fn(),
      state: null
    };
  });

  describe('constructor', () => {
    it('should initialize with zero user count', () => {
      expect(agent.setState).toHaveBeenCalledWith({ userCount: 0 });
    });
  });

  describe('onConnect', () => {
    it('should increment user count and send connected message', async () => {
      agent.state = { userCount: 5 };
      
      await agent.onConnect(mockConnection);
      
      expect(agent.setState).toHaveBeenCalledWith({ userCount: 6 });
      expect(mockConnection.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'connected', userCount: 6 })
      );
    });

    it('should log connection establishment', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await agent.onConnect(mockConnection);
      
      expect(consoleSpy).toHaveBeenCalledWith('Connection test-connection-123 established');
      consoleSpy.mockRestore();
    });
  });

  describe('onMessage', () => {
    it('should handle force_error command', async () => {
      const command = JSON.stringify({ command: 'force_error' });
      
      await agent.onMessage(mockConnection, command);
      
      expect(mockConnection.close).toHaveBeenCalledWith(1011, 'Internal server error');
    });

    it('should handle get_user_count command', async () => {
      agent.state = { userCount: 10 };
      const command = JSON.stringify({ command: 'get_user_count' });
      
      await agent.onMessage(mockConnection, command);
      
      expect(mockConnection.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'user_count', count: 10 })
      );
    });

    it('should echo messages with type echo', async () => {
      const command = JSON.stringify({ message: 'Hello world' });
      
      await agent.onMessage(mockConnection, command);
      
      expect(mockConnection.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'echo', message: 'Hello world' })
      );
    });

    it('should handle invalid JSON gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await agent.onMessage(mockConnection, 'invalid json');
      
      expect(consoleSpy).toHaveBeenCalledWith('Message parsing error:', expect.any(Error));
      expect(mockConnection.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'error', message: 'Invalid message format' })
      );
      consoleSpy.mockRestore();
    });

    it('should fall back to raw message when no message property', async () => {
      const command = JSON.stringify({ command: 'unknown' });
      
      await agent.onMessage(mockConnection, command);
      
      expect(mockConnection.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'echo', message: command })
      );
    });
  });

  describe('onClose', () => {
    it('should decrement user count', async () => {
      agent.state = { userCount: 5 };
      
      await agent.onClose(mockConnection, 1000, 'Normal close');
      
      expect(agent.setState).toHaveBeenCalledWith({ userCount: 4 });
    });

    it('should not go below zero user count', async () => {
      agent.state = { userCount: 0 };
      
      await agent.onClose(mockConnection, 1000, 'Normal close');
      
      expect(agent.setState).toHaveBeenCalledWith({ userCount: 0 });
    });

    it('should log connection closure', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await agent.onClose(mockConnection, 1000, 'Normal close');
      
      expect(consoleSpy).toHaveBeenCalledWith('Connection test-connection-123 closed: Normal close (code: 1000)');
      consoleSpy.mockRestore();
    });
  });

  describe('onRequest', () => {
    it('should return user count for get-state endpoint', async () => {
      agent.state = { userCount: 15 };
      const request = new Request('http://example.com/resilient-chat-agent/test-id/get-state');

      const response = await agent.onRequest(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ userCount: 15 });
    });

    it('should return 405 for non-get-state requests', async () => {
      const request = new Request('http://example.com/resilient-chat-agent/test-id/other');

      const response = await agent.onRequest(request);

      expect(response.status).toBe(405);
      expect(await response.text()).toBe('Method not allowed');
    });
  });
});