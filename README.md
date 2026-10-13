# 🧶 WeaveMAS: Antigravity Plugin & MCP Server

**WeaveMAS** is an architecture and plugin for building observable, deterministic multi-agent systems in **Google Antigravity 2.0**.

By combining file-based state machines (`status.md`) with a lightweight, native Model Context Protocol (MCP) server, WeaveMAS completely decouples subagent status reporting from shell access (`run_command`), enforcing strict directory sandboxing and zero unnecessary repository exploration.

---

## 🚀 Key Features

* **Zero Shell Execution**: Subagents manage their lifecycle entirely via native, typed MCP tools (`weave__status_update`, `weave__status_verify`) without requiring shell access.
* **Granular Tool Whitelisting**: Subagents use `inheritCustomizations: false` to isolate themselves from ambient parent tools, whitelisting only the exact Weave status tools they need.
* **Deterministic Sandboxing**: Subagent directories are self-contained working spaces.
* **Instant Observability**: Real-time status, progress logs, and deliverable verification are serialized to standard `status.md` files observable by the UI and tracker sidecars.
* **Zero npm Dependencies**: Pure native Node.js (standard library only).

---

## 🛠️ MCP Tools

When mounted by Antigravity under the `weave` identifier, the following tools are available:

| Tool | Description | Required Arguments |
| :--- | :--- | :--- |
| `weave__status_init` | Initializes `status.md` in a directory with `not_started` state | `role`, `dir` (optional, defaults to CWD) |
| `weave__status_update` | Updates state (`in_progress/*`, `waiting/*`, `completed`) and appends progress notes | `status`, `progress` (opt), `deliverable` (opt) |
| `weave__status_verify` | Pre-flight verification that the directory's `status.md` matches assigned role | `expected_role`, `dir` (optional) |

---

## 🤖 Subagent Frontmatter Configuration

To equip an Antigravity custom subagent with WeaveMAS:

```yaml
---
name: "stage2_showrunner"
description: "Showrunner subagent that designs structural concept outline."
subagent: true
inheritCustomizations: false
skills:
  - "weave-core-agent"
tools:
  - "view_file"
  - "search_web"
  - "weave__status_verify"
  - "weave__status_update"
---

# Showrunner Agent

Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.

## Role Specifics
* **Deliverable Target**: Save your finalized show concept to `concept.md`.
```

---

## 🧪 Testing

Run native test suite:
```bash
npm test
```
