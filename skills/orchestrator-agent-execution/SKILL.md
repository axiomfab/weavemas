---
name: orchestrator-agent-execution
description: >-
  Phase 2 WeaveMAS microskill. Discovers initialized agent workspaces via MCP
  discover_agents (with pagination limit), enforces Protocol A/B execution rules,
  dispatches black-box subagents, and verifies deliverables via status_read.
---

# 🚀 Phase 2: Orchestrator Agent Execution

Execute this microskill only after `orchestrator-agent-instantiation` has returned `PROVISIONING_COMPLETE` for the current stage.

---

## 1. Protocol Selection Circuit Breaker (Mandatory Pre-Flight Check)

Before discovering or dispatching agents in any stage, scan `## Execution` for the keyword `sub-orchestrator` (e.g. `cluster into a sub-orchestrator`):
- **If `sub-orchestrator` is present in `## Execution`**: You MUST execute via **Protocol B** (Section 4). You are **strictly forbidden** from flattening the workflow into direct parallel waves (Protocol A). Ephemeral sub-orchestrators are declared solely in `## Execution` and are deliberately omitted from `## Agents` (per `authoring_parallelization.md`).
- **If `sub-orchestrator` is NOT present in `## Execution`**: Execute via **Protocol A** (Section 3 — direct parallel agents or sequential agents).

---

## 2. Discover Provisioned Agents via MCP (Paginated Waves)

Never rely on chat history tables or manual directory scans to locate initialized agents. Query the MCP discovery tool in manageable batches using `limit` (e.g., `5` or `10` at a time):

Call `call_mcp_tool`:
- `ServerName`: `"weavemas_weave"`
- `ToolName`: `"discover_agents"`
- `Arguments`:
  ```json
  {
    "directory": "<workspace_root>/output/<context_slug>/<stage_slug>",
    "filter_status": "initialized",
    "limit": 10
  }
  ```
- Use the returned `dir`, `agent_id`, and `instructions_file` entries to populate your `invoke_subagent` calls.
- If `remaining_count > 0`, repeat `discover_agents` for the next wave of `"initialized"` agents after dispatching/completing the current wave.

---

## 3. Protocol A: Executing Direct Parallel or Sequential Agents

1. **Mandatory Subagent Delegation (No Orchestrator Overstepping)**:
   The orchestrator coordinates, stages inputs, and verifies deliverables—it must never execute domain tasks (such as writing prose, conducting research, calculating parameters, or generating media) directly in its own context. Every stage task must be dispatched to its designated subagents via `invoke_subagent`. Do not combine separate subagent roles into single ad-hoc monolithic agents or invent intermediary coordinator agents unless explicitly declared in the pipeline specification.
2. **Dispatch via `TypeName: "self"` (`invoke_subagent`)**:
   Dispatch the subagent with `TypeName: "self"` (which guarantees full inheritance of mounted plugin skills, tool permissions, and MCP servers), setting `Model: "flash"` (or as configured in the agent definition) and `Role: "<agent_id>"` matching the exact slug returned by `discover_agents`.
3. **Dispatch Prompt Contents**:
   ```markdown
   Act as the <role> configured in `<instructions_file>`.
   Read `<instructions_file>` for your role instructions, lifecycle steps, and deliverable schema.

   Assigned Working Directory: <dir>/

   Tier 1 Parameters:
   - <param_name>: <param_value>

   Tier 3 Read-Only Assets:
   - <asset_name>: <asset_path>

   Required Deliverable: <deliverable_filename>
   ```
4. **Zero Prompt Micromanagement**:
   Never dictate how the subagent conducts internal reasoning, pre-flight checks, or intermediate status updates in the prompt. All lifecycle mechanics belong inside the agent definition and mounted skills.
5. **Non-Polling Reactive Wait**:
   Do NOT poll `status.md` in a loop; wait reactively for subagent completion notifications.

---

## 4. Protocol B: Executing Sub-Orchestrators (Sequential or Parallel)

Used when a multi-agent loop or multi-track workflow is clustered into an ephemeral sub-orchestrator (e.g. `For each <item>, cluster into a sub-orchestrator [and execute in parallel]:` or `Cluster each track into a sub-orchestrator [and execute in parallel]:`):

1. **Discover Cluster Agents**:
   Call `discover_agents` (`directory: "<workspace_root>/output/<context_slug>/<stage_slug>"`, `filter_status: "initialized"`) to obtain the exact `dir` and `instructions_file` paths for the child agents belonging to each unit cluster.
