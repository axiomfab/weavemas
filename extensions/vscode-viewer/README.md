# WeaveMX Viewer (`weavemx-viewer`)

Lightweight VS Code Custom Editor extension that opens the WeaveMX pipeline dashboard natively whenever you open any `weave.md` file (or click `[weave.md](file:///...)` in chat) in Antigravity IDE, VS Code, Cursor, or Windsurf.

## Features

- **Zero-Server Custom Editor (`**/weave.md`)**: Reuses `sidecars/panel/lib/*` and `sidecars/panel/trackers/*` directly in the Extension Host and Webview with zero `localhost` HTTP ports and zero external npm dependencies.
- **Event-Driven Live Sync**: Pushes real-time pipeline updates via VS Code's `FileSystemWatcher` on `**/weave.md` with zero polling and zero LLM tokens.
- **1-Click Raw Markdown Toggle**: Switch seamlessly between the interactive WeaveMX UI and raw `weave.md` Markdown via the **View Raw Markdown** button in the panel header or the editor tab title bar.

## Build & Install

From the repository root:

```bash
npm run build:vsix
code --install-extension extensions/vscode-viewer/weavemx-viewer.vsix
```
