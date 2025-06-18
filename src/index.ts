import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
import { jwt } from 'hono/jwt';
import { getAgentByName } from 'agents';
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { AuthAgent } from './agents/AuthAgent';
import { MyAgent } from './agents/MyAgent';
import { SupervisorAgent } from './agents/SupervisorAgent';
import { HistoryAgent } from './agents/HistoryAgent';
import { CounterAgent } from './agents/CounterAgent';
import { MigratingAgent } from './agents/MigratingAgent';
import { EchoAgent } from './agents/EchoAgent';
import { StreamingAgent } from './agents/StreamingAgent';
import { ChattyAgent } from './agents/ChattyAgent';
import { ReminderAgent } from './agents/ReminderAgent';
import { ScheduleManagerAgent } from './agents/ScheduleManagerAgent';
import { OnboardingAgent } from './agents/OnboardingAgent';
import { UserAgentV1 } from './agents/UserAgentV1';
import { UserAgentV2 } from './agents/UserAgentV2';
import { PaymentAgentV1 } from './agents/PaymentAgentV1';
import { RAGAgent } from './agents/RAGAgent';
import { RoutingAgent } from './agents/RoutingAgent';
import { GitHubAgent } from './agents/GitHubAgent';
import { WebBrowserAgent } from './agents/WebBrowserAgent';
import { HITLAgent } from './agents/HITLAgent';
import { StatefulCalculatorAgent } from './agents/StatefulCalculatorAgent';
import { PersistentCounterAgent } from './agents/PersistentCounterAgent';
import { SecureMcpAgent } from './agents/SecureMcpAgent';
import { LoggingAgent } from './agents/LoggingAgent';
import { ChatHistoryAgent } from './agents/ChatHistoryAgent';
import { SecretAgent } from './agents/SecretAgent';
import { WebSocketStreamingAgent } from './agents/WebSocketStreamingAgent';
import { HttpEchoAgent } from './agents/HttpEchoAgent';
import { ResilientChatAgent } from './agents/ResilientChatAgent';
import { handleAuthDefault } from './auth-handler';
export type { WorkerEnv } from './types';
import type { WorkerEnv, BrowserRequestPayload } from './types';

const app = new Hono<{ Bindings: WorkerEnv }>();
const apiV1 = new Hono<{ Bindings: WorkerEnv }>();

// Trace ID middleware for request correlation
app.use('*', async (c, next) => {
  const traceId = c.req.header('x-trace-id') || crypto.randomUUID();
  c.set('traceId', traceId);
  c.header('x-trace-id', traceId);
  await next();
});

// Auth Gateway Middleware - JWT-based
app.use('/api/secure/*', jwt({
  secret: async (c) => c.env.JWT_SECRET,
  alg: 'HS256'
}));

// Fallback for old bearer token auth (backward compatibility)
app.use('/api/secure/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const expectedToken = `Bearer ${c.env.VALID_BEARER_TOKEN}`;
  if (authHeader === expectedToken) {
    await next();
    return;
  }
  return c.text('Unauthorized', 401);
});

async function setupWebSocket<T>(
  env: any,
  agentBinding: any,
  agentId: string,
  agentClass: new (...args: any[]) => T,
  traceId?: string
): Promise<Response> {
  const agent = await getAgentByName(agentBinding, agentId);
  
  // Pass traceId to agent if it supports it
  if (traceId && typeof (agent as any).setTraceId === 'function') {
    (agent as any).setTraceId(traceId);
  }
  
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
      await (agent as any).onMessage(connection as any, event.data as string);
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  server.addEventListener('close', async (event) => {
    try {
      await (agent as any).onClose?.(connection as any, event.code || 1000, event.reason || '', event.wasClean || true);
    } catch (error) {
      console.error('WebSocket close error:', error);
    }
  });
  
  server.addEventListener('error', async (event) => {
    try {
      await (agent as any).onError?.(connection as any, new Error('WebSocket error'));
    } catch (error) {
      console.error('WebSocket error handler error:', error);
    }
  });
  
  try {
    await (agent as any).onConnect?.(connection as any);
  } catch (error) {
    console.error('WebSocket connect error:', error);
  }
  
  return new Response(null, { 
    status: 101, 
    webSocket: client,
    headers: { 'Upgrade': 'websocket' }
  });
}

