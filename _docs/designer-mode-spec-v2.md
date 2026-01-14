# Designer mode: VSCode extension specification (v2)

## Overview

Build a VSCode extension that creates a designer-friendly workspace layout: Copilot chat on the left, live browser preview on the right, with simple server controls in a toolbar. Terminal and file browser are available but hidden by default.

### Target users
- Designers doing AI prototyping
- Non-technical team members
- Anyone intimidated by terminals and git

### Core principle
The default view is just two things: chat with AI, see the result. Everything else is tucked away until needed.

---

## Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Designer Mode    [▶ Start] [■ Stop] [📦 Install]   [📁] [>_]   │
├─────────────────────────────┬───────────────────────────────────┤
│                             │                                   │
│                             │                                   │
│      GitHub Copilot         │       Browser Preview             │
│      Chat Panel             │       (iframe to localhost)       │
│                             │                                   │
│      (native VSCode         │       [🔄 Refresh]                │
│       Copilot chat)         │                                   │
│                             │                                   │
│                             │                                   │
├─────────────────────────────┴───────────────────────────────────┤
│ ▼ Terminal (collapsed by default)                               │
└─────────────────────────────────────────────────────────────────┘

Side panel (toggled via 📁 button):
┌─────────────┐
│ Files       │
│ ├── src/    │
│ ├── app/    │
│ └── ...     │
└─────────────┘
```

---

## Architecture

This extension is simpler than a full custom UI. It orchestrates existing VSCode features:

```
┌─────────────────────────────────────────────────────────────────┐
│  Extension Host                                                 │
│                                                                 │
│  1. Opens Copilot chat (vscode.commands.executeCommand)         │
│  2. Creates webview panel with iframe (browser preview)         │
│  3. Manages dev server process (child_process)                  │
│  4. Toggles terminal visibility                                 │
│  5. Toggles file explorer visibility                            │
└─────────────────────────────────────────────────────────────────┘
```

### What we build vs what we reuse

| Feature | Approach |
|---------|----------|
| AI Chat | Reuse: Open Copilot's native chat panel |
| Browser preview | Build: Webview with iframe + toolbar |
| Server controls | Build: Custom toolbar in webview |
| Terminal | Reuse: VSCode integrated terminal, toggle visibility |
| File browser | Reuse: VSCode explorer, toggle visibility |

---

## Project structure

```
designer-mode/
├── package.json
├── tsconfig.json
├── src/
│   ├── extension.ts              # Entry point, layout orchestration
│   ├── preview/
│   │   ├── PreviewPanel.ts       # Webview panel class
│   │   ├── preview.html          # HTML template with iframe + toolbar
│   │   ├── preview.css           # Styles
│   │   └── preview.js            # Toolbar button handlers
│   ├── server/
│   │   ├── ServerManager.ts      # Start/stop/status tracking
│   │   └── OutputParser.ts       # Parse localhost URL from output
│   ├── layout/
│   │   └── LayoutManager.ts      # Show/hide panels, arrange views
│   └── utils/
│       ├── platform.ts           # Cross-platform commands
│       └── config.ts             # User settings
├── resources/
│   └── icon.png
└── webview-ui/                   # Built assets
```

---

## Feature specifications

### 1. Activation and layout setup

When the user runs "Designer Mode: Open":

```typescript
async function activate() {
  // 1. Open Copilot chat on the left
  await vscode.commands.executeCommand('workbench.action.chat.open');
  
  // 2. Create preview webview on the right
  const previewPanel = new PreviewPanel(context, vscode.ViewColumn.Two);
  
  // 3. Hide the default sidebar (file explorer)
  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  
  // 4. Hide terminal by default
  await vscode.commands.executeCommand('workbench.action.closePanel');
  
  // 5. Arrange layout: chat left, preview right
  // The chat panel should be in ViewColumn.One
  // The preview panel should be in ViewColumn.Two
}
```

#### Package.json commands

```json
{
  "contributes": {
    "commands": [
      {
        "command": "designerMode.open",
        "title": "Open Designer Mode",
        "category": "Designer Mode"
      },
      {
        "command": "designerMode.toggleFiles",
        "title": "Toggle File Browser",
        "category": "Designer Mode"
      },
      {
        "command": "designerMode.toggleTerminal",
        "title": "Toggle Terminal",
        "category": "Designer Mode"
      }
    ],
    "keybindings": [
      {
        "command": "designerMode.open",
        "key": "cmd+shift+d",
        "win": "ctrl+shift+d"
      }
    ]
  }
}
```

---

### 2. Browser preview panel

A webview containing an iframe that points to the local dev server.

#### HTML structure

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: var(--vscode-editor-background);
    }
    
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--vscode-titleBar-activeBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    
    .toolbar button {
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .toolbar button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    
    .toolbar button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .toolbar button.running {
      background: var(--vscode-testing-iconPassed);
    }
    
    .toolbar .spacer {
      flex: 1;
    }
    
    .toolbar .status {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    
    .toolbar .toggle-btn {
      background: transparent;
      color: var(--vscode-foreground);
      padding: 6px 8px;
    }
    
    .preview-frame {
      flex: 1;
      border: none;
      background: white;
    }
    
    .placeholder {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--vscode-descriptionForeground);
      gap: 16px;
    }
    
    .placeholder h2 {
      margin: 0;
      font-weight: 500;
    }
    
    .placeholder p {
      margin: 0;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="startBtn" title="Start dev server">▶ Start</button>
    <button id="stopBtn" title="Stop dev server" disabled>■ Stop</button>
    <button id="installBtn" title="Install dependencies">📦 Install</button>
    
    <span class="spacer"></span>
    
    <span class="status" id="status">Server stopped</span>
    
    <button id="refreshBtn" class="toggle-btn" title="Refresh preview" disabled>🔄</button>
    <button id="filesBtn" class="toggle-btn" title="Toggle file browser">📁</button>
    <button id="terminalBtn" class="toggle-btn" title="Toggle terminal">&gt;_</button>
  </div>
  
  <div class="placeholder" id="placeholder">
    <h2>Preview</h2>
    <p>Click "Start" to launch the dev server</p>
  </div>
  
  <iframe class="preview-frame" id="preview" style="display: none;"></iframe>
  
  <script src="${scriptUri}"></script>
</body>
</html>
```

