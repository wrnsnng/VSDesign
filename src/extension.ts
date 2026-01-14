import * as vscode from 'vscode';
import { PreviewPanel } from './preview/PreviewPanel';
import { ServerManager } from './server/ServerManager';
import { LayoutManager } from './layout/LayoutManager';
import { runInstall } from './commands/install';
import { selectBranch, createBranch, pullChanges, publish, deleteBranch, resetChanges, getCurrentBranch } from './commands/git';
import { registerElementParticipant } from './chat/ElementParticipant';

let previewPanel: PreviewPanel | undefined;
let serverManager: ServerManager | undefined;
let layoutManager: LayoutManager | undefined;

export function activate(context: vscode.ExtensionContext) {
  layoutManager = new LayoutManager();

  // Register chat participant for @element
  registerElementParticipant(context);

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
      await runInstall(workspaceFolder, (success) => {
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

  // Helper to update branch display
  const updateBranchDisplay = () => {
    const branch = getCurrentBranch();
    previewPanel?.updateBranch(branch);
  };

  // Git commands
  const selectBranchCommand = vscode.commands.registerCommand('designerMode.selectBranch', async () => {
    await selectBranch();
    updateBranchDisplay();
  });

  const newBranchCommand = vscode.commands.registerCommand('designerMode.newBranch', async () => {
    await createBranch();
    updateBranchDisplay();
  });

  const pullCommand = vscode.commands.registerCommand('designerMode.pull', async () => {
    await pullChanges();
  });

  const publishCommand = vscode.commands.registerCommand('designerMode.publish', async () => {
    await publish();
  });

  const resetCommand = vscode.commands.registerCommand('designerMode.reset', async () => {
    await resetChanges();
  });

  const deleteBranchCommand = vscode.commands.registerCommand('designerMode.deleteBranch', async () => {
    await deleteBranch();
    updateBranchDisplay();
  });

  const getBranchCommand = vscode.commands.registerCommand('designerMode.getBranch', () => {
    updateBranchDisplay();
  });

  context.subscriptions.push(
    openCommand,
    startServerCommand,
    stopServerCommand,
    installCommand,
    toggleFilesCommand,
    toggleTerminalCommand,
    selectBranchCommand,
    newBranchCommand,
    pullCommand,
    publishCommand,
    resetCommand,
    deleteBranchCommand,
    getBranchCommand
  );
}

export function deactivate() {
  serverManager?.stop();
}
