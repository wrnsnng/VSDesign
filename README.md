# Designer Mode

A VS Code extension that creates a simplified workspace for designers doing AI prototyping with GitHub Copilot.

## What it does

Designer Mode creates a focused workspace with:
- **GitHub Copilot Chat** for AI-assisted development
- **Live preview** of your application with element inspector

This setup lets designers iterate on UI changes by describing what they want in natural language, seeing the results instantly, and selecting specific elements to reference in follow-up prompts.

## Features

### Live Preview
- Embedded preview of your dev server (Vite, Next.js, etc.)
- Auto-detects when the server is ready
- Refresh button to reload the preview

### Element Inspector
- Click "Inspect" to enter inspection mode
- Hover over elements to highlight them
- Click an element to copy its HTML to clipboard
- Paste into Copilot Chat as context for your next prompt

### Git Workflow
- **View all branches**: Switch between existing branches
- **New branch**: Create a new branch (auto-stashes uncommitted changes)
- **Update branch**: Pull latest changes from remote
- **Publish**: Commit and push all changes with a single click
- **Reset branch**: Discard all uncommitted changes
- **Delete branch**: Remove the current branch

### Quick Toggles
- **Files**: Show/hide the file explorer
- **Terminal**: Show/hide the terminal panel

## Installation

### From Source

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Press `F5` in VS Code to launch the Extension Development Host

### From VSIX

1. Download the `.vsix` file from Releases
2. In VS Code, open the Command Palette (`Cmd+Shift+P`)
3. Run "Extensions: Install from VSIX..."
4. Select the downloaded file

## Usage

1. Open a project that has a `package.json`
2. Press `Cmd+Shift+D` (Mac) or `Ctrl+Shift+D` (Windows/Linux)
3. Click "Start preview" to launch your dev server
4. Use Copilot Chat to describe changes
5. Click "Inspect" to select elements and add them as context

## Configuration

Configure in VS Code Settings or `.vscode/settings.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| `designerMode.serveCommand` | `npm run serve` | Command to start the dev server |
| `designerMode.installCommand` | `npm install` | Command to install dependencies |
| `designerMode.branchTemplate` | `{user}-prototype-{date}-{time}` | Template for new branch names |
| `designerMode.branchUser` | `USER` | Your handle/initials for branch names |

### Branch Template Placeholders

- `{user}` - Replaced with `branchUser` setting
- `{date}` - Current date (YYYY-MM-DD)
- `{time}` - Current time (HHMM)

### Example: Team Configuration

```json
{
  "designerMode.serveCommand": "yarn dev",
  "designerMode.installCommand": "yarn install",
  "designerMode.branchUser": "MOB",
  "designerMode.branchTemplate": "{user}/prototype-{date}"
}
```

### Example: Using pnpm

```json
{
  "designerMode.serveCommand": "pnpm run dev",
  "designerMode.installCommand": "pnpm install"
}
```

## Requirements

- VS Code 1.85.0 or later
- GitHub Copilot Chat extension
- A project with a dev server (Vite, Next.js, Create React App, etc.)

## How the Element Inspector Works

The extension runs a local proxy server that:
1. Forwards requests to your dev server
2. Injects a small script into HTML responses
3. Enables element selection without cross-origin issues

This means your dev server can run on any port, and the inspector will work seamlessly.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+D` / `Ctrl+Shift+D` | Open Designer Mode |

## Development

```bash
# Install dependencies
npm install

# Build once
npm run build

# Watch for changes
npm run watch

# Package as VSIX
npm run package
```

## License

MIT