#### Preview panel class

```typescript
// src/preview/PreviewPanel.ts

export class PreviewPanel {
  public static currentPanel: PreviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private serverUrl: string | null = null;
  
  constructor(context: vscode.ExtensionContext, column: vscode.ViewColumn) {
    this.panel = vscode.window.createWebviewPanel(
      'designerModePreview',
      'Preview',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        // Allow iframe to load localhost
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'webview-ui')
        ]
      }
    );
    
    this.panel.webview.html = this.getHtmlContent(context);
    this.panel.webview.onDidReceiveMessage(this.handleMessage.bind(this));
  }
  
  private handleMessage(message: any) {
    switch (message.type) {
      case 'start':
        vscode.commands.executeCommand('designerMode.startServer');
        break;
      case 'stop':
        vscode.commands.executeCommand('designerMode.stopServer');
        break;
      case 'install':
        vscode.commands.executeCommand('designerMode.install');
        break;
      case 'refresh':
        this.refresh();
        break;
      case 'toggleFiles':
        vscode.commands.executeCommand('designerMode.toggleFiles');
        break;
      case 'toggleTerminal':
        vscode.commands.executeCommand('designerMode.toggleTerminal');
        break;
    }
  }
  
  public setServerUrl(url: string) {
    this.serverUrl = url;
    this.panel.webview.postMessage({ type: 'serverStarted', url });
  }
  
  public setServerStopped() {
    this.serverUrl = null;
    this.panel.webview.postMessage({ type: 'serverStopped' });
  }
  
  public refresh() {
    if (this.serverUrl) {
      this.panel.webview.postMessage({ type: 'refresh' });
    }
  }
}
```

