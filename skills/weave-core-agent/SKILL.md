---
name: weave-core-agent
description: >-
  Standard WeaveMAS subagent execution protocol. Enforces CWD sandboxing,
  pre-flight verification, task lifecycle tracking, and deliverable verification via WeaveMAS MCP status tools.
---

# 🤖 WeaveMAS Subagent Execution Protocol

All status lifecycle operations use `call_mcp_tool` with `ServerName: "weavemas_weave"`, where `dir` is strictly the **absolute path** to your assigned working directory.

---

## 1. Directory Sandbox & Zero Unnecessary Exploration (ZUE)

* **Strict CWD Writes**: Write all scratch notes, intermediate files, and deliverables strictly inside your assigned working directory (`.`). Never write to parent, sibling, or root directories.
* **Authorized Input Reads (`inputs`)**: Read only files inside your working directory OR external paths explicitly listed in your `status.md` `inputs` (verified and returned by `status_verify`). Never run directory scans (`dir`, `ls`, `Get-ChildItem`), repo searches, or read unassigned files.
* **No Status File Reads/Edits**: Never inspect or edit `status.md`, `status_*.json`, or tool schema files via `view_file` or file-writing tools. Use `status_verify` and `status_update` exclusively.

---

## 2. Lifecycle Protocol (`weavemas_weave` MCP Tools)

### Step 0: Pre-flight & Input Verification (Turn 1 — Fail Fast)
Before starting any task work, verify your working directory, pre-initialized `status.md`, and the existence of all declared `inputs` files:
* `ToolName`: `"status_verify"`, `Arguments`: `{ "dir": "<absolute_working_directory>" }`
* **Fail Fast**: `status_verify` automatically verifies that every file path in your `status.md` `inputs` exists on disk and returns your verified `inputs` list. If `status_verify` fails (e.g. a required input file is missing), **HALT immediately and report the error**—never search for missing files or invent workarounds.

### Task Progress Updates
As you start each task in your instructions, update `status.md`:
* **Multi-Task Agents (`# Tasks`)**: Derive `<task_slug>` from each `## Task: <task_slug>` heading (e.g. `in_progress/01_research`).
* **Single-Purpose Agents (no `# Tasks` section)**: Use `"in_progress"`.
* `ToolName`: `"status_update"`, `Arguments`:
  ```json
  {
    "dir": "<absolute_working_directory>",
    "status": "in_progress/<task_slug>",
    "progress": "<Concise summary of findings, decisions, or current work>"
  }
  ```

### Completion & Deliverable Verification
Once your required deliverable is written to disk inside your working directory, mark your status `completed` (the tool automatically verifies the file exists on disk):
* `ToolName`: `"status_update"`, `Arguments`:
  ```json
  {
    "dir": "<absolute_working_directory>",
    "status": "completed",
    "deliverable": "<relative_deliverable_filename>",
    "progress": "<Final executive summary of output>"
  }
  ```
