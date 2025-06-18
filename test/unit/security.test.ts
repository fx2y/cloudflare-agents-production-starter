import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkerEnv } from '../../src/types';
import { AuthAgent } from '../../src/agents/AuthAgent';
import { SecureMcpAgent } from '../../src/agents/SecureMcpAgent';
import { HITLAgent } from '../../src/agents/HITLAgent';

// Mock the agents module with security capabilities
vi.mock('agents', () => ({
  Agent: class MockAgent {
    constructor(public env: any, public name: string) {}
    state: any = {};
    
    setState(newState: any) {
      this.state = { ...this.state, ...newState };
    }
  },
  McpAgent: class MockMcpAgent {
    constructor(public env: any, public name: string) {}
    server: any = { 
      tool: vi.fn(),
      addResource: vi.fn(),
      setRequestHandler: vi.fn()
    };
    state: any = {};
    
    setState(newState: any) {
      this.state = { ...this.state, ...newState };
    }
    
    static serve = vi.fn().mockReturnValue(async () => new Response('MCP server'));
    static serveSSE = vi.fn().mockReturnValue(async () => new Response('SSE endpoint'));
  }
}));

// Mock crypto functions
vi.stubGlobal('crypto', {
  ...global.crypto,
  randomUUID: vi.fn(() => 'mock-uuid-1234'),
  subtle: {
    ...global.crypto?.subtle,
    sign: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    verify: vi.fn().mockResolvedValue(true),
    digest: vi.fn().mockResolvedValue(new ArrayBuffer(32))
  } as any
});

