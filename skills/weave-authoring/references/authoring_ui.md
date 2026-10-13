# Authoring Guide: WeaveMAS UI & Dashboard Tooling

This guide details how to build **Sidecar Extensions, Web Panels, and Real-Time Dashboards** that consume WeaveMAS filesystem states.

---

## 🏗️ 1. Architecture: The Decoupled State Pattern

In WeaveMAS, the UI is completely decoupled from agent execution:
* **Agents write to disk**: Orchestrator and worker subagents update canonical `status.md` files.
* **UI observes disk**: A Node.js Sidecar (using `SidecarApp` from `sidecar_sdk`) scans `output/<context_slug>/` and serves a reactive web view to the IDE side pane.

---

## 📂 2. Backend Filesystem Traversal Pattern

Implement recursive traversal that seamlessly supports optional stages and nested agent groups:

```javascript
import fs from 'node:fs';
import path from 'node:path';

export function discoverWeaveNodes(contextDir) {
  const nodes = {
    orchestrator: null,
    stages: {},
    agents: {}
  };

  // 1. Read orchestrator status
  const orchStatusPath = path.join(contextDir, 'status.md');
  if (fs.existsSync(orchStatusPath)) {
    nodes.orchestrator = parseWeaveStatusFile(orchStatusPath);
  }

  // 2. Recursively find all status.md files
  function scanDir(currentDir, relativePath = '') {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const rel = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        const subStatus = path.join(fullPath, 'status.md');
        if (fs.existsSync(subStatus)) {
          const parsed = parseWeaveStatusFile(subStatus);
          const key = rel.replace(/\\/g, '/');
          nodes.agents[key] = parsed;
        } else {
          scanDir(fullPath, rel);
        }
      }
    }
  }

  scanDir(contextDir);
  return nodes;
}
```

---

## 🎨 3. UI Component Patterns

### A. Stage Stepper & Orchestrator Header
* Display the context title and orchestrator status at the very top.
* If multiple stages are detected, render a horizontal stepper with stage dots (`pending`, `in_progress`, `completed`).

### B. Hierarchical Agent Accordion
* Nest agent cards by `<stage_slug>` or `<agent_groups>` (e.g. grouped by Act or Segment).
* Include a quick-glance status badge on the summary line.

### C. Agent Card Details
When an agent card is expanded, render role-specific visualizations:
* **Deliverable Action**: If `deliverable` is populated in frontmatter, display a 1-click button (e.g. `📄 Open Draft` or `📁 Open Assets`).
* **Architect**: Bulleted list of narrative beats.
* **Writer**: Draft switcher buttons (`v1`, `v2`) with measured word count vs target.
* **Auditor / Fact Checker**: Claim cards highlighting verified (`✓`) vs flagged (`⚠`) claims.

---

## 🔄 4. Real-Time Polling Best Practices
* **Direct Reads**: Always use synchronous or freshly resolved file reads to prevent OS file caching.
* **Polling Loop**: Trigger `refreshData()` every 1.5s–2.0s while an active agent is in `in_progress`.
* **Zero Race Conditions**: Because orchestrators initialize `not_started` before spawning, the UI will never flicker with 404s or stale prior runs.
