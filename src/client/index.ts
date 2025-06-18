// Re-export client utilities from the agents package
export { AgentClient, agentFetch } from "agents/client";

// TypeScript interfaces for client usage
export interface AgentClientOptions {
  agent: string;      // Name of the agent class
  name: string;       // ID of the agent instance
  host: string;       // Hostname of the deployed Worker
  secure?: boolean;   // Whether to use wss:// (default: true)
}

export interface AgentFetchOptions {
  agent: string;
  name: string;
  host: string;
  secure?: boolean;
}