#### Webview JavaScript

```javascript
// src/preview/preview.js

const vscode = acquireVsCodeApi();

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const installBtn = document.getElementById('installBtn');
const refreshBtn = document.getElementById('refreshBtn');
const filesBtn = document.getElementById('filesBtn');
const terminalBtn = document.getElementById('terminalBtn');
const status = document.getElementById('status');
const placeholder = document.getElementById('placeholder');
const preview = document.getElementById('preview');

// Button handlers
startBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'start' });
  startBtn.disabled = true;
  status.textContent = 'Starting...';
});

stopBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'stop' });
});

installBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'install' });
  installBtn.disabled = true;
  installBtn.textContent = '📦 Installing...';
});

refreshBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'refresh' });
});

filesBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'toggleFiles' });
});

terminalBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'toggleTerminal' });
});

// Handle messages from extension
window.addEventListener('message', (event) => {
  const message = event.data;
  
  switch (message.type) {
    case 'serverStarted':
      startBtn.disabled = true;
      stopBtn.disabled = false;
      refreshBtn.disabled = false;
      status.textContent = `Running at ${message.url}`;
      placeholder.style.display = 'none';
      preview.style.display = 'block';
      preview.src = message.url;
      break;
      
    case 'serverStopped':
      startBtn.disabled = false;
      stopBtn.disabled = true;
      refreshBtn.disabled = true;
      status.textContent = 'Server stopped';
      placeholder.style.display = 'flex';
      preview.style.display = 'none';
      preview.src = '';
      break;
      
    case 'refresh':
      preview.src = preview.src;
      break;
      
    case 'installComplete':
      installBtn.disabled = false;
      installBtn.textContent = '📦 Install';
      break;
      
    case 'error':
      status.textContent = message.text;
      startBtn.disabled = false;
      installBtn.disabled = false;
      installBtn.textContent = '📦 Install';
      break;
  }
});
```

---

### 3. Server manager

Handles starting, stopping, and tracking the dev server process.

```typescript
// src/server/ServerManager.ts

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as os from 'os';

export class ServerManager {
  private process: ChildProcess | null = null;
  private outputChannel: vscode.OutputChannel;
  private onServerReady: (url: string) => void;
  private onServerStopped: () => void;
  
  constructor(
    onServerReady: (url: string) => void,
    onServerStopped: () => void
  ) {
    this.outputChannel = vscode.window.createOutputChannel('Designer Mode');
    this.onServerReady = onServerReady;
    this.onServerStopped = onServerStopped;
  }
  
  async start(workspaceFolder: string): Promise<void> {
    if (this.process) {
      return; // Already running
    }
    
    const isWindows = os.platform() === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', 'npm run dev'] : ['-c', 'npm run dev'];
    
    this.process = spawn(shell, shellArgs, {
      cwd: workspaceFolder,
      env: { ...process.env }
    });
    
    this.process.stdout?.on('data', (data) => {
      const output = data.toString();
      this.outputChannel.append(output);
      
      // Parse for localhost URL
      const url = this.parseServerUrl(output);
      if (url) {
        this.onServerReady(url);
      }
    });
    
    this.process.stderr?.on('data', (data) => {
      this.outputChannel.append(data.toString());
    });
    
    this.process.on('close', () => {
      this.process = null;
      this.onServerStopped();
    });
  }
  
  stop(): void {
    if (!this.process) {
      return;
    }
    
    const isWindows = os.platform() === 'win32';
    
    if (isWindows) {
      // On Windows, use taskkill to kill the process tree
      spawn('taskkill', ['/pid', this.process.pid!.toString(), '/f', '/t']);
    } else {
      // On Mac/Linux, kill the process group
      process.kill(-this.process.pid!, 'SIGTERM');
    }
    
    this.process = null;
    this.onServerStopped();
  }
  
  isRunning(): boolean {
    return this.process !== null;
  }
  
  private parseServerUrl(output: string): string | null {
    // Common patterns from different frameworks
    const patterns = [
      /Local:\s+(https?:\/\/localhost:\d+)/,           // Vite
      /ready on (https?:\/\/localhost:\d+)/i,          // Next.js  
      /Server running at (https?:\/\/localhost:\d+)/i, // Generic
      /listening on (https?:\/\/localhost:\d+)/i,      // Express
      /(https?:\/\/localhost:\d+)/                     // Fallback
    ];
    
    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }
}
```

