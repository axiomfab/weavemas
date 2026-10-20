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
* **Zero Runtime Code Creation**: Under no circumstances should the orchestrator or any subagents write, create, generate, or modify code files, python scripts, batch runner scripts, helper modules, or unit tests (including test files under `tests/` or scratch scripts under `scratch/`) during a pipeline run. Multi-step batch tasks must use native sequential shell loops (e.g. PowerShell `foreach`) calling pre-established CLI tools directly.

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

Before dispatching any subagents, perform these startup actions:

### A. Pre-Create All Stage Directories Upfront (When Stages Are Declared)
If the pipeline declares stages (e.g. under `## Execution` in `orchestrator.md` with modular protocols in `orchestrator/`), read each stage's declared `Execution Directory` (e.g. `stage01_setup/`, `stage02_concept/`, `stage03_writing/`) and create all stage directories in `output/<context_slug>/` upfront immediately—even though they are initially empty.
* **Single-File / Stageless Pipelines**: If `orchestrator.md` defines `## Agents` and `## Execution` directly without stages, skip stage folder creation (subagent directories will be created under `output/<context_slug>/agents/<agent_identifier>/`).
* **Why**: The WeaveMAS UI sidecar and file watchers inspect the workspace on day zero. Pre-creating stage folders renders the complete pipeline stepper immediately with zero detection delay or 404 warnings.