function createAgentRoute<T>(agentBindingKey: keyof WorkerEnv, agentClass: new (...args: any[]) => T, supportWebSocket = false) {
  return async (c: any) => {
    const agentId = c.req.param('id');
    const traceId = c.get('traceId');
    
    if (supportWebSocket && c.req.header('upgrade') === 'websocket') {
      return setupWebSocket(c.env, c.env[agentBindingKey], agentId, agentClass, traceId);
    }
    
    const agent = await getAgentByName<WorkerEnv, T>(c.env[agentBindingKey], agentId);
    
    // Pass traceId to agent if it supports it
    if (typeof (agent as any).setTraceId === 'function') {
      (agent as any).setTraceId(traceId);
    }
    
    return agent.onRequest(c.req.raw);
  };
}

// WebSocket and HTTP agent routes with unified handlers
app.get('/counter-agent/:id', createAgentRoute('COUNTER_AGENT', CounterAgent, true));
app.get('/agent/counter-agent/:id', createAgentRoute('COUNTER_AGENT', CounterAgent, true));
app.get('/echo-agent/:id', createAgentRoute('ECHO_AGENT', EchoAgent, true));
app.get('/chatty-agent/:id', createAgentRoute('CHATTY_AGENT', ChattyAgent, true));
app.get('/routing-agent/:id', createAgentRoute('ROUTING_AGENT', RoutingAgent, true));

// HITL Agent routes
app.post('/agent/hitl-agent/:id/execute-transaction', createAgentRoute('HITL_AGENT', HITLAgent));
app.get('/agent/hitl-agent/:id', createAgentRoute('HITL_AGENT', HITLAgent, true));

// MCP Agent routes
app.get('/agent/stateful-calculator/:id', createAgentRoute('STATEFUL_CALCULATOR_AGENT', StatefulCalculatorAgent, true));
app.get('/agent/persistent-counter/:id', createAgentRoute('PERSISTENT_COUNTER_AGENT', PersistentCounterAgent, true));

// Core API routes
app.get('/agent/my-agent/:id', async (c) => {
  const agentId = c.req.param('id');
  const agent = await getAgentByName<WorkerEnv, MyAgent>(c.env.MY_AGENT, agentId);
  return agent.onRequest(c.req.raw);
});

app.get('/rpc-hello', async (c) => {
  const agent = await getAgentByName<WorkerEnv, MyAgent>(c.env.MY_AGENT, "my-unique-id");
  const greeting = await agent.sayHello("World");
  return new Response(greeting);
});

app.post('/dispatch-task', async (c) => {
  try {
    const { url: taskUrl } = await c.req.json() as { url: string };
    const supervisor = await getAgentByName<WorkerEnv, SupervisorAgent>(c.env.SUPERVISOR, "global-supervisor");
    return supervisor.doComplexTask(taskUrl);
  } catch (jsonError) {
    return new Response("Invalid JSON payload", { status: 400 });
  }
});

// Versioned API routes
app.get('/v1/user/:id', async (c) => {
  const agent = await getAgentByName<WorkerEnv, UserAgentV1>(c.env.USER_AGENT_V1, c.req.param('id'));
  return c.json(await agent.getProfile());
});

app.post('/v2/user/:id/upgrade', async (c) => {
  const agent = await getAgentByName<WorkerEnv, UserAgentV2>(c.env.USER_AGENT_V2, c.req.param('id'));
  return c.json(await agent.upgradeSubscription());
});

