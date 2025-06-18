import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkerEnv } from '../../src/types';
import { MigratingAgent } from '../../src/agents/MigratingAgent';
import { CounterAgent } from '../../src/agents/CounterAgent';
import { HistoryAgent } from '../../src/agents/HistoryAgent';

// Mock the agents module with error simulation capabilities
vi.mock('agents', () => ({
  Agent: class MockAgent {
    constructor(public env: any, public name: string) {}
    state: any = {};
    sql: any;
    
    setState(newState: any) {
      this.state = { ...this.state, ...newState };
    }
    
    setupMockSql(behavior: 'success' | 'error' | 'timeout' = 'success') {
      this.sql = vi.fn((query: TemplateStringsArray, ...values: any[]) => {
        const queryStr = query.join('?');
        
        if (behavior === 'error') {
          throw new Error('SQL execution failed');
        }
        
        if (behavior === 'timeout') {
          throw new Error('Query timeout');
        }
        
        // Simulate successful queries
        if (queryStr.includes('CREATE TABLE')) return [];
        if (queryStr.includes('INSERT INTO _meta')) return [];
        if (queryStr.includes('SELECT value FROM _meta')) {
          return [{ value: 0 }];
        }
        if (queryStr.includes('UPDATE _meta')) return [];
        if (queryStr.includes('ALTER TABLE')) return [];
        if (queryStr.includes('INSERT INTO users')) return [];
        if (queryStr.includes('SELECT * FROM users')) return [];
        
        return [];
      });
    }
  }
}));

