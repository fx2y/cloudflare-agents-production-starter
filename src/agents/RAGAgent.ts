import { Agent, getAgentByName } from 'agents';
import type { WorkerEnv } from '../types';
import { StructuredLogger } from '../utils/StructuredLogger';

interface RAGState {
  documentCount: number;
}

export class RAGAgent extends Agent<WorkerEnv, RAGState> {
  private logger: StructuredLogger;

  constructor(state: DurableObjectState, env: WorkerEnv) {
    super(state, env);
    this.setState({ documentCount: 0 });
    this.logger = new StructuredLogger('RAGAgent', this.name);
  }

  async onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value INTEGER)`;
    const result = this.sql`SELECT value FROM _meta WHERE key = 'version'`;
    const version = result.length > 0 ? Number(result[0].value) : 0;
    
    if (version < 1) {
      this.sql`CREATE TABLE documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`;
      this.sql`INSERT INTO _meta (key, value) VALUES ('version', 1)`;
    }

    const countResult = this.sql`SELECT COUNT(*) as count FROM documents`;
    const count = countResult.length > 0 ? Number(countResult[0].count) : 0;
    this.setState({ documentCount: count });
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const action = pathSegments[pathSegments.length - 1];

    try {
      switch (action) {
        case 'ingest':
          if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
              status: 405, 
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return await this.handleIngest(request);
        
        case 'query':
          if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
              status: 405, 
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return await this.handleQuery(request);

        case 'update':
          if (request.method !== 'PUT') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
              status: 405, 
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return await this.handleUpdate(request);

        case 'delete':
          if (request.method !== 'DELETE') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
              status: 405, 
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return await this.handleDelete(request);
        
        default:
          return new Response(JSON.stringify({ error: 'Unknown action' }), { 
            status: 404, 
            headers: { 'Content-Type': 'application/json' }
          });
      }
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Internal server error' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleIngest(request: Request): Promise<Response> {
    try {
      const body = await request.json() as { content: string };
      
      if (!body.content || typeof body.content !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid content' }), { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const documentId = await this.ingestDocument(body.content);
      
      return new Response(JSON.stringify({ 
        status: 'ok', 
        documentId 
      }), { 
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to ingest document' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleQuery(request: Request): Promise<Response> {
    try {
      const body = await request.json() as { query: string };
      
      if (!body.query || typeof body.query !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid query' }), { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const result = await this.queryKnowledge(body.query);
      
      return new Response(JSON.stringify(result), { 
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to query knowledge' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleUpdate(request: Request): Promise<Response> {
    try {
      const body = await request.json() as { documentId: number; content: string };
      
      if (!body.documentId || typeof body.documentId !== 'number' || !body.content || typeof body.content !== 'string') {
        return new Response(JSON.stringify({ error: 'Request body must contain documentId (number) and content (string)' }), { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const success = await this.updateDocument(body.documentId, body.content);
      
      if (!success) {
        return new Response(JSON.stringify({ error: 'Document not found' }), { 
          status: 404, 
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ 
        status: 'ok', 
        documentId: body.documentId 
      }), { 
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to update document' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleDelete(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const documentIdParam = url.searchParams.get('documentId');
      
      if (!documentIdParam) {
        return new Response(JSON.stringify({ error: 'documentId query parameter is required' }), { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const documentId = parseInt(documentIdParam, 10);
      if (isNaN(documentId)) {
        return new Response(JSON.stringify({ error: 'documentId must be a valid number' }), { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const success = await this.deleteDocument(documentId);
      
      if (!success) {
        return new Response(JSON.stringify({ error: 'Document not found' }), { 
          status: 404, 
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ 
        status: 'ok', 
        documentId 
      }), { 
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to delete document' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async ingestDocument(content: string): Promise<number> {
    const [{ id }] = this.sql`
      INSERT INTO documents (content) 
      VALUES (${content}) 
      RETURNING id
    `;

    try {
      const startTime = Date.now();
      const aiResult = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', { 
        text: [content] 
      });
      const vector = (aiResult as any).data?.[0] || [];
      const aiLatency = Date.now() - startTime;

      this.logger.logAiServiceCall({
        service: 'workers-ai',
        model: '@cf/baai/bge-base-en-v1.5',
        operation: 'embedding',
        latencyMs: aiLatency,
        tokenCount: content.split(' ').length,
        estimatedCost: StructuredLogger.estimateWorkerAiCost('@cf/baai/bge-base-en-v1.5', content.split(' ').length),
        success: true
      });

      const vectorStartTime = Date.now();
      const documentId = Number(id);
      await this.env.VECTOR_DB.insert([{
        id: documentId.toString(),
        values: vector,
        metadata: { documentId: documentId.toString() }
      }]);
      const vectorLatency = Date.now() - vectorStartTime;

      this.logger.logAiServiceCall({
        service: 'vectorize',
        operation: 'insert',
        latencyMs: vectorLatency,
        estimatedCost: StructuredLogger.estimateVectorizeCost('insert', 1),
        success: true
      });

      const newCount = this.state.documentCount + 1;
      this.setState({ documentCount: newCount });

      return Number(id);
    } catch (error) {
      this.logger.error('rag.ingest.failed', 'Failed to create vector embedding', { 
        documentId: id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      this.sql`DELETE FROM documents WHERE id = ${id}`;
      throw new Error('Failed to create vector embedding');
    }
  }

  async queryKnowledge(userQuery: string): Promise<{ context: string; sources: Array<{ id: number }> }> {
    try {
      const startTime = Date.now();
      const aiResult = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', { 
        text: [userQuery] 
      });
      const queryVector = (aiResult as any).data?.[0] || [];
      const aiLatency = Date.now() - startTime;

      this.logger.logAiServiceCall({
        service: 'workers-ai',
        model: '@cf/baai/bge-base-en-v1.5',
        operation: 'embedding',
        latencyMs: aiLatency,
        tokenCount: userQuery.split(' ').length,
        estimatedCost: StructuredLogger.estimateWorkerAiCost('@cf/baai/bge-base-en-v1.5', userQuery.split(' ').length),
        success: true
      });

      const vectorStartTime = Date.now();
      const vectorMatches = await this.env.VECTOR_DB.query(queryVector, { 
        topK: 5, 
        returnMetadata: true 
      });
      const vectorLatency = Date.now() - vectorStartTime;

      this.logger.logAiServiceCall({
        service: 'vectorize',
        operation: 'query',
        latencyMs: vectorLatency,
        estimatedCost: StructuredLogger.estimateVectorizeCost('query', 1),
        success: true
      });

      const ids = vectorMatches.matches
        .map(match => match.metadata?.documentId)
        .filter((id): id is string => Boolean(id));
      
      if (ids.length === 0) {
        this.logger.info('rag.query.no_matches', 'No vector matches found for query');
        return { context: '', sources: [] };
      }

      const results = this.sql`
        SELECT id, content 
        FROM documents 
        WHERE id IN (${ids.join(',')})
      `;

      const foundIds = new Set(results.map(r => r.id));
      const staleIds = ids.filter(id => !foundIds.has(id));

      if (staleIds.length > 0) {
        this.logger.info('rag.cleanup.scheduled', 'Scheduled cleanup of stale vector IDs', { staleIds });
        this.schedule(1, 'cleanupVectors', { ids: staleIds.map(String) });
      }

      const context = results.map(r => r.content).join('\n\n');
      const sources = results.map(r => ({ id: Number(r.id) }));

      this.logger.info('rag.query.completed', 'Query completed successfully', { 
        matchCount: vectorMatches.matches.length,
        foundDocuments: results.length,
        staleCount: staleIds.length
      });

      return { context, sources };
    } catch (error) {
      this.logger.error('rag.query.failed', 'Failed to query knowledge base', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw new Error('Failed to query knowledge base');
    }
  }

  async updateDocument(documentId: number, newContent: string): Promise<boolean> {
    const existingDoc = this.sql`SELECT id FROM documents WHERE id = ${documentId}`;
    
    if (existingDoc.length === 0) {
      return false;
    }

    try {
      this.sql`UPDATE documents SET content = ${newContent} WHERE id = ${documentId}`;

      const aiResult = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', { 
        text: [newContent] 
      });
      const vector = (aiResult as any).data?.[0] || [];

      await this.env.VECTOR_DB.upsert([{
        id: documentId.toString(),
        values: vector,
        metadata: { documentId }
      }]);

      return true;
    } catch (error) {
      console.error('Failed to update document:', error);
      throw new Error('Failed to update document and vector');
    }
  }

  async deleteDocument(documentId: number): Promise<boolean> {
    const existingDoc = this.sql`SELECT id FROM documents WHERE id = ${documentId}`;
    
    if (existingDoc.length === 0) {
      return false;
    }

    try {
      this.sql`DELETE FROM documents WHERE id = ${documentId}`;

      await this.env.VECTOR_DB.deleteByIds([documentId.toString()]);

      const newCount = Math.max(0, this.state.documentCount - 1);
      this.setState({ documentCount: newCount });

      return true;
    } catch (error) {
      console.error('Failed to delete document:', error);
      throw new Error('Failed to delete document and vector');
    }
  }

  async cleanupVectors(data: { ids: string[] }) {
    try {
      await this.env.VECTOR_DB.deleteByIds(data.ids);
      console.log(`Cleaned up stale vector IDs: ${data.ids.join(', ')}`);
    } catch (error) {
      console.error('Failed to cleanup vectors:', error);
    }
  }
}