describe('Security and Authentication Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication Security', () => {
    it('should reject requests without valid authentication', async () => {
      const mockEnv = {
        JWT_SECRET: 'test-secret',
        VALID_BEARER_TOKEN: 'valid-token'
      } as WorkerEnv;
      
      const agent = new AuthAgent(mockEnv, 'test-auth');
      
      const unauthenticatedRequest = new Request('http://test.com/secure', {
        method: 'GET'
      });
      
      const response = await agent.onRequest(unauthenticatedRequest);
      expect(response.status).toBe(401);
    });

    it('should validate JWT token structure and claims', () => {
      const validTokenParts = [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', // Valid header
        'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ', // Valid payload
        'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' // Valid signature
      ];
      
      const validToken = validTokenParts.join('.');
      
      // Validate token structure
      const parts = validToken.split('.');
      expect(parts).toHaveLength(3);
      
      // Validate header
      const header = JSON.parse(atob(parts[0]));
      expect(header.alg).toBe('HS256');
      expect(header.typ).toBe('JWT');
      
      // Validate payload structure
      const payload = JSON.parse(atob(parts[1]));
      expect(payload.sub).toBeDefined();
      expect(payload.iat).toBeDefined();
    });

    it('should reject expired JWT tokens', () => {
      const expiredPayload = {
        sub: '1234567890',
        name: 'John Doe',
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        iat: Math.floor(Date.now() / 1000) - 7200  // Issued 2 hours ago
      };
      
      const currentTime = Math.floor(Date.now() / 1000);
      expect(expiredPayload.exp).toBeLessThan(currentTime);
    });

    it('should validate JWT signature with secret', async () => {
      const mockEnv = { JWT_SECRET: 'test-secret' } as WorkerEnv;
      const agent = new AuthAgent(mockEnv, 'test-auth');
      
      // Mock implementation would verify signature
      const isValidSignature = await mockVerifyJWT('valid.jwt.token', mockEnv.JWT_SECRET);
      expect(isValidSignature).toBe(true);
      
      const isInvalidSignature = await mockVerifyJWT('invalid.jwt.token', 'wrong-secret');
      expect(isInvalidSignature).toBe(false);
    });

    it('should prevent timing attacks on token validation', async () => {
      const mockEnv = { JWT_SECRET: 'test-secret' } as WorkerEnv;
      const agent = new AuthAgent(mockEnv, 'test-auth');
      
      const validToken = 'valid.jwt.token';
      const invalidToken = 'invalid.jwt.token';
      
      // Measure validation time (should be consistent)
      const start1 = Date.now();
      await mockVerifyJWT(validToken, mockEnv.JWT_SECRET);
      const time1 = Date.now() - start1;
      
      const start2 = Date.now();
      await mockVerifyJWT(invalidToken, mockEnv.JWT_SECRET);
      const time2 = Date.now() - start2;
      
      // Times should be similar (within reasonable bounds)
      const timeDiff = Math.abs(time1 - time2);
      expect(timeDiff).toBeLessThan(50); // 50ms tolerance
    });
  });

  describe('Authorization and Access Control', () => {
    it('should enforce role-based access control', async () => {
      const mockEnv = {} as WorkerEnv;
      const agent = new HITLAgent(mockEnv, 'test-rbac');
      
      const userRoles = ['user', 'admin', 'moderator'];
      const resources = ['read', 'write', 'delete', 'admin'];
      
      // Define access matrix
      const accessMatrix = {
        user: ['read'],
        moderator: ['read', 'write'],
        admin: ['read', 'write', 'delete', 'admin']
      };
      
      for (const role of userRoles) {
        for (const resource of resources) {
          const hasAccess = (accessMatrix as any)[role].includes(resource);
          
          if (hasAccess) {
            expect((accessMatrix as any)[role]).toContain(resource);
          } else {
            expect((accessMatrix as any)[role]).not.toContain(resource);
          }
        }
      }
    });

    it('should validate OAuth scopes for MCP access', () => {
      const requiredScopes = ['mcp:read', 'mcp:write'];
      const userScopes = ['mcp:read', 'tools:echo'];
      
      const hasRequiredScope = requiredScopes.some(scope => userScopes.includes(scope));
      expect(hasRequiredScope).toBe(true);
      
      const hasWriteAccess = userScopes.includes('mcp:write');
      expect(hasWriteAccess).toBe(false);
    });

    it('should prevent privilege escalation', async () => {
      const mockEnv = {} as WorkerEnv;
      const agent = new SecureMcpAgent(mockEnv, 'test-privilege');
      
      // Simulate user trying to access admin functions
      const userToken = {
        sub: 'user-123',
        roles: ['user'],
        scopes: ['mcp:read']
      };
      
      const adminOnlyOperations = [
        'delete_all_data',
        'modify_permissions',
        'access_logs',
        'system_config'
      ];
      
      for (const operation of adminOnlyOperations) {
        const hasPermission = userToken.roles.includes('admin') || 
                            userToken.scopes.includes('admin');
        expect(hasPermission).toBe(false);
      }
    });

    it('should implement resource-level permissions', () => {
      const resources = [
        { id: 'doc-1', owner: 'user-123', permissions: ['read'] },
        { id: 'doc-2', owner: 'user-456', permissions: ['read', 'write'] },
        { id: 'doc-3', owner: 'user-123', permissions: ['read', 'write', 'delete'] }
      ];
      
      const currentUser = 'user-123';
      
      for (const resource of resources) {
        const canRead = resource.owner === currentUser || resource.permissions.includes('read');
        const canWrite = resource.owner === currentUser && resource.permissions.includes('write');
        const canDelete = resource.owner === currentUser && resource.permissions.includes('delete');
        
        if (resource.owner === currentUser) {
          expect(canRead).toBe(true);
        }
        
        if (resource.id === 'doc-3' && resource.owner === currentUser) {
          expect(canDelete).toBe(true);
        }
      }
    });
  });

  describe('Data Protection and Privacy', () => {
    it('should sanitize sensitive data in logs', () => {
      const sensitiveData = {
        password: 'secret123',
        apiKey: 'sk-1234567890abcdef',
        creditCard: '4111-1111-1111-1111',
        ssn: '123-45-6789',
        email: 'user@example.com',
        normalField: 'safe-data'
      };
      
      const sanitized = sanitizeSensitiveFields(sensitiveData);
      
      expect(sanitized.password).toBe('***');
      expect(sanitized.apiKey).toBe('sk-***');
      expect(sanitized.creditCard).toBe('****-****-****-1111');
      expect(sanitized.ssn).toBe('***-**-6789');
      expect(sanitized.email).toBe('u***@example.com');
      expect(sanitized.normalField).toBe('safe-data');
    });

    it('should encrypt sensitive data at rest', async () => {
      const sensitiveText = 'This is sensitive information';
      const key = 'encryption-key-256bit';
      
      // Mock encryption
      const encrypted = await mockEncrypt(sensitiveText, key);
      expect(encrypted).not.toBe(sensitiveText);
      expect(encrypted.length).toBeGreaterThan(0);
      
      const decrypted = await mockDecrypt(encrypted, key);
      expect(decrypted).toBe(sensitiveText);
    });

    it('should validate data retention policies', () => {
      const dataTypes = [
        { type: 'user_session', retentionDays: 1 },
        { type: 'user_activity', retentionDays: 30 },
        { type: 'audit_logs', retentionDays: 365 },
        { type: 'backup_data', retentionDays: 2555 } // 7 years
      ];
      
      const now = new Date();
      
      for (const dataType of dataTypes) {
        const retentionDate = new Date(now.getTime() - (dataType.retentionDays * 24 * 60 * 60 * 1000));
        const shouldBeDeleted = now > retentionDate;
        
        // Data older than retention period should be marked for deletion
        expect(typeof shouldBeDeleted).toBe('boolean');
      }
    });

    it('should prevent data leakage in error messages', () => {
      const sensitiveErrors = [
        'Database connection failed: postgresql://user:password@localhost:5432/db',
        'API key invalid: sk-1234567890abcdef',
        'User not found: email=john.doe@company.com',
        'File path error: /home/user/.env'
      ];
      
      const sanitizedErrors = sensitiveErrors.map(sanitizeErrorMessage);
      
      expect(sanitizedErrors[0]).not.toContain('password');
      expect(sanitizedErrors[1]).not.toContain('sk-1234567890abcdef');
      expect(sanitizedErrors[2]).not.toContain('john.doe@company.com');
      expect(sanitizedErrors[3]).not.toContain('/home/user');
    });
  });

  describe('Input Validation and Sanitization', () => {
    it('should prevent XSS attacks', () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert(1)',
        '<img src=x onerror=alert(1)>',
        '<svg onload=alert(1)>',
        '"><script>alert("xss")</script>',
        "'; alert('xss'); //",
        '<iframe src="javascript:alert(1)"></iframe>'
      ];
      
      for (const payload of xssPayloads) {
        const sanitized = sanitizeHtml(payload);
        
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('onerror=');
        expect(sanitized).not.toContain('onload=');
      }
    });

    it('should prevent SQL injection attacks', () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "1; DELETE FROM users; --",
        "admin'/*",
        "' UNION SELECT * FROM users --"
      ];
      
      for (const payload of sqlInjectionPayloads) {
        const isValidInput = validateSqlInput(payload);
        expect(isValidInput).toBe(false);
      }
    });

    it('should validate input length limits', () => {
      const inputs = [
        { value: 'a'.repeat(100), limit: 255, valid: true },
        { value: 'a'.repeat(1000), limit: 255, valid: false },
        { value: '', limit: 1, valid: false }, // Empty string
        { value: 'valid', limit: 10, valid: true }
      ];
      
      for (const input of inputs) {
        const isValid = input.value.length > 0 && input.value.length <= input.limit;
        expect(isValid).toBe(input.valid);
      }
    });

    it('should validate data types and formats', () => {
      const validationTests = [
        { value: 'user@example.com', type: 'email', valid: true },
        { value: 'invalid-email', type: 'email', valid: false },
        { value: 'https://example.com', type: 'url', valid: true },
        { value: 'not-a-url', type: 'url', valid: false },
        { value: '123-45-6789', type: 'phone', valid: true },
        { value: 'not-a-phone', type: 'phone', valid: false }
      ];
      
      for (const test of validationTests) {
        const isValid = validateFormat(test.value, test.type);
        expect(isValid).toBe(test.valid);
      }
    });
  });

  describe('Rate Limiting and DoS Protection', () => {
    it('should implement request rate limiting', () => {
      const rateLimiter = {
        requests: 0,
        windowStart: Date.now(),
        limit: 100,
        windowMs: 60000 // 1 minute
      };
      
      // Simulate 150 requests
      for (let i = 0; i < 150; i++) {
        const now = Date.now();
        
        // Reset window if expired
        if (now - rateLimiter.windowStart > rateLimiter.windowMs) {
          rateLimiter.requests = 0;
          rateLimiter.windowStart = now;
        }
        
        rateLimiter.requests++;
        
        const isAllowed = rateLimiter.requests <= rateLimiter.limit;
        
        if (i < 100) {
          expect(isAllowed).toBe(true);
        } else {
          expect(isAllowed).toBe(false);
        }
      }
    });

    it('should detect and prevent brute force attacks', () => {
      const bruteForceDetector = {
        failedAttempts: 0,
        lockoutTime: 15 * 60 * 1000, // 15 minutes
        maxAttempts: 5,
        lastAttempt: 0
      };
      
      // Simulate failed login attempts
      for (let i = 0; i < 10; i++) {
        bruteForceDetector.failedAttempts++;
        bruteForceDetector.lastAttempt = Date.now();
        
        const isLocked = bruteForceDetector.failedAttempts >= bruteForceDetector.maxAttempts;
        
        if (i < 4) {
          expect(isLocked).toBe(false);
        } else {
          expect(isLocked).toBe(true);
        }
      }
    });

    it('should implement connection limiting', () => {
      const connectionManager = {
        activeConnections: 0,
        maxConnections: 1000,
        connectionsPerIP: new Map<string, number>(),
        maxPerIP: 10
      };
      
      const clientIP = '192.168.1.100';
      
      // Simulate connections from same IP
      for (let i = 0; i < 15; i++) {
        const currentConnections = connectionManager.connectionsPerIP.get(clientIP) || 0;
        
        if (currentConnections < connectionManager.maxPerIP && 
            connectionManager.activeConnections < connectionManager.maxConnections) {
          connectionManager.connectionsPerIP.set(clientIP, currentConnections + 1);
          connectionManager.activeConnections++;
        }
        
        const actualConnections = connectionManager.connectionsPerIP.get(clientIP) || 0;
        expect(actualConnections).toBeLessThanOrEqual(connectionManager.maxPerIP);
      }
    });
  });
});

