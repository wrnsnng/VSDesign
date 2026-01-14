// @ts-check

(function () {
  console.log('[Preview] Script loaded');

  // @ts-ignore
  const vscode = acquireVsCodeApi();
  console.log('[Preview] vscode API acquired');

  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const inspectBtn = document.getElementById('inspectBtn');
  const filesBtn = document.getElementById('filesBtn');
  const terminalBtn = document.getElementById('terminalBtn');
  const status = document.getElementById('status');
  const placeholder = document.getElementById('placeholder');
  const previewContainer = document.getElementById('previewContainer');
  const preview = document.getElementById('preview');

  let inspectMode = false;

  // Git buttons
  const branchSelectBtn = document.getElementById('branchSelectBtn');
  const newBranchBtn = document.getElementById('newBranchBtn');
  const pullBtn = document.getElementById('pullBtn');
  const publishBtn = document.getElementById('publishBtn');
  const resetBtn = document.getElementById('resetBtn');
  const deleteBranchBtn = document.getElementById('deleteBranchBtn');
  const branchName = document.getElementById('branchName');

  // Button handlers
  console.log('[Preview] startBtn element:', startBtn);
  startBtn?.addEventListener('click', () => {
    console.log('[Preview] Start button clicked');
    vscode.postMessage({ type: 'start' });
    if (startBtn) startBtn.disabled = true;
    if (status) status.textContent = 'Starting...';
  });

  stopBtn?.addEventListener('click', () => {
    vscode.postMessage({ type: 'stop' });
  });

  refreshBtn?.addEventListener('click', () => {
    vscode.postMessage({ type: 'refresh' });
  });

  inspectBtn?.addEventListener('click', () => {
    inspectMode = !inspectMode;
    if (inspectMode) {
      // Send message to iframe to enable inspect mode
      // @ts-ignore
      preview?.contentWindow?.postMessage({ type: 'enableInspect' }, '*');
      inspectBtn.classList.add('active');
      inspectBtn.textContent = 'Inspecting...';
    } else {
      // Send message to iframe to disable inspect mode
      // @ts-ignore
      preview?.contentWindow?.postMessage({ type: 'disableInspect' }, '*');
      inspectBtn.classList.remove('active');
      inspectBtn.textContent = 'Inspect';
    }
  });

  filesBtn?.addEventListener('click', () => {
    vscode.postMessage({ type: 'toggleFiles' });
  });

  terminalBtn?.addEventListener('click', () => {
    vscode.postMessage({ type: 'toggleTerminal' });
  });

  // Git button handlers
  branchSelectBtn?.addEventListener('click', () => {
    vscode.postMessage({ type: 'selectBranch' });
  });

  newBranchBtn?.addEventListener('click', () => {
    vscode.postMessage({ type: 'newBranch' });
  });

  pullBtn?.addEventListener('click', () => {
    vscode.postMessage({ type: 'pull' });
  });

  publishBtn?.addEventListener('click', () => {
    vscode.postMessage({ type: 'publish' });
  });

  resetBtn?.addEventListener('click', () => {
    vscode.postMessage({ type: 'reset' });
  });

  deleteBranchBtn?.addEventListener('click', () => {
    vscode.postMessage({ type: 'deleteBranch' });
  });

  // Request current branch on load
  vscode.postMessage({ type: 'getBranch' });

  // Handle messages from extension
  window.addEventListener('message', (event) => {
    const message = event.data;

    switch (message.type) {
      case 'serverStarted':
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        if (refreshBtn) refreshBtn.disabled = false;
        if (inspectBtn) inspectBtn.disabled = false;
        if (status) status.textContent = `Running at ${message.url}`;
        if (placeholder) placeholder.style.display = 'none';
        if (previewContainer) previewContainer.style.display = 'block';
        if (preview) {
          // @ts-ignore
          preview.src = message.url;
        }
        break;

      case 'serverStopped':
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (refreshBtn) refreshBtn.disabled = true;
        if (inspectBtn) {
          inspectBtn.disabled = true;
          inspectBtn.classList.remove('active');
          inspectBtn.textContent = 'Inspect';
        }
        inspectMode = false;
        if (status) status.textContent = 'Server stopped';
        if (placeholder) placeholder.style.display = 'flex';
        if (previewContainer) previewContainer.style.display = 'none';
        if (preview) {
          // @ts-ignore
          preview.src = '';
        }
        break;

      case 'inspectorReady':
        // Inspector script loaded in iframe - ready to accept commands
        console.log('[Preview] Inspector ready in iframe');
        break;

      case 'elementSelected':
        // This comes from the Inspector - forward to extension
        vscode.postMessage({ type: 'elementSelected', data: message.data });
        break;

      case 'inspectorError':
        // Inspector couldn't access iframe - disable inspect mode
        if (inspectBtn) {
          inspectBtn.classList.remove('active');
          inspectBtn.textContent = 'Inspect';
        }
        inspectMode = false;
        vscode.postMessage({ type: 'inspectorError', message: message.message });
        break;

      case 'refresh':
        if (preview) {
          // @ts-ignore
          preview.src = preview.src;
        }
        break;

      case 'error':
        if (status) status.textContent = message.text;
        if (startBtn) startBtn.disabled = false;
        break;

      case 'branchUpdate':
        if (branchName) {
          branchName.textContent = message.branch ? `Active branch: ${message.branch}` : '';
        }
        break;
    }
  });
})();
