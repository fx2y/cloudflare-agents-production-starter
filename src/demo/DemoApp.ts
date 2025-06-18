import { WebSocketDemo } from './components/WebSocketDemo';
import { HttpApiDemo } from './components/HttpApiDemo';
import { ConfigurationPanel } from './components/ConfigurationPanel';

export interface DemoConfig {
  host: string;
  secure: boolean;
}

export class DemoApp {
  private config: DemoConfig = {
    host: 'localhost:8787',
    secure: false
  };

  private configPanel: ConfigurationPanel;
  private websocketDemo: WebSocketDemo;
  private httpApiDemo: HttpApiDemo;

  constructor() {
    this.configPanel = new ConfigurationPanel(this.config, this.onConfigChange.bind(this));
    this.websocketDemo = new WebSocketDemo(this.config);
    this.httpApiDemo = new HttpApiDemo(this.config);
  }

  initialize(): void {
    this.renderApp();
    this.configPanel.render();
    this.websocketDemo.render();
    this.httpApiDemo.render();
  }

  private onConfigChange(newConfig: DemoConfig): void {
    this.config = { ...newConfig };
    this.websocketDemo.updateConfig(this.config);
    this.httpApiDemo.updateConfig(this.config);
  }

  private renderApp(): void {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
      <div class="container">
        <h1>Cloudflare Agents Demo</h1>
        <div id="configuration-panel"></div>
      </div>

      <div class="container">
        <div class="demo-section">
          <h2>WebSocket Demo</h2>
          <div id="websocket-demo"></div>
        </div>
      </div>

      <div class="container">
        <div class="demo-section">
          <h2>HTTP API Demo</h2>
          <div id="http-api-demo"></div>
        </div>
      </div>
    `;
  }
}