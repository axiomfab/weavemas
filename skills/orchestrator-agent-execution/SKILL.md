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
Use the returned `dir`, `agent_id`, `instructions_file`, `inputs`, and `outputs` for `invoke_subagent`. If `remaining_count > 0`, repeat `discover_agents` for the next wave after completing the current wave.

---

## 3. Protocol A: Direct Parallel or Sequential Agents

1. **Mandatory Delegation**: Never execute domain tasks in the orchestrator context or merge distinct agent roles.
2. **Native Subagent Dispatch (`invoke_subagent`)**: Derive `<agent_type>` from the filename stem of `<instructions_file>` (e.g. `.agent/agents/stage1_director.md` $\rightarrow$ `TypeName: "stage1_director"`). Pass `TypeName: "<agent_type>"` and `Role: "<agent_id>"` (omit `Model` so Antigravity automatically applies the `model:` defined in the agent's frontmatter, and never instruct the agent to `view_file` its own `<instructions_file>` since Antigravity injects it as the system prompt). Always pass `context_slug: <context_slug>` in `Runtime Parameters`. For `Required Output:`, pass ONLY the **local output filename(s)** (the left-hand side of any `<local>: <target>` binding in `outputs`, e.g. `setup.md, host.md`—never expose `<target>` paths like `${RUN_DIR}/01_setup.md` to the subagent; omit `Required Output:` if `outputs` is empty). File inputs are already recorded in the agent's `weave.md` `inputs` and verified by `weave_verify` on Turn 1. Wait reactively (never poll):
   ```markdown
   Assigned Working Directory: <dir>/

   Runtime Parameters:
   - context_slug: <context_slug>
   - <param_name>: <param_value>

   Required Output: <local_output_filename>
   ```

---

## 4. Protocol B: Sub-Orchestrators (Sequential or Parallel)

1. **Discover Cluster Agents**: Call `discover_agents` (`filter_status: "initialized"`) to obtain `dir`, `instructions_file`, `inputs`, and `outputs` for all child agents in each unit cluster.
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
     - Zero File Staging: Child agents already have their input file paths configured in their `weave.md` `inputs` (verified on Turn 1 by `weave_verify`) and their output port bindings configured in `weave.md` `outputs` (promoted automatically on `weave_update(status: "completed")`). If any child agent fails `weave_verify`, halt immediately and report the error to the root orchestrator without attempting workarounds.
     - Dispatch child agents sequentially via `invoke_subagent` using each child agent's native `TypeName: "<child_agent_type>"` (the filename stem of its `instructions_file`, omitting `Model` so its frontmatter `model:` is used) and `Role: "<child_agent_id>"`, always including `context_slug: <context_slug>` in `Runtime Parameters` and passing only the local output filename(s) in `Required Output:` (never execute child agent tasks yourself in the sub-orchestrator context):
       1. `<child_agent_1_id>` (TypeName: `<child_1_type>`, WD: `<wd_1>`, Runtime Parameters: `context_slug: <context_slug>, <unit_params>`, Output: `<local_output_1>`)
       2. `<child_agent_2_id>` (TypeName: `<child_2_type>`, WD: `<wd_2>`, Runtime Parameters: `context_slug: <context_slug>, <unit_params>`, Output: `<local_output_2>`)
     - Local Revision Loop: Route downstream audit corrections directly to the upstream child agent's `conversationId` via `send_message` (max 2 cycles).
     - Finalization: Verify each child agent's completion and output(s) via `weave_read` and message the parent orchestrator.
     ```

---

## 5. Outputs Verification & User Review Gates (Fail Fast)

Upon subagent or sub-orchestrator wakeup:
1. **Fail-Fast on Verification Errors**: If a subagent reports a `weave_verify` error (such as a missing `inputs` file) or halts in a `blocked` state, update master `weave.md` (`<workspace_root>/runs/<context_slug>`) via `weave_update` with `status: "blocked/<stage_slug>"` (or `"blocked/<reason>"`) and **halt immediately and report the error to the user**—never attempt workarounds.
2. **Verify via `weave_read` (Zero Manual File Copying)**:
   Call `weave_read`: `{ "dir": "<abs_agent_dir>", "expected_status": "completed", "expected_outputs": "<expected_local_filename_or_array_or_null>" }`. `weave_update` already promoted any `<local>: <target>` output bindings to `${RUN_DIR}` upon subagent completion, and `weave_read` verifies that both local and promoted output files exist on disk. Halt immediately if verification fails. Never manually copy or promote subagent output files in the orchestrator.
3. **User Review Gate (when declared in stage guide)**:
   - Transition master status via `weave_update`: `{ "dir": "<workspace_root>/runs/<context_slug>", "status": "awaiting_review/<stage_slug>", "progress": "Awaiting user review of <stage_output_name>" }` (or `"status": "awaiting_review"` for stageless pipelines).
   - Write the stage output to `<appDataDir>/brain/<conversation-id>/<stage_output_name>` (`RequestFeedback: true`, `UserFacing: true`) and pause for approval.
   - **Approved** $\rightarrow$ Advance master status via `weave_update` (`"in_progress/<next_stage>"` or `"completed"` if final stage).
   - **Changes Requested** $\rightarrow$ Transition master status back to `"in_progress/<stage_slug>"` (or `"in_progress"` if stageless) via `weave_update`, route feedback to the existing subagent via `send_message(Recipient: <conversationId>, Message: "<feedback>")` (never spawn duplicate subagent instances), re-verify via `weave_read` upon wakeup, and set `"awaiting_review/<stage_slug>"` again before re-presenting for approval.
