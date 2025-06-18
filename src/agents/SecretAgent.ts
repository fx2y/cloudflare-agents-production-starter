import { Agent } from "agents";
import type { WorkerEnv } from "../types";

export class SecretAgent extends Agent<WorkerEnv> {
  async onRequest(request: Request): Promise<Response> {
    const secret = this.env.MY_LOCAL_SECRET || "not_found";
    return new Response(secret);
  }
}