// Protected routes with authentication
app.get('/api/secure/data', (c) => {
  return c.json({ secret: 'The vault is open.' });
});

// Secure WebSocket connection
app.get('/api/secure/ws/connect/:id', async (c) => {
  if (c.req.header('upgrade') === 'websocket') {
    const agentId = c.req.param('id');
    const traceId = c.get('traceId');
    return setupWebSocket(c.env, c.env.AUTH_AGENT, agentId, AuthAgent, traceId);
  }
  return new Response('WebSocket upgrade required', { status: 400 });
});

// State management agents with unified handlers
app.all('/agent/history-agent/:id/*', createAgentRoute('HISTORY_AGENT', HistoryAgent));
app.all('/counter-agent/:id/*', createAgentRoute('COUNTER_AGENT', CounterAgent));
app.all('/agent/counter-agent/:id/*', createAgentRoute('COUNTER_AGENT', CounterAgent));
app.all('/agent/migrating-agent/:id/*', createAgentRoute('MIGRATING_AGENT', MigratingAgent));
app.all('/streaming-agent/:id/*', createAgentRoute('STREAMING_AGENT', StreamingAgent));

// Orchestration agents with unified handlers
app.all('/agent/reminder-agent/:id/*', createAgentRoute('REMINDER_AGENT', ReminderAgent));
app.all('/agent/schedule-manager-agent/:id/*', createAgentRoute('SCHEDULE_MANAGER_AGENT', ScheduleManagerAgent));
app.all('/agent/onboarding-agent/:id/*', createAgentRoute('ONBOARDING_AGENT', OnboardingAgent));

// AI agents with unified handlers
app.all('/agent/rag-agent/:id/*', createAgentRoute('RAG_AGENT', RAGAgent));
app.all('/agent/routing-agent/:id/*', createAgentRoute('ROUTING_AGENT', RoutingAgent));

// Route for counter test
app.post('/agent/counter/:id', createAgentRoute('COUNTER_AGENT', CounterAgent));

// Route for logging test
app.get('/agent/logging/:id', createAgentRoute('LOGGING_AGENT', LoggingAgent));

// Chat History agent routes
app.all('/agent/chat-history-agent/:id/*', createAgentRoute('CHAT_HISTORY_AGENT', ChatHistoryAgent));

// Route for secret agent test
app.get('/secret-agent/:id', createAgentRoute('SECRET_AGENT', SecretAgent));

// WebSocket Streaming agent route
app.get('/agent/websocket-streaming-agent/:id', createAgentRoute('WEBSOCKET_STREAMING_AGENT', WebSocketStreamingAgent, true));

// HTTP Echo agent route
app.all('/agent/http-echo-agent/:id', createAgentRoute('HTTP_ECHO_AGENT', HttpEchoAgent));

// Resilient Chat agent route
app.get('/agent/resilient-chat-agent/:id', createAgentRoute('RESILIENT_CHAT_AGENT', ResilientChatAgent, true));
app.get('/resilient-chat-agent/:id/get-state', createAgentRoute('RESILIENT_CHAT_AGENT', ResilientChatAgent));
// Tool agents
app.post('/tool/github/:owner/:repo', async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  if (!owner || !repo) return c.text('Invalid repo format', 400);
  
  const agent = await getAgentByName<WorkerEnv, GitHubAgent>(c.env.GITHUB_AGENT, 'singleton-gh-tool');
  const repoDetails = await agent.getRepo(`${owner}/${repo}`);
  
  return repoDetails
    ? c.json(repoDetails)
    : c.json({ error: "Repository not found or API call failed." }, 404);
});

app.post('/tool/browser/title', async (c) => {
  const { url } = await c.req.json<BrowserRequestPayload>();
  const agent = await getAgentByName<WorkerEnv, WebBrowserAgent>(c.env.BROWSER_AGENT, `browser-tool-for-${url}`);
  const title = await agent.getPageTitle(url);

  return title
    ? c.json({ title })
    : c.json({ error: "Failed to retrieve page title." }, 500);
});

