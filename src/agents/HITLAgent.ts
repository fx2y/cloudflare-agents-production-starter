import { Agent, Connection } from "agents";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

interface HITLState {
  status: "idle" | "pending_review" | "running" | "aborted" | "completed";
  data: any;
}

interface HITLInterventionCommand {
  op: "proceed" | "override" | "abort";
  newData?: any;
}

const HITLInterventionCommandSchema = z.object({
  op: z.enum(["proceed", "override", "abort"]),
  newData: z.any().optional()
});

export class HITLAgent extends Agent<any, HITLState> {
  initialState: HITLState = { status: "idle", data: null };

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (request.method === "POST" && url.pathname.endsWith("/execute-transaction")) {
      try {
        const { data } = await request.json() as any;
        return await this.executeTransaction(data);
      } catch (error) {
        return new Response("Invalid JSON", { status: 400 });
      }
    }

    return new Response("Not found", { status: 404 });
  }

  async executeTransaction(data: any): Promise<Response> {
    // Pause workflow
    this.setState({ status: "pending_review", data });

    // Generate a signed intervention URL with expiry
    const interventionUrl = await this.generateSecureInterventionUrl();
    console.log(`NEEDS REVIEW: ${interventionUrl}`); // In reality, send to Slack/email

    return new Response(
      JSON.stringify({
        message: "Awaiting human approval.",
        interventionUrl
      }),
      { 
        status: 202,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  private async generateSecureInterventionUrl(): Promise<string> {
    const secret = (this.env as any).INTERVENTION_JWT_SECRET || "fallback-dev-secret";
    const encoder = new TextEncoder();
    const secretKey = encoder.encode(secret);

    const token = await new SignJWT({
      agentId: this.name,
      purpose: "intervention",
      iat: Math.floor(Date.now() / 1000)
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .setIssuedAt()
      .sign(secretKey);

    const baseUrl = (this.env as any).DOMAIN ? `https://${(this.env as any).DOMAIN}` : 'http://localhost:8787';
    return `${baseUrl}/intervention?token=${token}`;
  }

  async verifyInterventionToken(token: string): Promise<{ agentId: string } | null> {
    try {
      const secret = (this.env as any).INTERVENTION_JWT_SECRET || "fallback-dev-secret";
      const encoder = new TextEncoder();
      const secretKey = encoder.encode(secret);

      const { payload } = await jwtVerify(token, secretKey);
      
      if ((payload as any).purpose === "intervention" && (payload as any).agentId === this.name) {
        return { agentId: (payload as any).agentId as string };
      }
      
      return null;
    } catch (error) {
      console.error("Token verification failed:", error);
      return null;
    }
  }

  async onConnect(connection: Connection): Promise<void> {
    // Send current state to newly connected intervention UI
    connection.send(JSON.stringify({ 
      type: "state_update", 
      state: this.state 
    }));
  }

  async onMessage(connection: Connection, message: string): Promise<void> {
    try {
      const parsedMessage = JSON.parse(message);
      const validationResult = HITLInterventionCommandSchema.safeParse(parsedMessage);
      
      if (!validationResult.success) {
        connection.send(JSON.stringify({ 
          type: "error", 
          message: "Invalid command format",
          details: validationResult.error.errors
        }));
        return;
      }

      const command = validationResult.data;
      
      if (this.state.status !== "pending_review") {
        connection.send(JSON.stringify({ 
          type: "error", 
          message: "Agent is not in pending review state" 
        }));
        return;
      }

      switch (command.op) {
        case "proceed":
          this.setState({ ...this.state, status: "running" });
          await this.continueOriginalTask();
          this.setState({ ...this.state, status: "completed" });
          break;
        
        case "override":
          this.setState({ status: "running", data: command.newData });
          await this.continueOriginalTask();
          this.setState({ ...this.state, status: "completed" });
          break;
        
        case "abort":
          this.setState({ ...this.state, status: "aborted" });
          break;
      }

      // Broadcast state update to all connected clients
      this.broadcast(JSON.stringify({ 
        type: "state_update", 
        state: this.state 
      }));
    } catch (error) {
      connection.send(JSON.stringify({ 
        type: "error", 
        message: "Invalid JSON or command format" 
      }));
    }
  }

  private async continueOriginalTask(): Promise<void> {
    // Placeholder for the actual task logic
    // In a real implementation, this would contain the business logic
    // that was paused for human review
    console.log("Continuing original task with data:", this.state.data);
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}