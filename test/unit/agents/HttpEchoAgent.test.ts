import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpEchoAgent } from '../../../src/agents/HttpEchoAgent';
import { createMockAgent } from '../../test-utils';

describe('HttpEchoAgent', () => {
  let agent: HttpEchoAgent;
  let mockEnv: any;

  beforeEach(() => {
    mockEnv = {
      ENVIRONMENT: 'test'
    };
    
    agent = createMockAgent(HttpEchoAgent, mockEnv);
  });

  describe('onRequest - GET', () => {
    it('should return message and path for GET requests', async () => {
      const request = new Request('http://example.com/test-path', { method: 'GET' });

      const response = await agent.onRequest(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        message: 'Hello from HttpEchoAgent!',
        path: '/test-path'
      });
    });

    it('should handle GET with query parameters', async () => {
      const request = new Request('http://example.com/test-path?foo=bar', { method: 'GET' });

      const response = await agent.onRequest(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        message: 'Hello from HttpEchoAgent!',
        path: '/test-path?foo=bar'
      });
    });
  });

  describe('onRequest - POST', () => {
    it('should echo JSON body for POST requests', async () => {
      const requestBody = { message: 'Hello world', data: { test: true } };
      const request = new Request('http://example.com/test-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const response = await agent.onRequest(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        message: 'Echo response',
        path: '/test-path',
        echo: requestBody
      });
    });

    it('should handle non-JSON POST body', async () => {
      const request = new Request('http://example.com/test-path', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'plain text body'
      });

      const response = await agent.onRequest(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        message: 'Echo response',
        path: '/test-path',
        echo: { raw: 'plain text body' }
      });
    });

    it('should handle empty POST body', async () => {
      const request = new Request('http://example.com/test-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await agent.onRequest(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        message: 'Echo response',
        path: '/test-path',
        echo: { raw: '' }
      });
    });

    it('should handle malformed JSON gracefully', async () => {
      const request = new Request('http://example.com/test-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{'
      });

      const response = await agent.onRequest(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        message: 'Echo response',
        path: '/test-path',
        echo: { raw: 'invalid json{' }
      });
    });
  });

  describe('onRequest - Other methods', () => {
    it('should return 405 for unsupported methods', async () => {
      const request = new Request('http://example.com/test-path', { method: 'PUT' });

      const response = await agent.onRequest(request);

      expect(response.status).toBe(405);
      expect(await response.text()).toBe('Method not allowed');
    });

    it('should handle DELETE method', async () => {
      const request = new Request('http://example.com/test-path', { method: 'DELETE' });

      const response = await agent.onRequest(request);

      expect(response.status).toBe(405);
      expect(await response.text()).toBe('Method not allowed');
    });

    it('should handle PATCH method', async () => {
      const request = new Request('http://example.com/test-path', { method: 'PATCH' });

      const response = await agent.onRequest(request);

      expect(response.status).toBe(405);
      expect(await response.text()).toBe('Method not allowed');
    });
  });

  describe('Error handling', () => {
    it('should handle request processing errors gracefully', async () => {
      // Mock URL constructor to throw an error
      const originalURL = global.URL;
      global.URL = class extends originalURL {
        constructor(url: string | URL, base?: string | URL) {
          if (url === 'malformed-url') {
            throw new Error('Invalid URL');
          }
          super(url, base);
        }
      };

      try {
        const request = new Request('malformed-url');
        const response = await agent.onRequest(request);

        expect(response.status).toBe(500);
        expect(await response.text()).toBe('Internal server error');
      } finally {
        global.URL = originalURL;
      }
    });
  });
});