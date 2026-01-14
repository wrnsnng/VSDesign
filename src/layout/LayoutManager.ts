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
