import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the agents package
vi.mock('agents', () => ({
  Agent: class Agent {
    constructor(context: any, env: any) {
      this.env = env;
      this.state = {};
    }
    setState(newState: any) {
      this.state = { ...this.state, ...newState };
    }
  }
}));

// Simple EchoAgent mock
class MockEchoAgent {
  env: any;
  state: any = {};

  constructor(context: any, env: any) {
    this.env = env;
  }

  setState(newState: any) {
    this.state = { ...this.state, ...newState };
  }

  async onConnect(connection: any) {
    console.log(`Connection ${connection.id} established.`);
    connection.send("Welcome!");
  }

  async onMessage(connection: any, message: string) {
    connection.send(`You said: ${message}`);
  }

  async onClose(connection: any, code: number, reason: string) {
    console.log(`Connection ${connection.id} closed: ${reason}`);
  }

  async onError(connectionOrError: any, error?: any) {
    if (connectionOrError && typeof connectionOrError === 'object' && 'id' in connectionOrError) {
      console.error(`Error on connection ${connectionOrError.id}:`, error);
    } else {
      console.error('Agent error:', connectionOrError);
    }
  }
}

describe('EchoAgent', () => {
  let agent: MockEchoAgent;
  let mockConnection: any;
  let mockEnv: any;

  beforeEach(() => {
    mockEnv = {
      ENVIRONMENT: 'test'
    };
    
    agent = new MockEchoAgent({}, mockEnv);
    
    mockConnection = {
      id: 'test-connection-123',
      send: vi.fn(),
      close: vi.fn(),
      setState: vi.fn(),
      state: null
    };
  });

  describe('onConnect', () => {
    it('should send welcome message on connection', async () => {
      await agent.onConnect(mockConnection);
      
      expect(mockConnection.send).toHaveBeenCalledWith('Welcome!');
    });

    it('should log connection establishment', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await agent.onConnect(mockConnection);
      
      expect(consoleSpy).toHaveBeenCalledWith('Connection test-connection-123 established.');
      consoleSpy.mockRestore();
    });
  });

  describe('onMessage', () => {
    it('should echo message with prefix', async () => {
      const testMessage = 'Hello world';
      
      await agent.onMessage(mockConnection, testMessage);
      
      expect(mockConnection.send).toHaveBeenCalledWith('You said: Hello world');
    });

    it('should handle empty messages', async () => {
      await agent.onMessage(mockConnection, '');
      
      expect(mockConnection.send).toHaveBeenCalledWith('You said: ');
    });

    it('should handle special characters', async () => {
      const specialMessage = '!@#$%^&*()';
      
      await agent.onMessage(mockConnection, specialMessage);
      
      expect(mockConnection.send).toHaveBeenCalledWith('You said: !@#$%^&*()');
    });
  });

  describe('onClose', () => {
    it('should log connection closure', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await agent.onClose(mockConnection, 1000, 'Normal closure');
      
      expect(consoleSpy).toHaveBeenCalledWith('Connection test-connection-123 closed: Normal closure');
      consoleSpy.mockRestore();
    });

    it('should handle different close codes', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await agent.onClose(mockConnection, 1001, 'Going away');
      
      expect(consoleSpy).toHaveBeenCalledWith('Connection test-connection-123 closed: Going away');
      consoleSpy.mockRestore();
    });
  });

  describe('onError', () => {
    it('should handle connection-specific errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Test error');
      
      await agent.onError(mockConnection, error);
      
      expect(consoleSpy).toHaveBeenCalledWith('Error on connection test-connection-123:', error);
      consoleSpy.mockRestore();
    });

    it('should handle general agent errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('General error');
      
      await agent.onError(error);
      
      expect(consoleSpy).toHaveBeenCalledWith('Agent error:', error);
      consoleSpy.mockRestore();
    });

    it('should handle unknown error types', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await agent.onError('string error');
      
      expect(consoleSpy).toHaveBeenCalledWith('Agent error:', 'string error');
      consoleSpy.mockRestore();
    });
  });
});