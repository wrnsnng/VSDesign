import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as os from 'os';

export async function runInstall(
  workspaceFolder: string,
  onComplete: (success: boolean, error?: string) => void
): Promise<void> {
  const isWindows = os.platform() === 'win32';
  const shell = isWindows ? 'cmd.exe' : '/bin/sh';
  const installCommand = vscode.workspace.getConfiguration('designerMode').get<string>('installCommand', 'npm install');
  const shellArgs = isWindows ? ['/c', installCommand] : ['-c', installCommand];

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
            vscode.window.setStatusBarMessage('$(check) Dependencies installed', 3000);
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
