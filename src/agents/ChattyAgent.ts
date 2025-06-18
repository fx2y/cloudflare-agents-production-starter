import { Agent } from "agents";
import { Connection } from "partyserver";
import type { WorkerEnv } from "../types";

interface ConnState { 
  nickname: string; 
}

export class ChattyAgent extends Agent<WorkerEnv, {}> {
  async onMessage(connection: Connection<ConnState>, message: string) {
    try {
      const msg = JSON.parse(message);

      if (msg.op === 'set_nick') {
        connection.setState({ nickname: msg.nick });
        connection.send(`Nickname set to ${msg.nick}`);
      } else if (msg.op === 'send_text') {
        const sender = connection.state?.nickname || 'Anonymous';
        // Simple broadcast implementation - send to all connections
        console.log(`Broadcasting message: ${sender}: ${msg.text}`);
      }
    } catch (e) {
      console.error('Failed to parse command:', e);
    }
  }
}