// Prefixed API routes (v1 namespace)
apiV1.get('/echo-agent/:id', createAgentRoute('ECHO_AGENT', EchoAgent, true));
apiV1.get('/counter-agent/:id', createAgentRoute('COUNTER_AGENT', CounterAgent, true));
apiV1.get('/chatty-agent/:id', createAgentRoute('CHATTY_AGENT', ChattyAgent, true));
app.route('/api/v1', apiV1);

// Static file serving for demo page
app.get('/demo', serveStatic({ path: './demo.html' }));

app.notFound((c) => {
  return new Response("Not Found", { status: 404 });
});

app.onError((err, c) => {
  console.error('Worker error:', err);
  return new Response("Internal Server Error", { status: 500 });
});

// OAuth Provider temporarily disabled for testing
// const oauthProvider = new OAuthProvider({
//   apiHandlers: {
//     '/sse': SecureMcpAgent.serveSSE('/sse'),
//     '/mcp': SecureMcpAgent.serve('/mcp'),
//   },
//   defaultHandler: handleAuthDefault,
//   authorizeEndpoint: "/authorize",
//   tokenEndpoint: "/token",
//   scopes: {
//     'mcp:read': 'Read-only access to MCP tools',
//     'mcp:write': 'Full access to MCP tools',
//     'tools:echo': 'Access to echo tool',
//     'tools:time': 'Access to time tool',
//     'tools:info': 'Access to server info tool',
//     'admin': 'Administrative access to all tools'
//   }
// });

// Simple routes for testing
app.get('/', (c) => {
  return c.text('Cloudflare Agents Development Server');
});

// Main export - simplified with proper Hono routing
export default app;

// Re-export Agent classes for wrangler.jsonc to find them
export { MyAgent } from './agents/MyAgent';
export { SupervisorAgent } from './agents/SupervisorAgent';
export { WorkerAgent } from './agents/WorkerAgent';
export { HistoryAgent } from './agents/HistoryAgent';
export { CounterAgent } from './agents/CounterAgent';
export { MigratingAgent } from './agents/MigratingAgent';
export { EchoAgent } from './agents/EchoAgent';
export { StreamingAgent } from './agents/StreamingAgent';
export { ChattyAgent } from './agents/ChattyAgent';
export { ReminderAgent } from './agents/ReminderAgent';
export { ScheduleManagerAgent } from './agents/ScheduleManagerAgent';
export { OnboardingAgent } from './agents/OnboardingAgent';
export { AuthAgent } from './agents/AuthAgent';
export { UserAgentV1 } from './agents/UserAgentV1';
export { UserAgentV2 } from './agents/UserAgentV2';
export { PaymentAgentV1 } from './agents/PaymentAgentV1';
export { RAGAgent } from './agents/RAGAgent';
export { RoutingAgent } from './agents/RoutingAgent';
export { GitHubAgent } from './agents/GitHubAgent';
export { WebBrowserAgent } from './agents/WebBrowserAgent';
export { EmailWorkflow } from './workflows/EmailWorkflow';
export { HITLAgent } from './agents/HITLAgent';
export { StatefulCalculatorAgent } from './agents/StatefulCalculatorAgent';
export { PersistentCounterAgent } from './agents/PersistentCounterAgent';
export { SecureMcpAgent } from './agents/SecureMcpAgent';
export { LoggingAgent } from './agents/LoggingAgent';
export { ChatHistoryAgent } from './agents/ChatHistoryAgent';
export { SecretAgent } from './agents/SecretAgent';
export { WebSocketStreamingAgent } from './agents/WebSocketStreamingAgent';
export { HttpEchoAgent } from './agents/HttpEchoAgent';
export { ResilientChatAgent } from './agents/ResilientChatAgent';
