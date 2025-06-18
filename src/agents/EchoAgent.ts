import { Agent } from "agents";
import { Connection } from "partyserver";
import type { WorkerEnv } from "../types";

type WSMessage = string;

export class EchoAgent extends Agent<WorkerEnv, {}> {
  async onConnect(connection: Connection) {
    console.log(`Connection ${connection.id} established.`);
    connection.send("Welcome!");
  }

  async onMessage(connection: Connection, message: WSMessage) {
    connection.send(`You said: ${message}`);
  }

  async onClose(connection: Connection, code: number, reason: string) {
    console.log(`Connection ${connection.id} closed: ${reason}`);
  }

  async onError(connection: Connection, error: unknown): Promise<void>;
  async onError(error: unknown): Promise<void>;
  async onError(connectionOrError: Connection | unknown, error?: unknown): Promise<void> {
    if (connectionOrError && typeof connectionOrError === 'object' && 'id' in connectionOrError) {
      console.error(`Error on connection ${connectionOrError.id}:`, error);
    } else {
      console.error('Agent error:', connectionOrError);
    }
  }
}