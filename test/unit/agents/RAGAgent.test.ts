import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RAGAgent } from '../../../src/agents/RAGAgent';
import { createMockAgent } from '../../test-utils';

// Mock StructuredLogger
vi.mock('../../../src/utils/StructuredLogger', () => ({
  StructuredLogger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    logAiServiceCall: vi.fn()
  }))
}));

describe('RAGAgent', () => {
  let agent: RAGAgent;
  let mockEnv: any;

  beforeEach(() => {
    mockEnv = {
      AI: {
        run: vi.fn()
      },
      VECTOR_DB: {
        insert: vi.fn(),
        query: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn()
      }
    };
    
    agent = createMockAgent(RAGAgent, mockEnv);
    agent.state = { documentCount: 0 };
    
    // Mock SQL responses
    agent.sql = vi.fn((strings, ...values) => {
      const query = strings.join('?').toLowerCase();
      
      if (query.includes('select value from _meta')) {
        return [{ value: 1 }];
      }
      if (query.includes('select count(*) as count')) {
        return [{ count: 5 }];
      }
      if (query.includes('insert into documents')) {
        return [{ id: 123 }];
      }
      if (query.includes('select id from documents')) {
        return [{ id: 123 }];
      }
      if (query.includes('select id, content from documents')) {
        return [{ id: 123, content: 'test document content' }];
      }
      return [];
    });
  });

  describe('onStart', () => {
    it('should initialize database schema', async () => {
      await agent.onStart();

      expect(agent.sql).toHaveBeenCalledWith(
        expect.arrayContaining(['CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value INTEGER)'])
      );
    });

    it('should set document count from database', async () => {
      await agent.onStart();

      expect(agent.setState).toHaveBeenCalledWith({ documentCount: 5 });
    });
  });

  describe('ingestDocument', () => {
    beforeEach(() => {
      mockEnv.AI.run.mockResolvedValue({
        data: [[0.1, 0.2, 0.3, 0.4, 0.5]] // Mock embedding vector
      });
      mockEnv.VECTOR_DB.insert.mockResolvedValue({ success: true });
    });

    it('should successfully ingest a document', async () => {
      const content = 'This is a test document';
      
      const result = await agent.ingestDocument(content);

      expect(result).toBe(123);
      expect(agent.sql).toHaveBeenCalledWith(
        expect.arrayContaining(['INSERT INTO documents (content) VALUES (', ') RETURNING id']),
        content
      );
      expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', {
        text: [content]
      });
      expect(mockEnv.VECTOR_DB.insert).toHaveBeenCalledWith([{
        id: '123',
        values: [0.1, 0.2, 0.3, 0.4, 0.5],
        metadata: { documentId: '123' }
      }]);
      expect(agent.setState).toHaveBeenCalledWith({ documentCount: 1 });
    });

    it('should handle AI embedding errors', async () => {
      const content = 'Test document';
      mockEnv.AI.run.mockRejectedValue(new Error('AI service error'));

      await expect(agent.ingestDocument(content)).rejects.toThrow('Failed to create vector embedding');
      
      // Should cleanup the document from SQL on error
      expect(agent.sql).toHaveBeenCalledWith(
        expect.arrayContaining(['DELETE FROM documents WHERE id = ', '']),
        123
      );
    });

    it('should handle vector database errors', async () => {
      const content = 'Test document';
      mockEnv.VECTOR_DB.insert.mockRejectedValue(new Error('Vector DB error'));

      await expect(agent.ingestDocument(content)).rejects.toThrow('Failed to create vector embedding');
    });
  });

  describe('queryKnowledge', () => {
    beforeEach(() => {
      mockEnv.AI.run.mockResolvedValue({
        data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
      });
      mockEnv.VECTOR_DB.query.mockResolvedValue({
        matches: [
          { metadata: { documentId: '123' }, score: 0.95 }
        ]
      });
    });

    it('should successfully query knowledge base', async () => {
      const query = 'test query';
      
      const result = await agent.queryKnowledge(query);

      expect(result).toEqual({
        context: 'test document content',
        sources: [{ id: 123 }]
      });
      
      expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', {
        text: [query]
      });
      expect(mockEnv.VECTOR_DB.query).toHaveBeenCalledWith([0.1, 0.2, 0.3, 0.4, 0.5], {
        topK: 5,
        returnMetadata: true
      });
    });

    it('should handle no matches found', async () => {
      mockEnv.VECTOR_DB.query.mockResolvedValue({ matches: [] });
      
      const result = await agent.queryKnowledge('no match query');

      expect(result).toEqual({
        context: '',
        sources: []
      });
    });

    it('should handle stale vector references', async () => {
      mockEnv.VECTOR_DB.query.mockResolvedValue({
        matches: [
          { metadata: { documentId: '999' }, score: 0.95 } // Non-existent document
        ]
      });
      
      // Mock schedule method
      agent.schedule = vi.fn();
      
      const result = await agent.queryKnowledge('test query');

      expect(result).toEqual({
        context: '',
        sources: []
      });
      expect(agent.schedule).toHaveBeenCalledWith(1, 'cleanupVectors', { ids: ['999'] });
    });

    it('should handle AI service errors in query', async () => {
      mockEnv.AI.run.mockRejectedValue(new Error('AI service error'));

      await expect(agent.queryKnowledge('test query')).rejects.toThrow('Failed to query knowledge base');
    });
  });

  describe('updateDocument', () => {
    beforeEach(() => {
      mockEnv.AI.run.mockResolvedValue({
        data: [[0.2, 0.3, 0.4, 0.5, 0.6]]
      });
      mockEnv.VECTOR_DB.upsert.mockResolvedValue({ success: true });
    });

    it('should successfully update existing document', async () => {
      const newContent = 'Updated document content';
      
      const result = await agent.updateDocument(123, newContent);

      expect(result).toBe(true);
      expect(agent.sql).toHaveBeenCalledWith(
        expect.arrayContaining(['UPDATE documents SET content = ', ' WHERE id = ', '']),
        newContent, 123
      );
      expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', {
        text: [newContent]
      });
      expect(mockEnv.VECTOR_DB.upsert).toHaveBeenCalledWith([{
        id: '123',
        values: [0.2, 0.3, 0.4, 0.5, 0.6],
        metadata: { documentId: '123' }
      }]);
    });

    it('should return false for non-existent document', async () => {
      // Mock no document found
      agent.sql = vi.fn().mockReturnValue([]);
      
      const result = await agent.updateDocument(999, 'New content');

      expect(result).toBe(false);
    });

    it('should handle update errors', async () => {
      mockEnv.AI.run.mockRejectedValue(new Error('AI service error'));

      const result = await agent.updateDocument(123, 'New content');

      expect(result).toBe(false);
    });
  });

  describe('HTTP endpoints', () => {
    it('should handle ingest POST request', async () => {
      const requestBody = { content: 'Test document for ingestion' };
      const request = new Request('http://example.com/rag-agent/test/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      // Mock successful ingestion
      agent.ingestDocument = vi.fn().mockResolvedValue(123);

      const response = await agent.onRequest(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true, documentId: 123 });
      expect(agent.ingestDocument).toHaveBeenCalledWith('Test document for ingestion');
    });

    it('should handle invalid content in ingest request', async () => {
      const request = new Request('http://example.com/rag-agent/test/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '' })
      });

      const response = await agent.onRequest(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Invalid content' });
    });

    it('should handle query POST request', async () => {
      const requestBody = { query: 'search query' };
      const request = new Request('http://example.com/rag-agent/test/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      // Mock successful query
      agent.queryKnowledge = vi.fn().mockResolvedValue({
        context: 'relevant content',
        sources: [{ id: 123 }]
      });

      const response = await agent.onRequest(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        context: 'relevant content',
        sources: [{ id: 123 }]
      });
    });

    it('should return 405 for unsupported methods', async () => {
      const request = new Request('http://example.com/rag-agent/test/ingest', {
        method: 'GET'
      });

      const response = await agent.onRequest(request);
      const data = await response.json();

      expect(response.status).toBe(405);
      expect(data).toEqual({ error: 'Method not allowed' });
    });

    it('should handle unknown actions', async () => {
      const request = new Request('http://example.com/rag-agent/test/unknown', {
        method: 'POST'
      });

      const response = await agent.onRequest(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Unknown action' });
    });
  });
});