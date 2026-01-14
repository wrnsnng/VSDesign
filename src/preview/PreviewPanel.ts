import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface SelectedElement {
  x: number;
  y: number;
  tagName: string | null;
  id: string | null;
  classList: string[];
  outerHTML: string | null;
  textContent: string | null;
  computedStyles: Record<string, string> | null;
}

export class PreviewPanel {
  public static currentPanel: PreviewPanel | undefined;
  public static selectedElement: SelectedElement | null = null;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private serverUrl: string | null = null;
  private disposed = false;

  constructor(context: vscode.ExtensionContext, column: vscode.ViewColumn) {
    this.extensionUri = context.extensionUri;

    this.panel = vscode.window.createWebviewPanel(
      'designerModePreview',
      'Preview',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'src', 'preview'),
          vscode.Uri.joinPath(context.extensionUri, 'dist')
        ]
      }
    );

    this.panel.webview.html = this.getHtmlContent();
    this.panel.webview.onDidReceiveMessage(this.handleMessage.bind(this));

    PreviewPanel.currentPanel = this;

    this.panel.onDidDispose(() => {
      this.disposed = true;
      PreviewPanel.currentPanel = undefined;
    });
  }

  private handleMessage(message: { type: string; data?: SelectedElement; message?: string }) {
    switch (message.type) {
      case 'start':
        vscode.commands.executeCommand('designerMode.startServer');
        break;
      case 'stop':
        vscode.commands.executeCommand('designerMode.stopServer');
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
      case 'selectBranch':
        vscode.commands.executeCommand('designerMode.selectBranch');
        break;
      case 'newBranch':
        vscode.commands.executeCommand('designerMode.newBranch');
        break;
      case 'pull':
        vscode.commands.executeCommand('designerMode.pull');
        break;
      case 'publish':
        vscode.commands.executeCommand('designerMode.publish');
        break;
      case 'reset':
        vscode.commands.executeCommand('designerMode.reset');
        break;
      case 'deleteBranch':
        vscode.commands.executeCommand('designerMode.deleteBranch');
        break;
      case 'getBranch':
        vscode.commands.executeCommand('designerMode.getBranch');
        break;
      case 'elementSelected':
        if (message.data) {
          PreviewPanel.selectedElement = message.data;
          const clipboardText = this.formatElementForClipboard(message.data);
          vscode.env.clipboard.writeText(clipboardText);

          const elementDesc = message.data.tagName
            ? `<${message.data.tagName}${message.data.id ? '#' + message.data.id : ''}>`
            : `position (${message.data.x}, ${message.data.y})`;
          vscode.window.setStatusBarMessage(`$(check) ${elementDesc} copied`, 2000);
        }
        break;
      case 'inspectorError':
        vscode.window.showErrorMessage('Cannot inspect preview - cross-origin restriction. The dev server must run on localhost.');
        break;
    }
  }

  public setServerUrl(url: string) {
    if (this.disposed) return;
    this.serverUrl = url;
    this.panel.webview.postMessage({ type: 'serverStarted', url });
  }

  public setServerStopped() {
    if (this.disposed) return;
    this.serverUrl = null;
    this.panel.webview.postMessage({ type: 'serverStopped' });
  }

  public refresh() {
    if (this.disposed) return;
    if (this.serverUrl) {
      this.panel.webview.postMessage({ type: 'refresh' });
    }
  }

  public postMessage(message: { type: string; text?: string }) {
    if (this.disposed) return;
    this.panel.webview.postMessage(message);
  }

  public updateBranch(branch: string | null) {
    if (this.disposed) return;
    this.panel.webview.postMessage({ type: 'branchUpdate', branch });
  }

  private formatElementForClipboard(element: SelectedElement): string {
    const parts: string[] = [];

    // Build selector
    if (element.tagName) {
      let selector = element.tagName;
      if (element.id) selector += `#${element.id}`;
      if (element.classList.length > 0) selector += `.${element.classList.join('.')}`;
      parts.push(`[Element: ${selector}]`);
    }

    // Add HTML
    if (element.outerHTML) {
      parts.push('');
      parts.push(element.outerHTML);
    }

    // Add context note for LLM
    parts.push('');
    parts.push('---');
    parts.push('The user\'s request below refers to the element above.');
    parts.push('---');
    parts.push('');

    return parts.join('\n');
  }

  private getHtmlContent(): string {
    const webview = this.panel.webview;

    // Get URIs for resources
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'preview', 'preview.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'preview', 'preview.js')
    );

    // Read HTML template
    const htmlPath = vscode.Uri.joinPath(
      this.extensionUri,
      'src',
      'preview',
      'preview.html'
    );
    let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

    // Replace placeholders
    const cspSource = webview.cspSource;
    html = html.replace(/\${cspSource}/g, cspSource);
    html = html.replace(/\${styleUri}/g, styleUri.toString());
    html = html.replace(/\${scriptUri}/g, scriptUri.toString());

    return html;
  }
}
