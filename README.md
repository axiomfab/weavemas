# 🧶 WeaveMAS: Antigravity Plugin & MCP Server

**WeaveMAS** is an architecture and plugin for building observable, deterministic multi-agent systems in **Google Antigravity 2.0**.

By combining file-based state machines (`weave.md`) with a lightweight, native Model Context Protocol (MCP) server, WeaveMAS decouples status reporting and observability from ad-hoc manual scripts, enforcing strict directory sandboxing and zero unnecessary repository exploration.

---

## 🚀 Key Features

* **Pure Native MCP Tooling**: Subagents manage their lifecycle entirely via native MCP tools (`weave_verify`, `weave_update`) via `call_mcp_tool`. Zero CLI wrappers or secondary runner scripts.
* **Declarative Agent Definitions**: Subagents declare `inheritCustomizations: true`, `inheritMcp: true`, and mount `skills: [weave-core-agent]`.
* **Deterministic Sandboxing**: Subagent directories are self-contained working spaces.
* **Instant Observability**: Real-time status, progress logs, and output verification are serialized to standard `weave.md` files observable by the UI and tracker sidecars.
* **Zero npm Dependencies**: Pure native Node.js (standard library only).

---

## 🛠️ MCP Tools (`weavemas_weave`)

When mounted by Antigravity under the `weavemas_weave` identifier, the following tools are available:

| Tool | Description | Required Arguments |
| :--- | :--- | :--- |
| `weave_init` | Initializes `weave.md` in a directory with `not_started` state | `dir` (required absolute path) |
| `weave_update` | Updates state (`in_progress/*`, `waiting/*`, `completed`) and appends progress notes | `status`, `dir` (required absolute path), `progress` (opt), `outputs` (opt) |
| `weave_verify` | Pre-flight verification that the directory's `weave.md` matches assigned role | `dir` (required absolute path), `expected_role` (opt) |
| `weave_read` | Ingests agent status, verify completed state, and resolves outputs | `dir` (required absolute path) |

---

## 🤖 Subagent Frontmatter Configuration

To equip an Antigravity custom subagent with WeaveMAS:

```yaml
---
name: "stage1_director"
description: "Director subagent that selects persona and sets show guidelines."
model: flash
subagent: true
inheritCustomizations: true
inheritMcp: true
skills:
  - "weave-core-agent"
tools:
  - "view_file"
  - "search_web"
  - "write_to_file"
  - "run_command"
---

# Director Agent

Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.

## Role Specifics
* **Output Target**: Save your finalized setup document to `setup.md`.
```

---

## 🖥️ WeaveMAS UI (Sidecar Observer)

WeaveMAS includes a real-time reactive auxiliary side pane observer:
* **Directory**: `sidecars/panel/`
* **Features**:
  * **Interactive Agent Cards**: Hierarchical tree visualization of all subagents discovered across pipeline stages (`agent_panel.js`).
  * **Output Inspection**: 1-click toggle to inspect output files directly in the card.
  * **Runtime Tracking**: Displays elapsed active runtime on the left and last updated time on the right.
  * **Auto-Scrolling Log View**: Auto-scrolls to the newest updates and preserves reading scroll positions during background polling.
  * **Pipeline Stepper**: Real-time status indicators reflecting stage progress.

---

## Documentation & Tutorials

* **[Architecture Guide & Multi-Agent Tutorial](docs/TUTORIAL.md)**: Comprehensive deep dive into WeaveMAS architecture, state contracts, CWD sandboxing, and an end-to-end tutorial creating an illustrated **KidsWiki** multi-agent pipeline (Writer, Fact Checker, Illustrator) with age parameterization and image referencing.

---

## 🧪 Testing

Run native test suite:
```bash
npm test
```