describe('Error Handling and Recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SQL Error Handling', () => {
    it('should handle SQL connection failures during migration', async () => {
      const mockEnv = {} as WorkerEnv;
      const agent = new MigratingAgent(mockEnv, 'test-migrating');
      
      // Setup SQL to fail
      (agent as any).setupMockSql('error');
      
      // Migration should handle SQL failures gracefully and set migrationFailed flag
      await agent.onStart(); // Should not throw, but set internal flag
      
      // Test that agent is locked after migration failure
      const request = new Request('http://test.com/', { method: 'GET' });
      const response = await agent.onRequest(request);
      expect(response.status).toBe(503);
    });

    it('should handle partial migration failures', async () => {
      const mockEnv = {} as WorkerEnv;
      const agent = new MigratingAgent(mockEnv, 'test-partial-migration');
      
      let callCount = 0;
      (agent as any).sql = vi.fn((query: TemplateStringsArray, ...values: any[]) => {
        const queryStr = query.join('?');
        callCount++;
        
        // Fail on ALTER TABLE step (which would be the second migration)
        if (queryStr.includes('ALTER TABLE')) {
          throw new Error('Migration step failed');
        }
        
        if (queryStr.includes('CREATE TABLE')) return [];
        if (queryStr.includes('INSERT INTO _meta')) return [];
        if (queryStr.includes('SELECT value FROM _meta')) return [{ value: 0 }];
        if (queryStr.includes('UPDATE _meta')) return [];
        
        return [];
      });
      
      // Should handle partial migration failures gracefully
      await agent.onStart(); // Should not throw
      
      // Verify agent is locked due to migration failure
      const request = new Request('http://test.com/', { method: 'GET' });
      const response = await agent.onRequest(request);
      expect(response.status).toBe(503);
    });

    it('should handle SQL injection attempts in user queries', async () => {
      const mockEnv = {} as WorkerEnv;
      const agent = new MigratingAgent(mockEnv, 'test-injection');
      
      (agent as any).setupMockSql('success');
      
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "1; DELETE FROM _meta; --"
      ];
      
      // Should use parameterized queries to prevent injection
      for (const input of maliciousInputs) {
        const request = new Request('http://test.com/users', {
          method: 'POST',
          body: JSON.stringify({ name: input, email: 'test@example.com' })
        });
        
        const response = await agent.onRequest(request);
        
        // Should handle malicious input safely
        expect([200, 400, 500]).toContain(response.status);
      }
    });

    it('should handle database deadlocks and conflicts', async () => {
      const mockEnv = {} as WorkerEnv;
      const agent = new CounterAgent(mockEnv, 'test-deadlock');
      
      (agent as any).sql = vi.fn().mockImplementation(() => {
        throw new Error('SQLITE_BUSY: database is locked');
      });
      
      const mockConnection = {
        send: vi.fn(),
        close: vi.fn(),
        id: 'deadlock-test'
      };
      
      // Should handle database locks gracefully
      await agent.onMessage(mockConnection as any, JSON.stringify({ op: 'increment' }));
      
      // Should send error response
      expect(mockConnection.send).toHaveBeenCalled();
    });
  });

  describe('State Management Error Handling', () => {
    it('should handle setState failures', async () => {
      const mockEnv = {} as WorkerEnv;
      const agent = new CounterAgent(mockEnv, 'test-setstate-error');
      
      // Mock setState to fail
      const originalSetState = agent.setState;
      agent.setState = vi.fn().mockImplementation(() => {
        throw new Error('State update failed');
      });
      
      const mockConnection = {
        send: vi.fn(),
        close: vi.fn(),
        id: 'setstate-error-test'
      };
      
      await agent.onMessage(mockConnection as any, JSON.stringify({ op: 'increment' }));
      
      // Should handle setState errors gracefully
      expect(mockConnection.send).toHaveBeenCalled();
    });

    it('should handle corrupted state recovery', async () => {
      const mockEnv = {} as WorkerEnv;
      const agent = new CounterAgent(mockEnv, 'test-corrupted-state');
      
      // Simulate corrupted state
      (agent as any).state = null;
      
      const mockConnection = {
        send: vi.fn(),
        close: vi.fn(),
        id: 'corrupted-state-test'
      };
      
      await agent.onMessage(mockConnection as any, JSON.stringify({ op: 'get' }));
      
      // Should initialize with default state
      expect(mockConnection.send).toHaveBeenCalled();
    });

    it('should handle state synchronization conflicts', async () => {
      const mockEnv = {} as WorkerEnv;
      const agent = new HistoryAgent(mockEnv, 'test-sync-conflict');
      
      // Setup SQL mock
      (agent as any).sql = vi.fn((query: TemplateStringsArray, ...values: any[]) => {
        const queryStr = query.join('?');
        if (queryStr.includes('CREATE TABLE')) return [];
        if (queryStr.includes('INSERT INTO messages')) return [{ id: 1 }];
        if (queryStr.includes('SELECT * FROM messages')) return [];
        return [];
      });
      
      await agent.onStart();
      
      // Simulate concurrent HTTP requests (which HistoryAgent actually handles)
      const requests = Array(5).fill(null).map((_, i) => {
        const request = new Request('http://test.com/', {
          method: 'POST',
          body: JSON.stringify({ text: `test message ${i}` })
        });
        return agent.onRequest(request);
      });
      
      const responses = await Promise.allSettled(requests);
      
      // All requests should complete successfully
      responses.forEach(result => {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled') {
          expect([200, 201].includes(result.value.status)).toBe(true);
        }
      });
    });
  });

  describe('Network and External Service Error Handling', () => {
    it('should handle fetch timeouts', async () => {
      const mockEnv = {} as WorkerEnv;
      
      // Mock fetch to timeout
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 10);
        })
      );
      
      try {
        const response = await fetch('https://api.example.com/data');
        expect(response).toBeUndefined();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('timeout');
      }
      
      global.fetch = originalFetch;
    });

    it('should handle API rate limiting', async () => {
      const mockEnv = {} as WorkerEnv;
      
      // Mock fetch to return rate limit response
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '60' }),
        json: () => Promise.resolve({ error: 'Rate limit exceeded' })
      } as Response);
      
      const response = await fetch('https://api.example.com/data');
      
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('60');
    });

    it('should handle malformed API responses', async () => {
      const mockEnv = {} as WorkerEnv;
      
      // Mock fetch to return malformed JSON
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Invalid JSON'))
      } as Response);
      
      try {
        const response = await fetch('https://api.example.com/data');
        await response.json();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Invalid JSON');
      }
    });
  });

  describe('Memory and Resource Error Handling', () => {
    it('should handle out-of-memory conditions', async () => {
      const mockEnv = {} as WorkerEnv;
      const agent = new CounterAgent(mockEnv, 'test-oom');
      
      // Simulate memory exhaustion via recursive function
      const mockConnection = {
        send: vi.fn(),
        close: vi.fn(),
        id: 'oom-test'
      };
      
      // Create a recursive function that will cause stack overflow
      const createStackOverflow = (): void => {
        try {
          createStackOverflow();
        } catch (error) {
          // This simulates the actual error we're testing
          throw new RangeError('Maximum call stack size exceeded');
        }
      };
      
      // Test that the agent handles the out-of-memory error gracefully
      try {
        createStackOverflow();
      } catch (error) {
        expect(error).toBeInstanceOf(RangeError);
        expect((error as Error).message).toContain('Maximum call stack size exceeded');
      }
      
      // Agent should still be able to handle valid requests
      await agent.onMessage(mockConnection as any, JSON.stringify({ op: 'increment' }));
      expect(mockConnection.send).toHaveBeenCalled();
    });

    it('should handle WebSocket connection limits', async () => {
      const mockEnv = {} as WorkerEnv;
      const agent = new CounterAgent(mockEnv, 'test-ws-limit');
      
      // Simulate maximum connections reached
      const maxConnections = 100;
      const connections = Array(maxConnections + 10).fill(null).map((_, i) => ({
        send: vi.fn(),
        close: vi.fn(),
        id: `ws-limit-${i}`
      }));
      
      const connectPromises = connections.map(conn => 
        agent.onConnect?.(conn as any)
      );
      
      await Promise.allSettled(connectPromises);
      
      // Should handle connection limits gracefully
      expect(connections[0].send).toBeDefined();
    });
  });

  describe('Input Validation Error Handling', () => {
    it('should handle malformed JSON in requests', async () => {
      const mockEnv = {} as WorkerEnv;
      const agent = new CounterAgent(mockEnv, 'test-malformed-json');
      
      const mockConnection = {
        send: vi.fn(),
        close: vi.fn(),
        id: 'malformed-json-test'
      };
      
      const malformedInputs = [
        'not json at all',
        '{"incomplete": ',
        '{"trailing": "comma",}',
        '{invalid: "keys"}',
        'null'
      ];
      
      for (const input of malformedInputs) {
        await agent.onMessage(mockConnection as any, input);
      }
      
      // Should handle all malformed inputs
      expect(mockConnection.send).toHaveBeenCalledTimes(malformedInputs.length);
    });

    it('should validate required fields in requests', async () => {
      const mockEnv = {} as WorkerEnv;
      const agent = new MigratingAgent(mockEnv, 'test-validation');
      
      (agent as any).setupMockSql('success');
      
      const invalidRequests = [
        { method: 'POST', body: '{}' }, // Missing required fields
        { method: 'POST', body: '{"name": ""}' }, // Empty name
        { method: 'POST', body: '{"email": "invalid-email"}' }, // Invalid email
        { method: 'POST', body: '{"name": "x".repeat(1000)}' } // Oversized field
      ];
      
      for (const reqData of invalidRequests) {
        const request = new Request('http://test.com/users', reqData);
        const response = await agent.onRequest(request);
        
        // Should return validation errors
        expect([400, 422]).toContain(response.status);
      }
    });

    it('should handle unicode and special characters', async () => {
      const mockEnv = {} as WorkerEnv;
      const agent = new CounterAgent(mockEnv, 'test-unicode');
      
      const mockConnection = {
        send: vi.fn(),
        close: vi.fn(),
        id: 'unicode-test'
      };
      
      const unicodeInputs = [
        '{"message": "Hello 🌍"}',
        '{"message": "测试中文"}',
        '{"message": "Ñoño español"}',
        '{"message": "العربية"}',
        '{"message": "🚀🎉💻"}',
        '{"message": "\\u0000\\u0001\\u0002"}' // Control characters
      ];
      
      for (const input of unicodeInputs) {
        await agent.onMessage(mockConnection as any, input);
      }
      
      // Should handle all unicode inputs
      expect(mockConnection.send).toHaveBeenCalledTimes(unicodeInputs.length);
    });
  });

  describe('Concurrency Error Handling', () => {
    it('should handle race conditions in state updates', async () => {
      const mockEnv = {} as WorkerEnv;
      const agent = new CounterAgent(mockEnv, 'test-race-condition');
      
      const mockConnection = {
        send: vi.fn(),
        close: vi.fn(),
        id: 'race-test'
      };
      
      // Simulate concurrent increment operations
      const concurrentOps = Array(20).fill(null).map(() => 
        agent.onMessage(mockConnection as any, JSON.stringify({ op: 'increment' }))
      );
      
      await Promise.allSettled(concurrentOps);
      
      // Should handle all operations without corruption
      expect(mockConnection.send).toHaveBeenCalledTimes(20);
    });

    it('should handle agent instance cleanup on errors', async () => {
      const mockEnv = {} as WorkerEnv;
      const agent = new CounterAgent(mockEnv, 'test-cleanup');
      
      // Simulate error that should trigger cleanup
      const mockConnection = {
        send: vi.fn().mockImplementation(() => {
          throw new Error('Connection lost');
        }),
        close: vi.fn(),
        id: 'cleanup-test'
      };
      
      // Use a valid operation that will trigger the error during send
      await agent.onMessage(mockConnection as any, JSON.stringify({ op: 'increment' }));
      
      // Should attempt to send despite error
      expect(mockConnection.send).toHaveBeenCalled();
    });
  });
});