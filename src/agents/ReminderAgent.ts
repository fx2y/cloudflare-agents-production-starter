import { Agent } from 'agents';
import type { WorkerEnv } from '../types';

export interface ReminderPayload {
  message: string;
  delaySeconds: number;
  failFor: number;
  retryCount: number;
}

export class ReminderAgent extends Agent<WorkerEnv> {
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    if (method === 'POST' && url.pathname.endsWith('/set')) {
      try {
        const body = await request.json() as any;
        const { message, delaySeconds = 10, failFor = 0 } = body;

        if (!message || typeof message !== 'string') {
          return new Response(JSON.stringify({ error: 'Invalid message' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const taskId = await this.schedule(delaySeconds, 'sendReminder', {
          message,
          delaySeconds,
          failFor,
          retryCount: 0
        });

        return new Response(JSON.stringify({
          status: 'Resilient reminder set!',
          taskId
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  }

  async sendReminder(data: ReminderPayload): Promise<void> {
    const logMessage = JSON.stringify({
      timestamp: new Date().toISOString(),
      agentClass: 'ReminderAgent',
      agentId: this.name,
      eventType: 'reminder.attempt',
      level: 'info',
      message: `Reminder attempt ${data.retryCount + 1}`,
      data: { message: data.message, retryCount: data.retryCount, failFor: data.failFor }
    });

    try {
      if (data.retryCount < data.failFor) {
        throw new Error(`Intentionally failing (attempt ${data.retryCount + 1})`);
      }

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        agentClass: 'ReminderAgent',
        agentId: this.name,
        eventType: 'reminder.success',
        level: 'info',
        message: `SUCCESS: Reminder sent: ${data.message}`,
        data: { message: data.message, finalRetryCount: data.retryCount }
      }));

    } catch (error) {
      const nextRetryCount = data.retryCount + 1;
      
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        agentClass: 'ReminderAgent',
        agentId: this.name,
        eventType: 'reminder.failed',
        level: 'error',
        message: `Task failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { 
          message: data.message, 
          retryCount: data.retryCount, 
          nextRetryCount,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }));

      if (nextRetryCount > 5) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          agentClass: 'ReminderAgent',
          agentId: this.name,
          eventType: 'reminder.max_retries_exceeded',
          level: 'error',
          message: 'Max retries exceeded for reminder. Aborting.',
          data: { message: data.message, finalRetryCount: data.retryCount }
        }));
        return;
      }

      const delay = Math.pow(2, nextRetryCount) * 10; // Exponential backoff: 20s, 40s, 80s...
      await this.schedule(delay, 'sendReminder', {
        ...data,
        retryCount: nextRetryCount
      });
    }
  }
}