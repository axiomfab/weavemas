---
name: weave-core-orchestrator
description: >-
  Core WeaveMAS orchestrator protocol. Enforces workspace sandboxing, universal MCP
  status tooling, Step 0 stage directory scaffolding, and autonomous chaining of the
  orchestrator-agent-instantiation and orchestrator-agent-execution microskills.
---

# 👑 WeaveMAS Core Orchestrator Protocol

This protocol defines universal execution constraints, sandboxing boundaries, and deterministic lifecycle tracking for all root orchestrator agents in the WeaveMAS pipeline.

---

## 1. Workspace Scoping & Sandbox

Your master execution root is `output/<context_slug>/`:
- **Isolate Runs**: Every pipeline run is scoped to a dedicated entity or show directory (e.g. `output/show_09-10-2026_the_clash/` or `output/article_2026-10-12_ai_chips/`).
- **No Root Directory Pollution**: Never write scratch files, intermediate drafts, or stage files to the workspace root (`./`). All outputs belong strictly within `output/<context_slug>/`.
- **Zero Runtime Code Creation**: Under no circumstances should the orchestrator or any subagents write, create, generate, or modify code files, python scripts, batch runner scripts, helper modules, or unit tests (including test files under `tests/` or scratch scripts under `scratch/`) during a pipeline run. Multi-step batch tasks must use native sequential shell loops (e.g. PowerShell `foreach`) calling pre-established CLI tools directly.

---

## 2. Universal Status Tooling Mandate

Anytime an orchestration guide, stage script, or workflow directive refers to initializing status, advancing status, updating progress, or referencing `status.md`:
- **Never Edit `status.md` Manually**: Do NOT use `write_to_file`, `replace_file_content`, or shell commands to touch `status.md`.
- **Always Use WeaveMAS MCP Status Tools (`ServerName: "weavemas_weave"`)**:
  - Whenever a guide says *"Initialize status (`status.md`)"* or *"Initialize master `status.md`"* $\rightarrow$ Call `call_mcp_tool` (`ServerName: "weavemas_weave"`, `ToolName: "status_init"`).
  - Whenever a guide says *"Advance master status (`status.md`)"* or *"Update status (`status.md`)"* $\rightarrow$ Call `call_mcp_tool` (`ServerName: "weavemas_weave"`, `ToolName: "status_update"`).
  - Whenever a guide says *"Verify status (`status.md`)"* $\rightarrow$ Call `call_mcp_tool` (`ServerName: "weavemas_weave"`, `ToolName: "status_verify"`).
  - Whenever checking subagent lifecycle, completion, or deliverable existence $\rightarrow$ Call `call_mcp_tool` (`ServerName: "weavemas_weave"`, `ToolName: "status_read"`).
  - Whenever discovering provisioned subagents $\rightarrow$ Call `call_mcp_tool` (`ServerName: "weavemas_weave"`, `ToolName: "discover_agents"`).
- **Never Inspect `status.md` via `view_file`**: Inspecting `status.md` via `view_file` or file reading tools is strictly prohibited. Always use `status_read` to receive concise, structured status metadata.
- **Absolute Path Requirement (`dir` / `directory`)**: The directory argument passed to all status MCP tools (`status_init`, `status_update`, `status_verify`, `status_read`, `discover_agents`) **must strictly be an absolute path** (e.g. `<workspace_root>/output/<context_slug>`). Relative paths will fail fast immediately to prevent working directory collisions.
- **Declarative Mapping**: Stage guides define status lifecycle events declaratively (referencing `status.md`); the orchestrator executing this skill is strictly responsible for translating these declarative directives into the appropriate WeaveMAS MCP status tool invocations.

---

## 3. Step 0: Upfront Stage Scaffolding & Master Status

Before instantiating or dispatching any subagents, perform these startup actions:

### A. Pre-Create All Stage Directories Upfront (When Stages Are Declared)
If the pipeline declares stages (e.g. under `## Execution` in `orchestrator.md` with modular protocols in `orchestrator/`), read each stage's declared `Execution Directory` (e.g. `stage01_setup/`, `stage02_concept/`, `stage03_writing/`) and create all stage directories in `output/<context_slug>/` upfront immediately—even though they are initially empty.
- **Single-File / Stageless Pipelines**: If `orchestrator.md` defines `## Agents` and `## Execution` directly without stages, skip stage folder creation (subagent directories will be created under `output/<context_slug>/agents/<agent_identifier>/`).
- **Why**: The WeaveMAS UI sidecar and file watchers inspect the workspace on day zero. Pre-creating stage folders renders the complete pipeline stepper immediately with zero detection delay or 404 warnings.

### B. Initialize Master Pipeline Status
Initialize master `status.md` at the root of `output/<context_slug>/` strictly via the WeaveMAS MCP status tool:
- **Using Native MCP Tool (Standard)**:
  Call `call_mcp_tool`:
  * `ServerName`: `"weavemas_weave"`
  * `ToolName`: `"status_init"`
  * `Arguments`:
    ```json
    {
      "dir": "<workspace_root>/output/<context_slug>",
      "type": "orchestrator",
      "status": "in_progress/<first_stage_or_step>"
    }
    ```
- **Using CLI Tool (Fallback)**:
  ```bash
  python .agent/skills/weave-core/scripts/weave_status.py init \
    --type orchestrator \
    --status "in_progress/<first_stage_or_step>" \
    --dir "output/<context_slug>"
  ```

---

## 4. Two-Phase Stage Execution Contract (Autonomous Microskill Chaining)

To prevent optimistic progression and context bloat, every stage (or stageless manifest) MUST be executed by chaining two dedicated microskills in strict sequence:

1. **Phase 1 — Agent Instantiation (`orchestrator-agent-instantiation`)**:
   - Expand and execute `orchestrator-agent-instantiation` first.
   - **STRICT BARRIER**: Do NOT evaluate `## Execution` or dispatch worker subagents until `orchestrator-agent-instantiation` completes and returns `PROVISIONING_COMPLETE`.
2. **Phase 2 — Agent Execution (`orchestrator-agent-execution`)**:
   - Immediately upon receiving `PROVISIONING_COMPLETE`, expand and execute `orchestrator-agent-execution` to discover the initialized workspaces via MCP and run the stage's `## Execution` block.

---

## 5. Step 4: Stage Progression & Pipeline Completion

### Stage Transitions
When advancing from one stage to the next, announce the transition and update master status:
- **Stage Start UI Tracker Link**: At the start of every stage (and upon advancing master status), the orchestrator must announce the beginning of the stage and provide a clickable chip to the pipeline tracker: `[WeaveMAS UI](sidecar://weavemas/panel/)`.
- **Using Native MCP Tool (Standard)**:
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
- Repeat the **Two-Phase Stage Execution Contract** (`orchestrator-agent-instantiation` $\rightarrow$ `orchestrator-agent-execution`) for `<next_stage>`.

### Final Pipeline Completion
When the final pipeline stage completes:
- **Using Native MCP Tool (Standard)**:
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
