import { AgentNamespace } from 'agents';
import type { AuthAgent } from './agents/AuthAgent';
import type { ChattyAgent } from './agents/ChattyAgent';
import type { CounterAgent } from './agents/CounterAgent';
import type { EchoAgent } from './agents/EchoAgent';
import type { HistoryAgent } from './agents/HistoryAgent';
import type { MigratingAgent } from './agents/MigratingAgent';
import type { MyAgent } from './agents/MyAgent';
import type { OnboardingAgent } from './agents/OnboardingAgent';
import type { PaymentAgentV1 } from './agents/PaymentAgentV1';
import type { ReminderAgent } from './agents/ReminderAgent';
import type { ScheduleManagerAgent } from './agents/ScheduleManagerAgent';
import type { StreamingAgent } from './agents/StreamingAgent';
import type { SupervisorAgent } from './agents/SupervisorAgent';
import type { UserAgentV1 } from './agents/UserAgentV1';
import type { UserAgentV2 } from './agents/UserAgentV2';
import type { WorkerAgent } from './agents/WorkerAgent';
import type { RAGAgent } from './agents/RAGAgent';
import type { RoutingAgent } from './agents/RoutingAgent';
import type { GitHubAgent } from './agents/GitHubAgent';
import type { WebBrowserAgent } from './agents/WebBrowserAgent';
import type { LoggingAgent } from './agents/LoggingAgent';
import type { ChatHistoryAgent } from './agents/ChatHistoryAgent';
import type { SecretAgent } from './agents/SecretAgent';

export interface CounterState {
  counter: number;
}

export interface StructuredLog {
  timestamp: string;
  agentClass: string;
  agentId: string;
  traceId: string;
  eventType: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data: object;
}

export interface WorkerEnv {
  // Existing agents
  CHATTY_AGENT: AgentNamespace<ChattyAgent>;
  COUNTER_AGENT: AgentNamespace<CounterAgent>;
  ECHO_AGENT: AgentNamespace<EchoAgent>;
  HISTORY_AGENT: AgentNamespace<HistoryAgent>;
  MIGRATING_AGENT: AgentNamespace<MigratingAgent>;
  MY_AGENT: AgentNamespace<MyAgent>;
  ONBOARDING_AGENT: AgentNamespace<OnboardingAgent>;
  REMINDER_AGENT: AgentNamespace<ReminderAgent>;
  SCHEDULE_MANAGER_AGENT: AgentNamespace<ScheduleManagerAgent>;
  STREAMING_AGENT: AgentNamespace<StreamingAgent>;
  SUPERVISOR: AgentNamespace<SupervisorAgent>;
  WORKER_AGENT: AgentNamespace<WorkerAgent>;
  
  // New security and versioning agents
  AUTH_AGENT: AgentNamespace<AuthAgent>;
  USER_AGENT_V1: AgentNamespace<UserAgentV1>;
  USER_AGENT_V2: AgentNamespace<UserAgentV2>;
  PAYMENT_AGENT_V1: AgentNamespace<PaymentAgentV1>;
  
  // AI agents
  RAG_AGENT: AgentNamespace<RAGAgent>;
  ROUTING_AGENT: AgentNamespace<RoutingAgent>;
  
  // Tool agents
  GITHUB_AGENT: AgentNamespace<GitHubAgent>;
  BROWSER_AGENT: AgentNamespace<WebBrowserAgent>;
  LOGGING_AGENT: AgentNamespace<LoggingAgent>;
  SECRET_AGENT: AgentNamespace<SecretAgent>;
  
  // Chat agents
  CHAT_HISTORY_AGENT: AgentNamespace<ChatHistoryAgent>;
  
  // AI services
  AI: Ai;
  VECTOR_DB: VectorizeIndex;
  BROWSER: Fetcher;
  
  // Secrets
  VALID_BEARER_TOKEN: string;
  JWT_SECRET: string;
  EMAIL_WORKFLOW: any;
  OPENAI_API_KEY: string;
  GITHUB_API_TOKEN: string;
  MY_LOCAL_SECRET: string;
}

export interface GitHubRepoDTO {
  name: string;
  full_name: string;
  description: string | null;
  stargazers_count: number;
  open_issues_count: number;
  url: string;
}

export interface BrowserRequestPayload {
  url: string;
}