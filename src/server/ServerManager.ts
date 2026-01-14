import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as os from 'os';
import { ProxyServer } from './ProxyServer';

export class ServerManager {
  private process: ChildProcess | null = null;
  private proxy: ProxyServer | null = null;
  private outputChannel: vscode.OutputChannel;
  private onServerReady: (url: string) => void;
  private onServerStopped: () => void;
  private onFileChange: () => void;
  private devServerUrl: string | null = null;
  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private refreshTimeout: NodeJS.Timeout | null = null;

  constructor(
    onServerReady: (url: string) => void,
    onServerStopped: () => void,
    onFileChange: () => void
  ) {
    this.outputChannel = vscode.window.createOutputChannel('Designer Mode');
    this.onServerReady = onServerReady;
    this.onServerStopped = onServerStopped;
    this.onFileChange = onFileChange;
  }

  async start(workspaceFolder: string): Promise<void> {
    if (this.process) {
      return; // Already running
    }

    const isWindows = os.platform() === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const serveCommand = vscode.workspace.getConfiguration('designerMode').get<string>('serveCommand', 'npm run serve');
    const shellArgs = isWindows ? ['/c', serveCommand] : ['-c', serveCommand];

    this.process = spawn(shell, shellArgs, {
      cwd: workspaceFolder,
      env: { ...process.env },
      detached: !isWindows // Enable process group on Unix for proper cleanup
    });

    this.process.stdout?.on('data', async (data) => {
      const output = data.toString();
      this.outputChannel.append(output);

      // Parse for localhost URL
      const url = this.parseServerUrl(output);
      if (url && !this.devServerUrl) {
        this.devServerUrl = url;
        await this.startProxy(url);
      }
    });

    this.process.stderr?.on('data', (data) => {
      this.outputChannel.append(data.toString());
    });

    this.process.on('close', () => {
      this.process = null;
      this.devServerUrl = null;
      this.stopProxy();
      this.stopFileWatcher();
      this.onServerStopped();
    });

    // Start file watcher for auto-refresh
    this.startFileWatcher();
  }

  private startFileWatcher(): void {
    // Watch common source file patterns
    const pattern = '**/*.{js,jsx,ts,tsx,vue,svelte,html,css,scss,sass,less}';
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    const debouncedRefresh = () => {
      // Debounce to avoid multiple rapid refreshes
      if (this.refreshTimeout) {
        clearTimeout(this.refreshTimeout);
      }
      this.refreshTimeout = setTimeout(() => {
        this.onFileChange();
      }, 300);
    };

    this.fileWatcher.onDidChange(debouncedRefresh);
    this.fileWatcher.onDidCreate(debouncedRefresh);
    this.fileWatcher.onDidDelete(debouncedRefresh);
  }

  private stopFileWatcher(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = null;
    }
  }

  private async startProxy(targetUrl: string): Promise<void> {
    try {
      this.proxy = new ProxyServer();
      const port = await this.proxy.start(targetUrl);
      const proxyUrl = `http://localhost:${port}`;
      this.outputChannel.appendLine(`[Designer Mode] Proxy started at ${proxyUrl}`);
      this.onServerReady(proxyUrl);
    } catch (err: any) {
      this.outputChannel.appendLine(`[Designer Mode] Proxy failed: ${err.message}`);
      // Fall back to direct URL if proxy fails
      this.onServerReady(targetUrl);
    }
  }

  private stopProxy(): void {
    if (this.proxy) {
      this.proxy.stop();
      this.proxy = null;
    }
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
    this.devServerUrl = null;
    this.stopProxy();
    this.stopFileWatcher();
    this.onServerStopped();
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  private parseServerUrl(output: string): string | null {
    // Common patterns from different frameworks
    const patterns = [
      /Local:\s+(https?:\/\/localhost:\d+)/, // Vite
      /ready on (https?:\/\/localhost:\d+)/i, // Next.js
      /Server running at (https?:\/\/localhost:\d+)/i, // Generic
      /listening on (https?:\/\/localhost:\d+)/i, // Express
      /(https?:\/\/localhost:\d+)/ // Fallback
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
