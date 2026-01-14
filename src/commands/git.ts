import * as vscode from 'vscode';
import { execFileSync, spawn } from 'child_process';

function getWorkspaceFolder(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function execGit(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

export function getCurrentBranch(): string | null {
  const cwd = getWorkspaceFolder();
  if (!cwd) return null;

  try {
    return execGit(['branch', '--show-current'], cwd);
  } catch {
    return null;
  }
}

export function getAllBranches(): string[] {
  const cwd = getWorkspaceFolder();
  if (!cwd) return [];

  try {
    const output = execGit(['branch', '-a'], cwd);
    return output
      .split('\n')
      .map(b => b.replace('*', '').trim())
      .filter(b => b && !b.includes('HEAD'));
  } catch {
    return [];
  }
}

function getDefaultBranch(cwd: string): string | null {
  try {
    // Try to get from remote HEAD
    const ref = execGit(['symbolic-ref', 'refs/remotes/origin/HEAD'], cwd);
    return ref.replace('refs/remotes/origin/', '');
  } catch {
    // Fallback: try common branch names
    const commonBranches = ['main', 'master', 'develop', 'dev'];
    const branches = getAllBranches();
    const currentBranch = getCurrentBranch();

    // Try common names first
    for (const name of commonBranches) {
      if (branches.some(b => b === name || b === `remotes/origin/${name}`)) {
        return name;
      }
    }

    // Last resort: pick any branch that isn't current
    const fallback = branches.find(b => b !== currentBranch && !b.includes('remotes/'));
    return fallback || null;
  }
}

function hasRemote(cwd: string): boolean {
  try {
    const remotes = execGit(['remote'], cwd);
    return remotes.includes('origin');
  } catch {
    return false;
  }
}

function getCompareUrl(cwd: string, currentBranch: string, defaultBranch: string): string | null {
  try {
    const remoteUrl = execGit(['remote', 'get-url', 'origin'], cwd);

    // Parse GitHub URL (handles both HTTPS and SSH)
    // https://github.com/owner/repo.git or git@github.com:owner/repo.git
    let match = remoteUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(\.git)?$/);
    if (match) {
      const owner = match[1];
      const repo = match[2];
      return `https://github.com/${owner}/${repo}/compare/${defaultBranch}...${currentBranch}`;
    }

    return null;
  } catch {
    return null;
  }
}

export async function selectBranch(): Promise<void> {
  const cwd = getWorkspaceFolder();
  if (!cwd) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const branches = getAllBranches();
  const currentBranch = getCurrentBranch();

  const items = branches.map(b => ({
    label: b === currentBranch ? `● ${b}` : b,
    description: b === currentBranch ? '(current)' : '',
    branch: b.replace('remotes/origin/', '')
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a branch to switch to'
  });

  if (!selected) return;

  try {
    // Fetch latest first
    execGit(['fetch'], cwd);

    // Auto-stash any uncommitted changes
    let stashed = false;
    try {
      const status = execGit(['status', '--porcelain'], cwd);
      if (status) {
        execGit(['stash', 'push', '-m', `Auto-stash before switching to ${selected.branch}`], cwd);
        stashed = true;
      }
    } catch {
      // No changes to stash, continue
    }

    // Checkout the branch
    const branchName = selected.branch;
    try {
      execGit(['checkout', branchName], cwd);
    } catch {
      // If local branch doesn't exist, create it from remote
      execGit(['checkout', '-b', branchName, `origin/${branchName}`], cwd);
    }

    // Pop stash if we stashed changes
    if (stashed) {
      try {
        execGit(['stash', 'pop'], cwd);
        vscode.window.setStatusBarMessage(`$(check) Switched to ${branchName} (changes restored)`, 3000);
      } catch {
        vscode.window.setStatusBarMessage(`$(warning) Switched to ${branchName} - run 'git stash pop' to restore changes`, 5000);
      }
    } else {
      vscode.window.setStatusBarMessage(`$(check) Switched to ${branchName}`, 3000);
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to switch branch: ${err.message}`);
  }
}

export async function createBranch(): Promise<void> {
  const cwd = getWorkspaceFolder();
  if (!cwd) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  // Generate branch name from template
  const config = vscode.workspace.getConfiguration('designerMode');
  const template = config.get<string>('branchTemplate', '{user}-prototype-{date}-{time}');
  const user = config.get<string>('branchUser', 'USER');

  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const timeStr = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;

  const defaultName = template
    .replace('{user}', user)
    .replace('{date}', dateStr)
    .replace('{time}', timeStr);

  const branchName = await vscode.window.showInputBox({
    prompt: 'Enter branch name',
    value: defaultName
  });

  if (!branchName) return;

  try {
    execGit(['checkout', '-b', branchName], cwd);
    vscode.window.setStatusBarMessage(`$(check) Created branch: ${branchName}`, 3000);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to create branch: ${err.message}`);
  }
}

export async function publish(): Promise<void> {
  const cwd = getWorkspaceFolder();
  if (!cwd) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  // Check if there are changes
  try {
    const status = execGit(['status', '--porcelain'], cwd);
    if (!status) {
      vscode.window.setStatusBarMessage('$(info) No changes to publish', 3000);
      return;
    }
  } catch {
    // Continue anyway
  }

  const message = await vscode.window.showInputBox({
    prompt: 'Enter commit message',
    value: 'Update prototype',
    placeHolder: 'Describe your changes'
  });

  if (!message) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Publishing changes...',
      cancellable: false
    },
    async () => {
      try {
        // Stage all changes
        execGit(['add', '-A'], cwd);

        // Commit
        execGit(['commit', '-m', message], cwd);

        // Push only if remote exists
        if (hasRemote(cwd)) {
          const currentBranch = getCurrentBranch();
          try {
            execGit(['push'], cwd);
          } catch {
            execGit(['push', '--set-upstream', 'origin', currentBranch || 'HEAD'], cwd);
          }

          // Show compare URL if available
          const defaultBranch = getDefaultBranch(cwd);
          if (currentBranch && defaultBranch) {
            const compareUrl = getCompareUrl(cwd, currentBranch, defaultBranch);
            if (compareUrl) {
              const action = await vscode.window.showInformationMessage(
                'Changes published!',
                'Open Compare Link'
              );
              if (action === 'Open Compare Link') {
                vscode.env.openExternal(vscode.Uri.parse(compareUrl));
              }
            } else {
              vscode.window.setStatusBarMessage('$(check) Changes published', 3000);
            }
          } else {
            vscode.window.setStatusBarMessage('$(check) Changes published', 3000);
          }
        } else {
          vscode.window.setStatusBarMessage('$(check) Committed locally (no remote)', 3000);
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to publish: ${err.message}`);
      }
    }
  );
}

export async function resetChanges(): Promise<void> {
  const cwd = getWorkspaceFolder();
  if (!cwd) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  // Check if there are changes
  try {
    const status = execGit(['status', '--porcelain'], cwd);
    if (!status) {
      vscode.window.setStatusBarMessage('$(info) No changes to reset', 3000);
      return;
    }
  } catch {
    // Continue anyway
  }

  const confirm = await vscode.window.showWarningMessage(
    'Discard ALL uncommitted changes? This cannot be undone.',
    { modal: true },
    'Discard Changes'
  );

  if (confirm !== 'Discard Changes') return;

  try {
    // Reset all changes (staged and unstaged)
    execGit(['reset', '--hard', 'HEAD'], cwd);
    // Also clean untracked files
    execGit(['clean', '-fd'], cwd);
    vscode.window.setStatusBarMessage('$(check) All changes discarded', 3000);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to reset: ${err.message}`);
  }
}

export async function pullChanges(): Promise<void> {
  const cwd = getWorkspaceFolder();
  if (!cwd) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  if (!hasRemote(cwd)) {
    vscode.window.setStatusBarMessage('$(info) No remote configured', 3000);
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Pulling latest changes...',
      cancellable: false
    },
    async () => {
      try {
        // Fetch and pull
        execGit(['pull'], cwd);
        vscode.window.setStatusBarMessage('$(check) Pulled latest changes', 3000);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to pull: ${err.message}`);
      }
    }
  );
}

export async function deleteBranch(): Promise<void> {
  const cwd = getWorkspaceFolder();
  if (!cwd) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const currentBranch = getCurrentBranch();

  if (!currentBranch) {
    vscode.window.showErrorMessage('Could not determine current branch');
    return;
  }

  // Get default branch to switch to
  let defaultBranch = getDefaultBranch(cwd);

  if (currentBranch === defaultBranch) {
    vscode.window.showErrorMessage(`Cannot delete the default branch (${defaultBranch})`);
    return;
  }

  // If no other branch exists, offer to rename to main
  if (!defaultBranch) {
    if (currentBranch === 'main') {
      vscode.window.showErrorMessage('Cannot delete the main branch');
      return;
    }

    const renameToMain = await vscode.window.showWarningMessage(
      `No other branch exists. Rename "${currentBranch}" to "main"?`,
      { modal: true },
      'Rename to main'
    );

    if (renameToMain !== 'Rename to main') return;

    try {
      // Rename current branch to main
      execGit(['branch', '-m', 'main'], cwd);
      vscode.window.setStatusBarMessage('$(check) Renamed branch to main', 3000);
      return;
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to rename branch: ${err.message}`);
      return;
    }
  } else {
    const confirm = await vscode.window.showWarningMessage(
      `Delete branch "${currentBranch}"? This will switch to ${defaultBranch} first.`,
      { modal: true },
      'Delete'
    );

    if (confirm !== 'Delete') return;
  }

  try {
    // Switch to default branch first
    execGit(['checkout', defaultBranch], cwd);

    // Delete local branch
    execGit(['branch', '-D', currentBranch], cwd);

    // Try to delete remote branch
    try {
      execGit(['push', 'origin', '--delete', currentBranch], cwd);
    } catch {
      // Remote branch might not exist, that's ok
    }

    vscode.window.setStatusBarMessage(`$(check) Deleted branch: ${currentBranch}`, 3000);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to delete branch: ${err.message}`);
  }
}
