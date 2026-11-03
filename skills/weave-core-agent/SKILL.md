---
name: weave-core-agent
description: >-
  Standard WeaveMAS subagent execution protocol. Enforces CWD sandboxing,
  pre-flight verification, task lifecycle tracking, and output verification via WeaveMAS MCP status tools.
---

# 🤖 WeaveMAS Subagent Execution Protocol

All status lifecycle operations use `call_mcp_tool` with `ServerName: "weavemas_weave"`, where `dir` is strictly the **absolute path** to your assigned working directory.

---

## 1. Directory Sandbox, Zero Unnecessary Exploration (ZUE) & Execution Efficiency

* **Strict CWD Writes**: Write all scratch notes, intermediate files, and outputs strictly inside your assigned working directory (`.`). Never write to parent, sibling, or root directories.
* **Authorized Input Reads (`inputs`) & Zero Code/Binary Inspection**: Read only text files inside your working directory OR external text paths explicitly listed in your `weave.md` `inputs` (verified and returned by `weave_verify`). Never run directory scans (`dir`, `ls`, `Get-ChildItem`), repo searches, or read unassigned files (`src/`, `tests/`, `mcp_config.json`, `README.md`). Never call `view_file` on binary media files (`*.png`, `*.jpg`, `*.mp3`, `*.mp4`) to check existence—`weave_verify` already confirms file existence and size on disk.
* **Zero Runtime Script Creation & Direct Shell Execution**: Never write temporary Python or helper scripts in `scratch/` or your workspace to wrap CLI tools. Execute CLI commands directly via `run_command` (which already runs directly inside PowerShell—**never** wrap commands in `powershell -Command "..."`, as nested quoting corrupts `$LASTEXITCODE` and loop variables).
* **Parallel Tool Batching**: Always emit independent tool calls (`view_file`, `write_to_file`, `run_command`, `call_mcp_tool`) in a **single parallel turn** rather than executing them sequentially one turn at a time.
* **Immediate Fail Fast (Zero Debugging)**: If any CLI command or MCP tool returns a non-zero exit code, error, or unexpected status, **HALT immediately in the very next turn** via `weave_update` (`status: "blocked/<reason>"`). Never inspect source code, tests, or configuration files to debug tool internals.
* **No Weave File Reads/Edits**: Never inspect or edit `weave.md`, `weave_*.json`, or tool schema files via `view_file` or file-writing tools. Use `weave_verify` and `weave_update` exclusively.

---

## 2. Lifecycle Protocol (`weavemas_weave` MCP Tools)

### Step 0: Pre-flight & Input Verification (Turn 1 — Fail Fast)
Before starting any task work, verify your working directory, pre-initialized `weave.md`, and the existence of declared `inputs` files:
* `ToolName`: `"weave_verify"`, `Arguments`: `{ "dir": "<absolute_working_directory>" }`
* **Directory Resolution Hierarchy & Deferred Inputs**: `weave_verify` resolves every relative, named (`"Name: path"`), or wildcard (`*`) entry in your `weave.md` `inputs` across:
  1. Agent Directory (`.`)
  2. Run Directory (`runs/<context_slug>/` or legacy `output/<context_slug>/`)
  3. Workspace Directory (`<workspace_root>/`)
  It returns `Resolved paths` (files currently on disk mapped to their absolute path(s)) and `Pending inputs` (declared inputs that will be created by a peer agent later in the stage).
* **Task-Level Fail Fast (Zero Exploration)**: Before starting your current task, check that every input file needed for **this** task is present in `Resolved paths`. If an input required for your current task is missing or still listed in `Pending inputs`, **HALT immediately and report the error**—never search for missing files or invent workarounds.
* **Re-Verify on Wakeup from `waiting/...`**: Whenever you resume execution after a `waiting/...` state (upon receiving a `send_message` notification that upstream peer files are ready), call `weave_verify` again first so any previously `Pending inputs` (e.g. `sourced_tracks.md`) are verified on disk and resolved to full absolute paths.

### Task Progress Updates
As you start each task in your instructions, update `weave.md`:
* **Multi-Task Agents (`# Tasks`)**: Derive `<task_slug>` from each `## Task: <task_slug>` heading (e.g. `in_progress/01_research`).
* **Single-Purpose Agents (no `# Tasks` section)**: Use `"in_progress"`.
* `ToolName`: `"weave_update"`, `Arguments`:
  ```json
  {
    "dir": "<absolute_working_directory>",
    "status": "in_progress/<task_slug>",
    "progress": "<Concise summary of findings, decisions, or current work>"
  }
  ```

### Completion & Outputs Verification
Once your required output(s) are written to disk inside your working directory, mark your status `completed` (the tool automatically verifies every file or wildcard pattern exists on disk; `outputs` may be a single filename/pattern string or an array of strings):
* `ToolName`: `"weave_update"`, `Arguments`:
  ```json
  {
    "dir": "<absolute_working_directory>",
    "status": "completed",
    "outputs": "<relative_output_filename_or_array>",
    "progress": "<Final executive summary of output>"
  }
  ```
