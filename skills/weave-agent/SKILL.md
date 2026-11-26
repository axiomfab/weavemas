---
name: weave-agent
description: >-
  Standard WeaveMX subagent execution protocol with inline weavemx_weave MCP
  signatures, CWD sandboxing, Turn-1 pre-flight verification, and 1-line chat acks.
---

# 🤖 WeaveMX Subagent Execution Protocol

All status lifecycle operations use `call_mcp_tool` with `ServerName: "weavemx_weave"`, where `dir` is strictly the **absolute path** to your assigned working directory.

## 0. Inline `weavemx_weave` MCP Signatures (`ServerName: "weavemx_weave"`)
* `weave_verify`: `{"dir": string, "expected_role"?: string}`
* `weave_update`: `{"dir": string, "status"?: string, "type"?: "agent"|"orchestrator", "progress"?: string, "outputs"?: string|string[], "conversation_id"?: string, "mirror_to"?: string}` *(subagents omit `type`, `conversation_id`, and `mirror_to`)*
* **Zero Schema / Weave Reads**: Do **NOT** call `read_file` / `view_file` on `<appDataDir>/mcp/weavemx_weave/*.json` unless an unexpected schema error occurs, and never inspect or edit `weave.md` directly.

---

## 1. Directory Sandbox, Zero Unnecessary Exploration (ZUE) & Efficiency

* **Strict CWD Writes**: Write all scratch notes, intermediate files, and outputs strictly inside your assigned working directory (`.`). Never write to parent, sibling, or root directories.
* **Authorized Input Reads (`inputs`) & Zero Binary/Code Scans**: Read only text files inside your working directory OR paths explicitly listed in your `weave.md` `inputs` (verified and returned by `weave_verify`). Never run directory scans (`dir`, `ls`, `Get-ChildItem`), repo searches, or read unassigned files (`src/`, `tests/`, `mcp_config.json`, `README.md`), and never call `view_file` on binary media (`*.png`, `*.jpg`, `*.mp3`, `*.mp4`) to check existence.
* **Direct Shell Execution (Zero Wrapper Scripts)**: Never write temporary Python/helper scripts to wrap CLI tools. Run CLI commands directly via `run_command` (already inside PowerShell—never wrap in `powershell -Command "..."`).
* **Parallel Tool Batching**: Emit independent tool calls (`view_file`, `write_to_file`, `run_command`, `call_mcp_tool`) in a **single parallel turn**.
* **Immediate Fail Fast (Zero Debugging)**: On any non-zero exit code, tool error, or unexpected status, **HALT immediately in the next turn** via `weave_update` (`{"dir": "<abs_wd>", "status": "blocked/<reason>", "progress": "<error>"}`). Never debug tool internals.

---

## 2. Lifecycle Protocol

1. **Step 0 — Turn-1 Pre-Flight Verification**:
   Call `weave_verify`: `{"dir": "<absolute_working_directory>"}`. `weave_verify` substitutes explicit `${PROJECT_DIR}`, `${RUN_DIR}`, and `${AGENT_DIR}` variables and resolves relative/wildcard entries strictly against your CWD, returning `Resolved paths` and `Pending inputs`.
   - **Task-Level Fail Fast**: Verify every input required for your **current** task is in `Resolved paths`. If missing or still in `Pending inputs`, **HALT immediately and report the error**—never search for missing files.
   - **Wakeup from `waiting/...`**: On `send_message` resume after `waiting/...`, call `weave_verify` first to resolve newly produced peer inputs.
2. **Task Progress Updates**:
   - Multi-task agents (`# Tasks`): `{"dir": "<absolute_working_directory>", "status": "in_progress/<task_slug>", "progress": "<Concise summary>"}` (where `<task_slug>` matches `## Task: <task_slug>`).
   - Single-purpose agents (no `# Tasks`): use `"status": "in_progress"`.
3. **Completion & Outputs Verification**:
   Once required local output(s) exist in `.`, call `weave_update`: `{"dir": "<absolute_working_directory>", "status": "completed", "outputs": "<local_file_or_array>", "progress": "<verdict: PASS|FAIL — (for audit roles)> <1-sentence summary>"}` (omit `outputs` if your role produces no files; audit/review roles MUST prefix `progress` with `verdict: PASS` or `verdict: FAIL`; `weave_update` auto-promotes any `<local>: <target>` bindings).
4. **Final Chat Response (Strict 1-Line Structured Ack)**:
   Write all detailed reports strictly to your output file(s) and `weave.md`. Return **only one line** in chat:
   - Audit/review roles: `COMPLETED: <agent_id> | verdict: <PASS|FAIL> | outputs: [<local_output_1>, ...]`
   - Standard roles: `COMPLETED: <agent_id> | outputs: [<local_output_1>, ...]` (`outputs: []` if none)
   - Mid-stage pause: `WAITING: <agent_id> | status: waiting/<detail>`
   - Blocked: `BLOCKED: <agent_id> | reason: <1-sentence_error>`
   - *Sole Exception ($P_{\text{out}}$)*: Only when instructions explicitly require structured runtime handoff parameters ($P_{\text{out}}$, e.g. `track_queries`), append the compact $P_{\text{out}}$ payload directly below the 1-line header with zero prose.