---

### 4. Layout manager

Handles toggling panels and arranging the workspace.

```typescript
// src/layout/LayoutManager.ts

import * as vscode from 'vscode';

export class LayoutManager {
  private sidebarVisible = false;
  private terminalVisible = false;
  
  async setupInitialLayout(): Promise<void> {
    // Close sidebar (file explorer)
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    
    // Close bottom panel (terminal)
    await vscode.commands.executeCommand('workbench.action.closePanel');
  }
  
  async toggleSidebar(): Promise<void> {
    if (this.sidebarVisible) {
      await vscode.commands.executeCommand('workbench.action.closeSidebar');
    } else {
      await vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
    }
    this.sidebarVisible = !this.sidebarVisible;
  }
  
  async toggleTerminal(): Promise<void> {
    if (this.terminalVisible) {
      await vscode.commands.executeCommand('workbench.action.closePanel');
    } else {
      await vscode.commands.executeCommand('workbench.action.terminal.toggleTerminal');
    }
    this.terminalVisible = !this.terminalVisible;
  }
  
  async openCopilotChat(): Promise<void> {
    // Try GitHub Copilot Chat first
    try {
      await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
    } catch {
      // Fallback to generic chat
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open');
      } catch {
        vscode.window.showWarningMessage(
          'Could not open Copilot Chat. Make sure GitHub Copilot is installed.'
        );
      }
    }
  }
}
```

---

### 5. Install command handler

```typescript
// src/commands/install.ts

import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as os from 'os';

export async function runInstall(
  workspaceFolder: string,
  onComplete: (success: boolean, error?: string) => void
): Promise<void> {
  const isWindows = os.platform() === 'win32';
  const shell = isWindows ? 'cmd.exe' : '/bin/sh';
  const shellArgs = isWindows ? ['/c', 'npm install'] : ['-c', 'npm install'];
  
  // Show progress notification
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Installing dependencies...',
      cancellable: false
    },
    async () => {
      return new Promise<void>((resolve) => {
        const proc = spawn(shell, shellArgs, {
          cwd: workspaceFolder
        });
        
        let errorOutput = '';
        
        proc.stderr?.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        proc.on('close', (code) => {
          if (code === 0) {
            vscode.window.showInformationMessage('Dependencies installed successfully');
            onComplete(true);
          } else {
            vscode.window.showErrorMessage('Failed to install dependencies');
            onComplete(false, errorOutput);
          }
          resolve();
        });
      });
    }
  );
}
```

---

## Extension entry point

