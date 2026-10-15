---
name: weave-core-orchestrator
description: >-
  Standard WeaveMAS orchestrator execution protocol. Enforces upfront stage scaffolding,
  master pipeline status tracking, pre-spawn subagent scaffolding, black-box dispatching,
  and fail-fast deliverable ingestion via WeaveMAS MCP status tools.
---

# 👑 WeaveMAS Orchestrator Execution Protocol

This protocol defines universal execution constraints, sandboxing boundaries, and deterministic lifecycle tracking for all root orchestrator agents in the WeaveMAS pipeline.

---

## 1. Workspace Scoping & Sandbox

Your master execution root is `output/<context_slug>/`:
* **Isolate Runs**: Every pipeline run is scoped to a dedicated entity or show directory (e.g. `output/show_09-10-2026_the_clash/` or `output/article_2026-10-12_ai_chips/`).
* **No Root Directory Pollution**: Never write scratch files, intermediate drafts, or stage files to the workspace root (`./`). All outputs belong strictly within `output/<context_slug>/`.

---

## 2. Universal Status Tooling Mandate

Anytime an orchestration guide, stage script, or workflow directive refers to initializing status, advancing status, updating progress, or referencing `status.md`:

* **Never Edit `status.md` Manually**: Do NOT use `write_to_file`, `replace_file_content`, or shell commands to touch `status.md`.
* **Always Use WeaveMAS MCP Status Tools**:
  - Whenever a guide says *"Initialize status (`status.md`)"* or *"Initialize master `status.md`"* $\rightarrow$ Call `call_mcp_tool` (`ServerName: "weavemas_weave"`, `ToolName: "status_init"`).
  - Whenever a guide says *"Advance master status (`status.md`)"* or *"Update status (`status.md`)"* $\rightarrow$ Call `call_mcp_tool` (`ServerName: "weavemas_weave"`, `ToolName: "status_update"`).
  - Whenever a guide says *"Verify status (`status.md`)"* $\rightarrow$ Call `call_mcp_tool` (`ServerName: "weavemas_weave"`, `ToolName: "status_verify"`).
  - Whenever checking subagent lifecycle, completion, or deliverable existence $\rightarrow$ Call `call_mcp_tool` (`ServerName: "weavemas_weave"`, `ToolName: "status_read"`).
* **Never Inspect `status.md` via `view_file`**: Inspecting `status.md` via `view_file` or file reading tools is strictly prohibited. It introduces unnecessary token overhead and bypasses automated deliverable verification. Always use `status_read` to receive concise, structured status metadata.
* **Absolute Path Requirement (`dir`)**: The `dir` argument passed to all status MCP tools (`status_init`, `status_update`, `status_verify`, `status_read`) **must strictly be an absolute path** (e.g. `<workspace_root>/output/<context_slug>`). Relative paths will fail fast immediately to prevent working directory collisions.
* **Declarative Mapping**: Stage guides define status lifecycle events declaratively (referencing `status.md`); the orchestrator executing this skill is strictly responsible for translating these declarative directives into the appropriate WeaveMAS MCP status tool invocations.

---

## 3. Step 0: Upfront Stage Scaffolding & Master Status

Before dispatching any subagents, perform these two immediate startup actions:

### A. Pre-Create All Stage Directories Upfront
Create all stage directories defined in the pipeline sequence (e.g. `stage01_setup/`, `stage02_concept/`, `stage03_writing/`) in `output/<context_slug>/` immediately—even though they are initially empty.
* **Why**: The WeaveMAS UI sidecar and file watchers inspect the workspace on day zero. Pre-creating stage folders renders the complete pipeline stepper immediately with zero detection delay or 404 warnings.

### B. Initialize Master Pipeline Status
Initialize `status.md` at the root of `output/<context_slug>/`:

* **Using Native MCP Tool (Standard)**:
  Call `call_mcp_tool`:
  * `ServerName`: `"weavemas_weave"`
  * `ToolName`: `"status_init"`
  * `Arguments`:
    ```json
    {
      "dir": "<workspace_root>/output/<context_slug>",
      "role": "orchestrator",
      "type": "orchestrator",
      "status": "in_progress/<first_stage>"
    }
    ```
* **Using CLI Tool (Fallback)**:
  ```bash
  python .agent/skills/weave-core/scripts/weave_status.py init \
    --type orchestrator \
    --status "in_progress/<first_stage>" \
    --dir "output/<context_slug>"
  ```