### B. Initialize Master Pipeline Status
Initialize master `status.md` at the root of `output/<context_slug>/` strictly via the WeaveMAS MCP status tool:

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
      "status": "in_progress/<first_stage_or_step>"
    }
    ```
* **Using CLI Tool (Fallback)**:
  ```bash
  python .agent/skills/weave-core/scripts/weave_status.py init \
    --type orchestrator \
    --status "in_progress/<first_stage_or_step>" \
    --dir "output/<context_slug>"
  ```

---

## 4. Step 1: Pre-Spawn Subagent Scaffolding (Hook)

Before dispatching any subagent via `invoke_subagent`, execute the pre-spawn hook:

1. **Scaffold Subagent Working Directory**:
   Create the agent's declared `Working Directory` (e.g. `<stage_slug>/agents/<agent_identifier>/` for multi-stage pipelines, or `agents/<agent_identifier>/` for single-file stageless pipelines) inside `output/<context_slug>/`.
2. **Initialize Subagent Status**:
   * **Using Native MCP Tool (Standard)**:
     Call `call_mcp_tool`:
     * `ServerName`: `"weavemas_weave"`
     * `ToolName`: `"status_init"`
     * `Arguments`:
       ```json
       {
         "dir": "<workspace_root>/output/<context_slug>/<agent_working_directory>",
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

* **Mandatory Subagent Delegation (No Orchestrator Overstepping)**:
  The orchestrator coordinates, stages inputs, and verifies deliverables—it must never execute domain tasks (such as writing prose, conducting research, calculating parameters, or generating media) directly in its own context. Every stage task must be dispatched to its designated subagents via `invoke_subagent`. Do not combine separate subagent roles into single ad-hoc monolithic agents or invent intermediary coordinator agents unless explicitly declared in the pipeline specification.
* **Dispatch via `TypeName: "self"` (`invoke_subagent`)**:
  Dispatch the subagent with `TypeName: "self"` (which guarantees full inheritance of mounted plugin skills, tool permissions, and MCP servers), setting `Model: "flash"` (or as configured in the agent definition) and `Role: "<agent_identifier>"` matching the exact slug defined in `## Agents` (e.g. `Role: "director"`, `Role: "showrunner"`, or parameterized `Role: "architect_a01_s01"`). This ensures deterministic UI badges and unambiguous routing for `send_message`.
* **Dispatch Prompt Contents**:
  The prompt instructs the agent to adopt its role and read its instruction file, followed by the sandboxed paths and inputs:
  ```markdown
  Act as the <role_name> configured in `<agent_instruction_path>`.
  Read `<agent_instruction_path>` for your role instructions, lifecycle steps, and deliverable schema.

  Assigned Working Directory: <workspace_root>/output/<context_slug>/<stage_slug>/agents/<agent_identifier>/

  Tier 1 Parameters:
  - <param_name>: <param_value>

  Tier 3 Read-Only Assets:
  - <asset_name>: <asset_path>

  Required Deliverable: <deliverable_filename>
  ```
* **Zero Prompt Micromanagement**:
  Never dictate how the subagent conducts internal reasoning, pre-flight checks, or intermediate status updates in the prompt. All lifecycle mechanics belong inside the agent definition and mounted skills.
* **Non-Polling Reactive Wait**:
  Do NOT poll `status.md` in a loop; wait for subagent completion notifications.

---

## 6. Step 3: Deliverable Ingestion & Verification (Fail Fast)

Upon subagent completion notification:
1. **Read Status via MCP**:
   Call `call_mcp_tool`:
   * `ServerName`: `"weavemas_weave"`
   * `ToolName`: `"status_read"`
   * `Arguments`: `{ "dir": "<workspace_root>/output/<context_slug>/<stage_slug>/agents/<agent_identifier>", "expected_status": "completed", "expected_deliverable": "<expected_filename_or_null>" }`
2. **Verify Status & Deliverable**:
   - Verify `status` indicates `completed` (or starts with `completed`).
   - Match the subagent's actual `deliverable` against orchestrator expectations (e.g. `setup.md`, or `null` if the agent produces no deliverable file).
   - If a deliverable file is specified, verify it exists on disk and is non-empty.
3. **Fail Fast**:
   - If `status` is not completed or the deliverable does not match the orchestrator's expectation: **halt immediately** and log a critical blocker error.
4. **Ingest Deliverable**:
   - Copy or compile the verified deliverable file into the canonical stage handoff location (e.g. `output/<context_slug>/01_setup.md`).
5. **User Review Gates & Subagent Feedback Loop**:
   When a stage guide declares a User Review Gate:
   - **Publish UI Review Artifact**: Write the stage deliverable to `<appDataDir>/brain/<conversation-id>/<stage_deliverable_name>` with `RequestFeedback: true` and `UserFacing: true`.
   - **Pause for Review**: Present a concise executive summary of the deliverable and request user review approval.
   - **Strict Gate Rule**: Do NOT advance master status or proceed to the next stage until the user grants explicit approval.
   - **Subagent Session Continuity & In-Place Iteration**:
     - If the user approves: advance master status to the next stage via `status_update`.
     - If the user requests changes or disapproves: send the feedback directly to the existing subagent instance using `send_message(Recipient: <conversationId>, Message: "<feedback>")`.
     - The subagent iterates on its deliverable in place and calls `status_update` to `completed` upon finishing revisions.
     - Spawning duplicate subagent instances for revisions is strictly prohibited.

---

## 7. Step 4: Stage Progression & Pipeline Completion

### Stage Transitions
When advancing from one stage to the next, announce the transition and update master status:
* **Stage Start UI Tracker Link**: At the start of every stage (and upon advancing master status), the orchestrator must announce the beginning of the stage and provide a clickable chip to the pipeline tracker: `[WeaveMAS UI](sidecar://weavemas/panel/)`.
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

---

## 8. Parallel Execution Protocols

When a stage guideline defines parallel execution, the orchestrator follows one of two distinct execution protocols based on how the workflow is authored:

### Protocol A: Executing Direct Parallel Agents
Used when a stage specifies running agents directly in parallel (e.g. `For each <item>, run <agent> in parallel:` or `Run the following agents in parallel:`):

1. **Batch Pre-Spawn Scaffolding**:
   Pre-scaffold the declared working directory for every agent in the parallel set and call `call_mcp_tool` (`status_init`) on each before dispatching. Stage required Tier 2 inputs.
2. **Concurrent Batch Dispatch**:
   Dispatch all parallel agents concurrently in a single turn using `invoke_subagent` (`TypeName: "self"`).
3. **Reactive Barrier Synchronization**:
   Do NOT poll `status.md` in a loop. Leverage reactive wakeups and wait until all dispatched agents complete.
4. **Deliverable Ingestion & Cross-Unit Checks**:
   Query each completed agent via `call_mcp_tool` (`status_read`). If executing in phased waves (e.g. Wave 1 Architects $\rightarrow$ Wave 2 Writers), inspect the combined set of deliverables for cross-unit consistency (e.g. deduplicating themes, balancing pacing) before dispatching the next wave.

---

### Protocol B: Executing Clustered Sub-Orchestrators
Used when a multi-agent loop or multi-track workflow is clustered into sub-orchestrators (e.g. `For each <item>, cluster into a sub-orchestrator and execute in parallel:` or `Cluster each of the following into a sub-orchestrator and execute in parallel:`):

1. **Upfront Worker Scaffolding**:
   The root orchestrator pre-creates all worker directories across all clusters in `output/<context_slug>/` before dispatching sub-orchestrators.
2. **Concurrent Sub-Orchestrator Dispatch**:
   The root orchestrator batch-dispatches $N$ ephemeral sub-orchestrators concurrently via `invoke_subagent` (`TypeName: "self"`), passing the cluster's assigned unit parameters, agent instructions, and assigned agent slugs.
3. **Ephemeral Sub-Orchestrator Runtime Rules**:
   Each sub-orchestrator operates under strict execution constraints:
   * **Shared Execution Root**: Operates in the shared context root (`output/<context_slug>/`).
   * **Zero `status.md` Creation**: Sub-orchestrators **MUST NEVER create a `status.md` for themselves and MUST NEVER touch root `status.md`**. The master status file belongs strictly to the root orchestrator.
   * **Standard Worker Paths**: Child workers live in their standard stage directories (e.g. `stage<NN>_<slug>/agents/<agent_identifier>/`). No artificial nested `<unit_id>/` directories are created.
   * **Local Revision Encapsulation**: The sub-orchestrator supervises its assigned workers sequentially. If a downstream worker (e.g. Fact-Checker) requests changes, the sub-orchestrator coordinates revisions directly with the upstream worker (e.g. Writer) via `send_message(Recipient: <id>)` (max 2 cycles). Zero intermediate drafts or critique noise reach the root orchestrator.
   * **Deliverable Finalization**: Once verified via `status_read`, the sub-orchestrator writes or copies the final unit deliverable and finishes its turn.
4. **Root Ingestion**:
   The root orchestrator waits reactively for all sub-orchestrators to complete, verifies the finalized deliverables on disk, and proceeds to compilation or the next stage.
