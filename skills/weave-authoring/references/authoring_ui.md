# Authoring Guide: WeaveMX UI & Dashboard Tooling

In WeaveMX, UI sidecars are decoupled from agent execution: orchestrators and subagents write canonical `weave.md` files to `runs/<context_slug>/`, and the Node.js sidecar (`sidecar_sdk`) observes the filesystem.

---

## 📂 1. Filesystem Discovery Pattern

Recursively scan `runs/<context_slug>/` to support both multi-stage and stageless layouts:

```javascript
import fs from 'node:fs';
import path from 'node:path';

export function discoverWeaveNodes(contextDir) {
  const orchStatus = path.join(contextDir, 'weave.md');
  const nodes = {
    orchestrator: fs.existsSync(orchStatus) ? parseWeaveStatusFile(orchStatus) : null,
    agents: {}
  };

  function scanDir(dir, rel = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(dir, entry.name);
      const nextRel = path.join(rel, entry.name).replace(/\\/g, '/');
      const statusFile = path.join(fullPath, 'weave.md');
      if (fs.existsSync(statusFile)) {
        nodes.agents[nextRel] = parseWeaveStatusFile(statusFile);
      } else {
        scanDir(fullPath, nextRel);
      }
    }
  }

  scanDir(contextDir);
  return nodes;
}
```

---

## 🎨 2. UI Component & Polling Conventions

* **Header & Stage Stepper**: Render context title and root orchestrator status at the top, plus a horizontal stepper when `stage<NN>_*/` directories exist.
* **Agent Cards**: Group by stage or unit cluster with status badges, elapsed runtime, auto-scrolling Markdown body logs, and a 1-click output viewer when `outputs` is set.
* **Polling**: Poll synchronous file reads every `1.5s–2.0s` while any node is `in_progress`. Pre-created stage folders and `initialized` agent states prevent 404 flickers.
