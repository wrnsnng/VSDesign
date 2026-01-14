# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VSCode extension called "Designer Mode" that creates a simplified workspace for designers and non-technical users. The extension orchestrates VSCode's native features to present a two-panel layout: GitHub Copilot chat on the left and a live browser preview on the right.

## Build Commands

```bash
npm run build     # Bundle extension with esbuild
npm run watch     # Watch mode for development
npm run package   # Package with vsce for distribution
```

## Architecture

The extension does not build custom UI components from scratch—it orchestrates existing VSCode features:

- **AI Chat**: Opens Copilot's native chat panel via `vscode.commands.executeCommand`
- **Browser Preview**: Custom webview panel (`PreviewPanel`) containing an iframe pointing to localhost
- **Server Management**: `ServerManager` spawns/kills the dev server process and parses output for the localhost URL
- **Layout Control**: `LayoutManager` toggles visibility of sidebar, terminal, and arranges the workspace

### Project Structure

```
designer-mode/
├── src/
│   ├── extension.ts              # Entry point, command registration
│   ├── preview/
│   │   ├── PreviewPanel.ts       # Webview panel with iframe + toolbar
│   │   ├── preview.html/css/js   # Webview UI assets
│   ├── server/
│   │   ├── ServerManager.ts      # Process spawning, URL detection
│   ├── layout/
│   │   └── LayoutManager.ts      # Panel visibility toggling
│   └── commands/
│       └── install.ts            # npm install handler
└── webview-ui/                   # Built webview assets
```

### Key Extension Commands

- `designerMode.open` - Main entry: sets up layout, opens Copilot chat, creates preview panel
- `designerMode.startServer` / `designerMode.stopServer` - Dev server lifecycle
- `designerMode.install` - Runs npm install with progress notification
- `designerMode.toggleFiles` / `designerMode.toggleTerminal` - Panel visibility

### Cross-Platform Considerations

The `ServerManager` handles platform differences:
- Mac/Linux: Uses `/bin/sh -c` and `process.kill(-pid, 'SIGTERM')`
- Windows: Uses `cmd.exe /c` and `taskkill /pid X /f /t`

### Server URL Detection

`ServerManager.parseServerUrl()` matches common framework patterns:
- Vite: `Local: http://localhost:XXXX`
- Next.js: `ready on http://localhost:XXXX`
- Express: `listening on http://localhost:XXXX`
- Generic fallback: any `http://localhost:XXXX`

## Specification Reference

Full implementation details are in `_docs/designer-mode-spec-v2.md`.
