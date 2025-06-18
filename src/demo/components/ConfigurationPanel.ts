import { DemoConfig } from '../DemoApp';

export class ConfigurationPanel {
  constructor(
    private config: DemoConfig,
    private onConfigChange: (config: DemoConfig) => void
  ) {}

  render(): void {
    const container = document.getElementById('configuration-panel');
    if (!container) return;

    container.innerHTML = `
      <h3>Configuration</h3>
      <div class="config-row">
        <label for="host-input">Host:</label>
        <input type="text" id="host-input" value="${this.config.host}" placeholder="localhost:8787">
      </div>
      <div class="config-row">
        <label for="secure-checkbox">
          <input type="checkbox" id="secure-checkbox" ${this.config.secure ? 'checked' : ''}>
          Use HTTPS/WSS
        </label>
      </div>
      <button id="update-config-btn">Update Configuration</button>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const hostInput = document.getElementById('host-input') as HTMLInputElement;
    const secureCheckbox = document.getElementById('secure-checkbox') as HTMLInputElement;
    const updateBtn = document.getElementById('update-config-btn') as HTMLButtonElement;

    updateBtn.addEventListener('click', () => {
      this.config.host = hostInput.value;
      this.config.secure = secureCheckbox.checked;
      this.onConfigChange(this.config);
      this.showUpdateMessage();
    });
  }

  private showUpdateMessage(): void {
    const updateBtn = document.getElementById('update-config-btn') as HTMLButtonElement;
    const originalText = updateBtn.textContent;
    updateBtn.textContent = 'Updated!';
    updateBtn.disabled = true;
    
    setTimeout(() => {
      updateBtn.textContent = originalText;
      updateBtn.disabled = false;
    }, 1500);
  }
}