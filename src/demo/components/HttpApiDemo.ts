import { DemoConfig } from '../DemoApp';

export class HttpApiDemo {
  constructor(private config: DemoConfig) {}

  updateConfig(config: DemoConfig): void {
    this.config = config;
  }

  render(): void {
    const container = document.getElementById('http-api-demo');
    if (!container) return;

    container.innerHTML = `
      <div class="http-controls">
        <select id="http-method-select">
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
        
        <select id="http-agent-select">
          <option value="http-echo-agent">HTTP Echo Agent</option>
          <option value="rag-agent">RAG Agent</option>
          <option value="resilient-chat-agent">Resilient Chat Agent</option>
        </select>
        
        <input type="text" id="http-session-id" placeholder="Session ID" value="demo-session">
        <input type="text" id="http-endpoint" placeholder="Additional endpoint (optional)">
      </div>
      
      <div class="request-body">
        <h4>Request Body (JSON):</h4>
        <textarea id="http-body-input" placeholder='{"key": "value"}' rows="4"></textarea>
      </div>
      
      <div class="http-actions">
        <button id="http-send-btn">Send Request</button>
        <button id="http-clear-btn">Clear Response</button>
      </div>
      
      <div class="response-area">
        <h4>Response:</h4>
        <pre id="http-response" class="response-container"></pre>
      </div>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const sendBtn = document.getElementById('http-send-btn') as HTMLButtonElement;
    const clearBtn = document.getElementById('http-clear-btn') as HTMLButtonElement;

    sendBtn.addEventListener('click', () => this.sendRequest());
    clearBtn.addEventListener('click', () => this.clearResponse());
  }

  private async sendRequest(): Promise<void> {
    const methodSelect = document.getElementById('http-method-select') as HTMLSelectElement;
    const agentSelect = document.getElementById('http-agent-select') as HTMLSelectElement;
    const sessionInput = document.getElementById('http-session-id') as HTMLInputElement;
    const endpointInput = document.getElementById('http-endpoint') as HTMLInputElement;
    const bodyInput = document.getElementById('http-body-input') as HTMLTextAreaElement;
    const responseContainer = document.getElementById('http-response') as HTMLPreElement;

    const method = methodSelect.value;
    const agentType = agentSelect.value;
    const sessionId = sessionInput.value || 'demo-session';
    const endpoint = endpointInput.value;
    
    const protocol = this.config.secure ? 'https' : 'http';
    let url = `${protocol}://${this.config.host}/agent/${agentType}/${sessionId}`;
    
    if (endpoint) {
      url += `/${endpoint}`;
    }

    const requestOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (method !== 'GET' && method !== 'DELETE') {
      const bodyText = bodyInput.value.trim();
      if (bodyText) {
        try {
          JSON.parse(bodyText); // Validate JSON
          requestOptions.body = bodyText;
        } catch (error) {
          this.displayResponse({
            error: 'Invalid JSON in request body',
            details: error
          });
          return;
        }
      }
    }

    try {
      this.displayResponse({ status: 'Sending request...', url, method, body: requestOptions.body });
      
      const response = await fetch(url, requestOptions);
      
      let responseData: any;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      this.displayResponse({
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData
      });

    } catch (error) {
      this.displayResponse({
        error: 'Request failed',
        details: error instanceof Error ? error.message : error
      });
    }
  }

  private displayResponse(data: any): void {
    const responseContainer = document.getElementById('http-response') as HTMLPreElement;
    if (!responseContainer) return;

    const timestamp = new Date().toLocaleTimeString();
    const formattedResponse = JSON.stringify({
      timestamp,
      ...data
    }, null, 2);

    responseContainer.textContent = formattedResponse;
  }

  private clearResponse(): void {
    const responseContainer = document.getElementById('http-response') as HTMLPreElement;
    if (responseContainer) {
      responseContainer.textContent = '';
    }
  }
}