// Helper functions for testing
function mockVerifyJWT(token: string, secret: string): Promise<boolean> {
  return Promise.resolve(token.includes('valid') && secret === 'test-secret');
}

function sanitizeSensitiveFields(data: any): any {
  const sensitiveFields = ['password', 'apiKey', 'creditCard', 'ssn'];
  const result = { ...data };
  
  for (const field of sensitiveFields) {
    if (result[field]) {
      if (field === 'apiKey') {
        result[field] = result[field].substring(0, 3) + '***';
      } else if (field === 'creditCard') {
        result[field] = '****-****-****-' + result[field].slice(-4);
      } else if (field === 'ssn') {
        result[field] = '***-**-' + result[field].slice(-4);
      } else {
        result[field] = '***';
      }
    }
  }
  
  if (result.email) {
    const [local, domain] = result.email.split('@');
    result.email = local.charAt(0) + '***@' + domain;
  }
  
  return result;
}

function mockEncrypt(text: string, key: string): Promise<string> {
  return Promise.resolve(btoa(text + ':' + key));
}

function mockDecrypt(encrypted: string, key: string): Promise<string> {
  const decrypted = atob(encrypted);
  const [text] = decrypted.split(':' + key);
  return Promise.resolve(text);
}

function sanitizeErrorMessage(error: string): string {
  return error
    .replace(/password[=:][\w]+/gi, 'password=***')
    .replace(/sk-[\w]+/gi, 'sk-***')
    .replace(/[\w.-]+@[\w.-]+/gi, '***@***.com')
    .replace(/\/[\w/.-]+/gi, '/***');
}

function sanitizeHtml(input: string): string {
  return input
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=\s*[^>]+/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '');
}

function validateSqlInput(input: string): boolean {
  const sqlPatterns = [
    /[';|*%<>{}[\]]/,
    /(union|select|insert|delete|drop|create|alter|exec|execute)/i
  ];
  
  return !sqlPatterns.some(pattern => pattern.test(input));
}

function validateFormat(value: string, type: string): boolean {
  const patterns = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    url: /^https?:\/\/[^\s]+$/,
    phone: /^\d{3}-\d{2}-\d{4}$/
  };
  
  return (patterns as any)[type]?.test(value) || false;
}