---

## 4. Step 1: Pre-Spawn Subagent Scaffolding (Hook)

Before dispatching any subagent via `invoke_subagent`, execute the pre-spawn hook:

1. **Scaffold Subagent Working Directory**:
   Create `<stage_slug>/agents/<agent_identifier>/` inside `output/<context_slug>/`.
2. **Initialize Subagent Status**:
   * **Using Native MCP Tool (Standard)**:
     Call `call_mcp_tool`:
     * `ServerName`: `"weavemas_weave"`
     * `ToolName`: `"status_init"`
     * `Arguments`:
       ```json
       {
         "dir": "<workspace_root>/output/<context_slug>/<stage_slug>/agents/<agent_identifier>",
         "role": "<role_slug>"
       }
       ```
3. **Stage Input Files (3-Tier Input Model)**:
   * **Tier 1 (Directives & Parameters)**: Inline directly into the `invoke_subagent` prompt.
   * **Tier 2 (Prior Stage Deliverables)**: Copy the prior stage deliverable directly into the subagent's folder (e.g. `<stage_slug>/agents/<agent_identifier>/01_setup.md`). Never summarize or inline prior deliverables into prompts.
   * **Tier 3 (Bulk Read-Only Assets)**: Pass the external read-only directory path or manifest.

---

## 5. Step 2: The Black-Box Dispatch Protocol

Dispatch subagents as autonomous black boxes:

* **Dispatch Prompt Contents (Strictly Minimal)**:
  1. The target agent role definition file.
  2. The assigned working directory (e.g. `output/<context_slug>/<stage_slug>/agents/<agent_identifier>/`).
  3. The staged inputs in that directory.
  4. The required final deliverable filename.
* **Zero Prompt Micromanagement**:
  Never dictate how the subagent conducts internal reasoning, pre-flight checks, or intermediate status updates in the prompt. All lifecycle mechanics belong inside the agent definition.
* **Non-Polling Reactive Wait**:
  Do NOT poll `status.md` in a loop; wait for subagent completion notifications.

---

## 6. Step 3: Deliverable Ingestion & Verification (Fail Fast)

Upon subagent completion notification:
1. **Read Status via MCP**:
   Call `call_mcp_tool`:
   * `ServerName`: `"weavemas_weave"`
   * `ToolName`: `"status_read"`
   * `Arguments`: `{ "dir": "<workspace_root>/output/<context_slug>/<stage_slug>/agents/<agent_identifier>" }`
2. **Validate Completion Metadata**:
   - Verify `is_completed` is `true` (status starts with `completed`).
   - Verify `deliverable_exists` is `true` and `deliverable_size > 0`.
3. **Fail Fast**:
   - If `is_completed` is `false`, `deliverable` is `null`, or `deliverable_exists` is `false`: **halt immediately** and log a critical blocker error.
4. **Ingest Deliverable**:
   - Copy or compile the verified deliverable file from `deliverable_path` into the canonical stage handoff location (e.g. `output/<context_slug>/01_setup.md`).
5. **Handle Auditing/Revision**:
   - If the subagent reports `status: blocked/revision_requested` during an audit, manage bounded revision loops with a hard cap (maximum 2 revision iterations) before escalating.

---

## 7. Step 4: Stage Progression & Pipeline Completion

### Stage Transitions
When advancing from one stage to the next, update the master `output/<context_slug>/status.md`:
* **Using Native MCP Tool (Standard)**:
  Call `call_mcp_tool`:
  * `ServerName`: `"weavemas_weave"`
  * `ToolName`: `"status_update"`
  * `Arguments`:
    ```json
    {
      "dir": "<workspace_root>/output/<context_slug>",
      "status": "in_progress/<next_stage>",
      "progress": "<Stage completion and handoff summary>"
    }
    ```

### Final Pipeline Completion
When the final pipeline stage completes:
* **Using Native MCP Tool (Standard)**:
  Call `call_mcp_tool`:
  * `ServerName`: `"weavemas_weave"`
  * `ToolName`: `"status_update"`
  * `Arguments`:
    ```json
    {
      "dir": "<workspace_root>/output/<context_slug>",
      "status": "completed",
      "deliverable": "<final_pipeline_deliverable_path>",
      "progress": "<Final end-to-end execution summary>"
    }
    ```
