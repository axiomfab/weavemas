---
name: orchestrator-agent-execution
description: >-
  Phase 2 WeaveMAS microskill. Discovers initialized agent workspaces via MCP
  discover_agents (with pagination limit), enforces Protocol A/B execution rules,
  dispatches black-box subagents, and verifies output(s) via weave_read.
---

# 🚀 Phase 2: Orchestrator Agent Execution

Execute only after `orchestrator-agent-instantiation` returns `PROVISIONING_COMPLETE` for the current stage. All MCP calls use `ServerName: "weavemas_weave"`.

---

## 1. Protocol Selection (Pre-Flight Check)

Scan `## Execution` for the keyword `sub-orchestrator` (e.g. `cluster into a sub-orchestrator`):
- **Present** $\rightarrow$ Execute via **Protocol B** (Section 4). Never flatten into direct parallel waves.
- **Absent** $\rightarrow$ Execute via **Protocol A** (Section 3).

---

## 2. Discover Provisioned Agents (Paginated Waves)

Query `discover_agents` in batches (never scan directories or rely on chat history):
```json
{
  "directory": "<workspace_root>/runs/<context_slug>/<stage_slug>",
  "filter_status": "initialized",
  "limit": 10
}
```
Use the returned `dir`, `agent_id`, `instructions_file`, and `inputs` for `invoke_subagent`. If `remaining_count > 0`, repeat `discover_agents` for the next wave after completing the current wave.

---

## 3. Protocol A: Direct Parallel or Sequential Agents

1. **Mandatory Delegation**: Never execute domain tasks in the orchestrator context or merge distinct agent roles.
2. **Native Subagent Dispatch (`invoke_subagent`)**: Derive `<agent_type>` from the filename stem of `<instructions_file>` (e.g. `.agent/agents/stage1_director.md` $\rightarrow$ `TypeName: "stage1_director"`). Pass `TypeName: "<agent_type>"` and `Role: "<agent_id>"` (omit `Model` so Antigravity automatically applies the `model:` defined in the agent's frontmatter, and never instruct the agent to `view_file` its own `<instructions_file>` since Antigravity injects it as the system prompt). Always pass `context_slug: <context_slug>` in `Runtime Parameters`. File inputs are already recorded in the agent's `weave.md` `inputs` and verified by `weave_verify` on Turn 1. Wait reactively (never poll):
   ```markdown
   Assigned Working Directory: <dir>/

   Runtime Parameters:
   - context_slug: <context_slug>
   - <param_name>: <param_value>

   Required Output: <output_filename>
   ```

---

## 4. Protocol B: Sub-Orchestrators (Sequential or Parallel)

1. **Discover Cluster Agents**: Call `discover_agents` (`filter_status: "initialized"`) to obtain `dir`, `instructions_file`, and `inputs` for all child agents in each unit cluster.
2. **Dispatch (`invoke_subagent` with `TypeName: "self"`, `Model: "inherit"`, `Role: "suborchestrator_<unit_id>"`)**:
   - Dispatch concurrently if `execute in parallel` is specified; otherwise dispatch one sub-orchestrator at a time.
   - Always pass `context_slug: <context_slug>` to the sub-orchestrator and require it to pass `context_slug: <context_slug>` in `Runtime Parameters` to every child agent it spawns.
   - **Dispatch Prompt**:
     ```markdown
     Act as the Ephemeral Sub-Orchestrator for <unit_id> (<assigned_cluster_name>).
     Context Slug: <context_slug>

     Execution Constraints:
     - Shared Execution Root: Operates in runs/<context_slug>/ (use standard child agent paths; never create nested <unit_id>/ folders).
     - ZERO weave.md: NEVER create a weave.md for yourself and NEVER touch root weave.md.
     - Zero File Staging: Child agents already have their input file paths configured in their `weave.md` `inputs` (verified on Turn 1 by `weave_verify`). If any child agent fails `weave_verify`, halt immediately and report the error to the root orchestrator without attempting workarounds.
     - Dispatch child agents sequentially via `invoke_subagent` using each child agent's native `TypeName: "<child_agent_type>"` (the filename stem of its `instructions_file`, omitting `Model` so its frontmatter `model:` is used) and `Role: "<child_agent_id>"`, always including `context_slug: <context_slug>` in `Runtime Parameters` (never execute child agent tasks yourself in the sub-orchestrator context):
       1. `<child_agent_1_id>` (TypeName: `<child_1_type>`, WD: `<wd_1>`, Runtime Parameters: `context_slug: <context_slug>, <unit_params>`, Output: `<output_1>`)
       2. `<child_agent_2_id>` (TypeName: `<child_2_type>`, WD: `<wd_2>`, Runtime Parameters: `context_slug: <context_slug>, <unit_params>`, Output: `<output_2>`)
     - Local Revision Loop: Route downstream audit corrections directly to the upstream child agent's `conversationId` via `send_message` (max 2 cycles).
     - Finalization: Verify each child agent's output(s) via `weave_read`, copy/compile `<final_unit_output>` to `<assigned_cluster_dir>`, and message the parent orchestrator.
     ```

---

## 5. Outputs Verification & User Review Gates (Fail Fast)

Upon subagent or sub-orchestrator wakeup:
1. **Fail-Fast on Verification Errors**: If a subagent reports a `weave_verify` error (such as a missing `inputs` file), **halt immediately and report the error to the user**—never attempt workarounds.
2. **Verify via `weave_read`**:
   Call `weave_read`: `{ "dir": "<abs_agent_dir>", "expected_status": "completed", "expected_outputs": "<expected_filename_or_array_or_null>" }`. Halt immediately if verification fails or the output file is empty.
3. **Ingest Output**: Copy/compile verified output(s) to the canonical stage handoff path (e.g. `runs/<context_slug>/01_setup.md`).
4. **User Review Gate (when declared in stage guide)**:
   - Write the stage output to `<appDataDir>/brain/<conversation-id>/<stage_output_name>` (`RequestFeedback: true`, `UserFacing: true`) and pause for approval.
   - **Approved** $\rightarrow$ Advance master status via `weave_update`.
   - **Changes Requested** $\rightarrow$ Route feedback to the existing subagent via `send_message(Recipient: <conversationId>, Message: "<feedback>")`. Never spawn duplicate subagent instances for revisions.