2. **Sub-Orchestrator Dispatch (Sequential vs. Parallel)**:
   * **Parallel Dispatch**: If declared with `execute in parallel`, batch-dispatch all $N$ ephemeral sub-orchestrators concurrently via `invoke_subagent` (`TypeName: "self"`).
   * **Sequential Dispatch**: If declared without `execute in parallel`, dispatch one sub-orchestrator at a time, waiting for its deliverable before dispatching the next unit.
   * **Role Naming**: Name the sub-orchestrator role matching the unit cluster (e.g. `Role: "<cluster_slug>_producer"` or `Role: "suborchestrator_<unit_id>"`).
   * **Dispatch Prompt Template**:
     ```markdown
     Act as the Ephemeral Sub-Orchestrator for <unit_id> (<assigned_cluster_name>).

     Execution Constraints:
     - Shared Execution Root: Operates in output/<context_slug>/
     - ZERO status.md: Do NOT create a status.md for yourself and do NOT touch the root status.md. Master status belongs strictly to the root orchestrator.
     - Supervise the following child agents sequentially:
       1. `<child_agent_1_role>` (Instructions: `<path_1>`, WD: `<wd_1>`, Deliverable: `<deliv_1>`)
       2. `<child_agent_2_role>` (Instructions: `<path_2>`, WD: `<wd_2>`, Deliverable: `<deliv_2>`)
       ...
     - Local Revision Loop: If a downstream verification agent flags discrepancies requiring revisions, send corrections directly to the upstream authoring agent via `send_message` (max 2 cycles).
     - Finalization: Once deliverables are verified, copy/compile the final unit deliverable to `<final_unit_deliverable>` in `<assigned_cluster_dir>` and message the parent orchestrator upon completion.
     ```
3. **Ephemeral Sub-Orchestrator Runtime Rules**:
   * **Shared Execution Root**: Operates in the shared context root (`output/<context_slug>/`).
   * **Zero `status.md` Creation**: Sub-orchestrators **MUST NEVER create a `status.md` for themselves and MUST NEVER touch root `status.md`**.
   * **Standard Agent Paths**: Child agents live in their standard stage directories (e.g. `stage<NN>_<slug>/agents/<agent_identifier>/`). No artificial nested `<unit_id>/` directories are created.
   * **Local Revision Encapsulation**: Coordinates revisions directly with the upstream agent via `send_message(Recipient: <id>)` (max 2 cycles). Zero intermediate drafts or critique noise reach the root orchestrator.

---

## 5. Deliverable Ingestion, Verification & User Review Gates (Fail Fast)

Upon subagent or sub-orchestrator completion notification:
1. **Read Status via MCP**:
   Call `call_mcp_tool`:
   * `ServerName`: `"weavemas_weave"`
   * `ToolName`: `"status_read"`
   * `Arguments`: `{ "dir": "<workspace_root>/output/<context_slug>/<stage_slug>/agents/<agent_identifier>", "expected_status": "completed", "expected_deliverable": "<expected_filename_or_null>" }`
2. **Verify Status & Deliverable (Fail Fast)**:
   - Verify `status` indicates `completed` (or starts with `completed`) and match `deliverable` against expectations.
   - If a deliverable file is specified, verify it exists on disk and is non-empty.
   - If `status` is not completed or the deliverable does not match expectations: **halt immediately** and log a critical blocker error.
   - If executing in phased waves (e.g. Wave 1 Architects $\rightarrow$ Wave 2 Writers), inspect the combined set of deliverables for cross-unit consistency before dispatching the next wave.
3. **Ingest Deliverable**:
   - Copy or compile the verified deliverable file into the canonical stage handoff location (e.g. `output/<context_slug>/01_setup.md`).
4. **User Review Gates & Subagent Feedback Loop**:
   When a stage guide declares a User Review Gate:
   - **Publish UI Review Artifact**: Write the stage deliverable to `<appDataDir>/brain/<conversation-id>/<stage_deliverable_name>` with `RequestFeedback: true` and `UserFacing: true`.
   - **Pause for Review**: Present a concise executive summary of the deliverable and request user review approval.
   - **Strict Gate Rule**: Do NOT advance master status or proceed to the next stage until the user grants explicit approval.
   - **Subagent Session Continuity & In-Place Iteration**:
     - If the user approves: advance master status to the next stage via `status_update`.
     - If the user requests changes or disapproves: send the feedback directly to the existing subagent instance using `send_message(Recipient: <conversationId>, Message: "<feedback>")`.
     - Spawning duplicate subagent instances for revisions is strictly prohibited.