```typescript
// src/extension.ts

import * as vscode from 'vscode';
import { PreviewPanel } from './preview/PreviewPanel';
import { ServerManager } from './server/ServerManager';
import { LayoutManager } from './layout/LayoutManager';
import { runInstall } from './commands/install';

let previewPanel: PreviewPanel | undefined;
let serverManager: ServerManager | undefined;
let layoutManager: LayoutManager | undefined;

export function activate(context: vscode.ExtensionContext) {
  layoutManager = new LayoutManager();
  
  // Main command: Open Designer Mode
  const openCommand = vscode.commands.registerCommand('designerMode.open', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('Please open a folder first');
      return;
    }
    
    // Set up layout
    await layoutManager!.setupInitialLayout();
    
    // Open Copilot chat on the left
    await layoutManager!.openCopilotChat();
    
    // Create preview panel on the right
    previewPanel = new PreviewPanel(context, vscode.ViewColumn.Two);
    
    // Initialize server manager
    serverManager = new ServerManager(
      (url) => previewPanel?.setServerUrl(url),
      () => previewPanel?.setServerStopped()
    );
  });
  
  // Server commands
  const startServerCommand = vscode.commands.registerCommand('designerMode.startServer', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder && serverManager) {
      await serverManager.start(workspaceFolder);
    }
  });
  
  const stopServerCommand = vscode.commands.registerCommand('designerMode.stopServer', () => {
    serverManager?.stop();
  });
  
  // Install command
  const installCommand = vscode.commands.registerCommand('designerMode.install', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder) {
      await runInstall(workspaceFolder, (success, error) => {
        if (success) {
          previewPanel?.postMessage({ type: 'installComplete' });
        } else {
          previewPanel?.postMessage({ type: 'error', text: 'Install failed' });
        }
      });
    }
  });
  
  // Toggle commands
  const toggleFilesCommand = vscode.commands.registerCommand('designerMode.toggleFiles', () => {
    layoutManager?.toggleSidebar();
  });
  
  const toggleTerminalCommand = vscode.commands.registerCommand('designerMode.toggleTerminal', () => {
    layoutManager?.toggleTerminal();
  });
  
  context.subscriptions.push(
    openCommand,
    startServerCommand,
    stopServerCommand,
    installCommand,
    toggleFilesCommand,
    toggleTerminalCommand
  );
}

export function deactivate() {
  serverManager?.stop();
}
```

---

## Package.json

```json
{
  "name": "designer-mode",
  "displayName": "Designer Mode",
  "description": "A simplified VSCode interface for designers",
  "version": "0.1.0",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other"],
  "activationEvents": [
    "workspaceContains:**/package.json"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "designerMode.open",
        "title": "Open Designer Mode",
        "category": "Designer Mode"
      },
      {
        "command": "designerMode.toggleFiles",
        "title": "Toggle File Browser",
        "category": "Designer Mode"
      },
      {
        "command": "designerMode.toggleTerminal",
        "title": "Toggle Terminal",
        "category": "Designer Mode"
      }
    ],
    "keybindings": [
      {
        "command": "designerMode.open",
        "key": "ctrl+shift+d",
        "mac": "cmd+shift+d"
      }
    ]
  },
  "scripts": {
    "build": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node",
    "watch": "npm run build -- --watch",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.85.0",
    "esbuild": "^0.19.0",
    "typescript": "^5.0.0"
  }
}
```

---

## Cross-platform notes

| Scenario | Mac/Linux | Windows |
|----------|-----------|---------|
| Run npm commands | `/bin/sh -c "npm run dev"` | `cmd.exe /c npm run dev` |
| Kill process | `process.kill(-pid, 'SIGTERM')` | `taskkill /pid X /f /t` |
| Path handling | Use `path.join()` everywhere | Same |

The spec handles this in ServerManager with platform detection.

---

## Testing checklist

- [ ] "Open Designer Mode" creates correct layout
- [ ] Copilot chat opens on the left
- [ ] Preview panel appears on the right
- [ ] Start button launches dev server
- [ ] Server URL is detected and iframe loads
- [ ] Stop button kills the server
- [ ] Install button runs npm install
- [ ] File browser toggle works
- [ ] Terminal toggle works
- [ ] Refresh button reloads iframe
- [ ] Works on Mac
- [ ] Works on Windows

---

## Future enhancements (out of scope for v1)

- Git controls (save/share buttons)
- Custom AI chat with prompt templates
- Multiple project support
- Deploy to Vercel button
- Browser devtools toggle
- Mobile preview mode

---

## Summary

This extension creates a simple two-panel layout:

1. **Left**: Copilot chat (native VSCode panel)
2. **Right**: Browser preview (webview with iframe) + toolbar

The toolbar has:
- Start/Stop server buttons
- Install dependencies button
- Refresh preview button
- Toggle file browser button
- Toggle terminal button

Designers press one button to start, see their work in the preview, chat with Copilot to make changes, and never need to touch the terminal unless they want to.
