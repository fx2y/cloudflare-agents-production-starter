import { DemoConfig } from '../DemoApp';

export class WebSocketDemo {
  private ws: WebSocket | null = null;
  private isConnected = false;

  constructor(private config: DemoConfig) {}

  updateConfig(config: DemoConfig): void {
    this.config = config;
    if (this.isConnected) {
      this.disconnect();
    }
  }

  render(): void {
    const container = document.getElementById('websocket-demo');
    if (!container) return;

    container.innerHTML = `
      <div class="websocket-controls">
        <select id="ws-agent-select">
          <option value="echo-agent">Echo Agent</option>
          <option value="websocket-streaming-agent">WebSocket Streaming Agent</option>
          <option value="resilient-chat-agent">Resilient Chat Agent</option>
          <option value="chatty-agent">Chatty Agent</option>
        </select>
        <input type="text" id="ws-session-id" placeholder="Session ID" value="demo-session">
        <button id="ws-connect-btn">Connect</button>
        <button id="ws-disconnect-btn" disabled>Disconnect</button>
      </div>
      
      <div class="message-controls">
        <textarea id="ws-message-input" placeholder="Enter message..." rows="3"></textarea>
        <button id="ws-send-btn" disabled>Send Message</button>
      </div>
      
      <div class="response-area">
        <h4>WebSocket Messages:</h4>
        <div id="ws-messages" class="messages-container"></div>
        <button id="ws-clear-btn">Clear Messages</button>
      </div>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const connectBtn = document.getElementById('ws-connect-btn') as HTMLButtonElement;
    const disconnectBtn = document.getElementById('ws-disconnect-btn') as HTMLButtonElement;
    const sendBtn = document.getElementById('ws-send-btn') as HTMLButtonElement;
    const clearBtn = document.getElementById('ws-clear-btn') as HTMLButtonElement;
    const messageInput = document.getElementById('ws-message-input') as HTMLTextAreaElement;

    connectBtn.addEventListener('click', () => this.connect());
    disconnectBtn.addEventListener('click', () => this.disconnect());
    sendBtn.addEventListener('click', () => this.sendMessage());
    clearBtn.addEventListener('click', () => this.clearMessages());

    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }

  private connect(): void {
    const agentSelect = document.getElementById('ws-agent-select') as HTMLSelectElement;
    const sessionInput = document.getElementById('ws-session-id') as HTMLInputElement;
    
    const agentType = agentSelect.value;
    const sessionId = sessionInput.value || 'demo-session';
    const protocol = this.config.secure ? 'wss' : 'ws';
    const url = `${protocol}://${this.config.host}/agent/${agentType}/${sessionId}`;

    this.addMessage('system', `Connecting to: ${url}`);

    try {
      this.ws = new WebSocket(url);
      this.setupWebSocketHandlers();
    } catch (error) {
      this.addMessage('error', `Connection failed: ${error}`);
    }
  }

  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.isConnected = true;
      this.updateConnectionUI(true);
      this.addMessage('system', 'Connected successfully');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.addMessage('received', JSON.stringify(data, null, 2));
      } catch {
        this.addMessage('received', event.data);
      }
    };

    this.ws.onclose = (event) => {
      this.isConnected = false;
      this.updateConnectionUI(false);
      this.addMessage('system', `Connection closed (${event.code}): ${event.reason}`);
    };

    this.ws.onerror = (error) => {
      this.addMessage('error', `WebSocket error: ${error}`);
    };
  }

  private disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'User disconnected');
      this.ws = null;
    }
  }

  private sendMessage(): void {
    const messageInput = document.getElementById('ws-message-input') as HTMLTextAreaElement;
    const message = messageInput.value.trim();

    if (!message || !this.ws || !this.isConnected) return;

    this.ws.send(message);
    this.addMessage('sent', message);
    messageInput.value = '';
  }

  private addMessage(type: 'sent' | 'received' | 'system' | 'error', content: string): void {
    const container = document.getElementById('ws-messages');
    if (!container) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    
    const timestamp = new Date().toLocaleTimeString();
    messageDiv.innerHTML = `
      <span class="timestamp">[${timestamp}]</span>
      <span class="type">${type.toUpperCase()}:</span>
      <pre class="content">${content}</pre>
    `;

    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
  }

  private clearMessages(): void {
    const container = document.getElementById('ws-messages');
    if (container) {
      container.innerHTML = '';
    }
  }

  private updateConnectionUI(connected: boolean): void {
    const connectBtn = document.getElementById('ws-connect-btn') as HTMLButtonElement;
    const disconnectBtn = document.getElementById('ws-disconnect-btn') as HTMLButtonElement;
    const sendBtn = document.getElementById('ws-send-btn') as HTMLButtonElement;

    connectBtn.disabled = connected;
    disconnectBtn.disabled = !connected;
    sendBtn.disabled = !connected;
  }
}