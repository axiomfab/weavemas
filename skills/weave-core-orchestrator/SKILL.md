---
name: weave-core-orchestrator
description: >-
  Self-contained WeaveMAS orchestrator protocol. Includes inline weavemas_weave MCP
  tool signatures, Step 0 stage directory scaffolding, Phase 1 provisioner delegation,
  Phase 2 agent discovery/dispatch (Protocols A & B), and batch weave_read verification.
---

# 👑 WeaveMAS Core Orchestrator Protocol

> **Single Startup Read Mandate**: This skill is self-contained for Step 0, Phase 1, Phase 2 (Protocols A & B), and User Review Gates. Do **NOT** read `orchestrator-agent-instantiation/SKILL.md` or `orchestrator-agent-execution/SKILL.md` on startup, and do **NOT** call `read_file` / `view_file` on `<appDataDir>/mcp/weavemas_weave/*.json` unless an unexpected schema error occurs.

## 0. Inline `weavemas_weave` MCP Signatures (`ServerName: "weavemas_weave"`)

All directory and mirror arguments (`dir`, `dirs`, `stage_dir`, `directory`, `mirror_to`) **must be absolute paths**:
* `weave_init`: `{"dir": string, "type"?: "agent"|"orchestrator", "status"?: string, "instructions_file"?: string, "inputs"?: string[], "outputs"?: string|string[], "conversation_id"?: string}`
* `weave_update`: `{"dir": string, "status"?: string, "type"?: "agent"|"orchestrator", "progress"?: string, "outputs"?: string|string[], "conversation_id"?: string, "mirror_to"?: string}`
* `weave_verify`: `{"dir": string, "expected_role"?: string}`
* `weave_read`: `{"dir"?: string, "dirs"?: string[], "stage_dir"?: string, "expected_outputs"?: string|string[]|null, "expected_status"?: string, "mirror_to"?: string}` *(pass exactly one of `dir`, `dirs`, or `stage_dir`; `mirror_to` is `dir`-only)*
* `discover_agents`: `{"directory": string, "filter_status"?: string, "limit"?: number}`

---

## 1. Workspace Sandbox & Master Status Contract

* **Master Execution Root**: Scope every run to `runs/<context_slug>/`. Never write files to `./` or create/modify runtime code, scripts, helpers, or tests.
* **Universal MCP Status Mandate**: Never read (`view_file` / `read_file`) or edit (`write_to_file` / `write_file`) any `weave.md` file directly.
  - Root orchestrator calls `weave_init` **ONLY** for master `runs/<context_slug>/weave.md` (never scaffold worker folders or call `weave_init` for stage agents directly).
  - **Every** master `weave_update` call MUST pass `"type": "orchestrator"` (rejected otherwise); omit `status` and `type` only when persisting a worker's `"conversation_id"` to its `<agent_dir>/weave.md`.
* **Master Status Grammar `[<stage_slug>/]<state>[/<detail>]`**: `<state>` $\in$ `{not_started, in_progress, waiting, awaiting_review, blocked, completed}`; `<detail>` is optional (e.g. `iteration_2`).
  - **Staged pipelines**: `<stage_slug>` is **required** and must match an existing stage directory (e.g. `stage01_setup/in_progress`, `stage02_concept/awaiting_review`, `<last_stage_slug>/completed`).
  - **Stageless pipelines**: omit `<stage_slug>` (e.g. `in_progress`, `awaiting_review`, `completed`).

---

## 2. Step 0: Upfront Stage Scaffolding & Master Status

1. **Pre-Create Stage Directories**: For staged pipelines, create all empty `runs/<context_slug>/stage<NN>_<slug>/` directories upfront so the UI renders the full stepper immediately (skip if stageless).
2. **Initialize Master Status**: Call `weave_init`: `{"dir": "<workspace_root>/runs/<context_slug>", "type": "orchestrator", "status": "<first_stage_slug>/in_progress"}` (or `"status": "in_progress"` if stageless).
3. **Announce UI Tracker**: Output `[WeaveMAS UI](sidecar://weavemas/panel/)` at pipeline start and at the start of every stage.

---

## 3. Phase 1: Stage Agent Instantiation (`provisioner`)

At the start of every stage (before evaluating `## Execution` or spawning workers), invoke the plugin's `provisioner` subagent (`TypeName: "provisioner"` or `"weavemas:provisioner"`, `Model: "flash"`, `Role: "provisioner"`):
```markdown
Target Manifest / Stage Guide: <absolute_path_to_manifest_or_stage_md>
Target Directory: <workspace_root>/runs/<context_slug>/<stage_slug>
Context Slug: <context_slug>
```
*(Omit `/<stage_slug>` in stageless pipelines.)* Wait reactively for `PROVISIONING_COMPLETE` without inspecting `weave.md` files or checking `.agent/agents/provisioner.md`.

---

## 4. Phase 2: Agent Discovery & Dispatch (Protocols A & B)

Upon `PROVISIONING_COMPLETE`, never execute domain tasks in the orchestrator context:
1. **Discover Provisioned Agents (Paginated)**: Call `discover_agents` (`{"directory": "<workspace_root>/runs/<context_slug>/<stage_slug>", "filter_status": "initialized", "limit": 10}`). Repeat for the next wave if `remaining_count > 0`.
2. **Select Protocol**: If `## Execution` specifies `sub-orchestrator`, use **Protocol B**; otherwise use **Protocol A**.
3. **Protocol A — Direct Sequential or Parallel Workers**:
   - Dispatch via `invoke_subagent` using `TypeName: "<filename_stem_of_instructions_file>"` and `Role: "<agent_id>"` (omit `Model` so frontmatter `model:` applies; never tell the worker to read its own `instructions_file`). Pass:
     ```markdown
     Assigned Working Directory: <dir>/

     Runtime Parameters:
     - context_slug: <context_slug>
     - <param_name>: <param_value>

     Required Output: <local_output_filename>
     ```
     *(Pass ONLY the local left-hand filename(s) of any `<local>: <target>` binding in `outputs`; omit `Required Output:` if `outputs` is empty.)*
   - **Persist `conversation_id` Immediately**: Right after `invoke_subagent` returns `conversationId`, call `weave_update`: `{"dir": "<dir>", "conversation_id": "<conversationId>"}` (omit `status` so worker state is preserved).
4. **Protocol B — Ephemeral Sub-Orchestrator Clusters**:
   - Discover cluster child agents (`filter_status: "initialized"`), then invoke `TypeName: "self"`, `Model: "inherit"`, `Role: "suborchestrator_<unit_id>"` (concurrently only if `execute in parallel` is declared):
     ```markdown
     Act as the Ephemeral Sub-Orchestrator for <unit_id> (<assigned_cluster_name>). Context Slug: <context_slug>
     Inline MCP (`ServerName: "weavemas_weave"` — do NOT read `<appDataDir>/mcp/weavemas_weave/*.json`):
     - weave_update: {"dir": string, "status"?: string, "type"?: "agent"|"orchestrator", "progress"?: string, "outputs"?: string|string[], "conversation_id"?: string, "mirror_to"?: string}
     - weave_read: {"dir"?: string, "dirs"?: string[], "stage_dir"?: string, "expected_outputs"?: string|string[]|null, "expected_status"?: string, "mirror_to"?: string}
     Constraints: Operate in runs/<context_slug>/ (never create nested <unit_id>/ folders or any weave.md for yourself; never touch root weave.md; zero file staging; halt immediately and report if any child fails weave_verify). Dispatch each child sequentially via invoke_subagent (TypeName: "<child_type>", Role: "<child_id>", omit Model, include context_slug and unit params, pass local Required Output only), immediately persist its conversationId via weave_update({"dir": "<child_wd>", "conversation_id": "<conversationId>"}), route audit revisions via send_message (max 2 cycles), batch-verify via weave_read({"dirs": ["<wd_1>", ...], "expected_status": "completed"}), and reply with a 1-line completion ack:
     1. <child_1_id> (TypeName: <child_1_type>, WD: <wd_1>, Params: context_slug: <context_slug>, <unit_params>, Output: <local_output_1>)
     2. <child_2_id> (TypeName: <child_2_type>, WD: <wd_2>, Params: context_slug: <context_slug>, <unit_params>, Output: <local_output_2>)
     ```

---

## 5. Verification, User Review Gates & Stage Transitions

1. **Fail-Fast on Errors (No Workarounds)**: If any subagent reports a `weave_verify` failure or halts in `blocked`, call master `weave_update` (`{"dir": "<workspace_root>/runs/<context_slug>", "type": "orchestrator", "status": "<stage_slug>/blocked", "progress": "<error summary>"}` or `"status": "blocked"` if stageless), **halt immediately**, and surface the error to the user.
2. **Verify via `weave_read` (Batch Waves & Zero Manual File Copying)**:
   - **Single Worker**: `weave_read`: `{"dir": "<abs_agent_dir>", "expected_status": "completed", "expected_outputs": "<local_file_or_array_or_null>"}`.
   - **Parallel Wave or Multi-Agent Stage (Mandatory Single Batch Call)**: Never emit $N$ separate `weave_read` calls. Verify in one call via `"dirs": [...]` or `"stage_dir": "<workspace_root>/runs/<context_slug>/<stage_slug>"` with `"expected_status": "completed"`; halt if `verified` is `false` or `missing_outputs` is non-empty. (`weave_update` auto-promotes `<local>: <target>` bindings; never copy subagent outputs manually.)
3. **Zero-Copy User Review Gate** *(when declared)*:
   - Set master `weave_update`: `{"dir": "<workspace_root>/runs/<context_slug>", "type": "orchestrator", "status": "<stage_slug>/awaiting_review", "progress": "Awaiting user review of <stage_output_name>"}` (or `"status": "awaiting_review"` if stageless).
   - **NEVER** `read_file` + `write_file` full deliverables through LLM context. Present `[WeaveMAS UI](sidecar://weavemas/panel/)` and a direct clickable `file://` link to `${RUN_DIR}/<stage_output_name>` (use optional `mirror_to` in `weave_update`/`weave_read` only when an external copy is explicitly required).
   - **Revision Requested**: Set master `weave_update` (`type: "orchestrator"`, `status: "<stage_slug>/in_progress/iteration_<N>"` or `"in_progress/iteration_<N>"`), retrieve the worker's persisted `conversation_id` via `weave_read` or `discover_agents`, send feedback via `send_message` (never spawn duplicates), re-verify via `weave_read`, and return to `awaiting_review`.
4. **Stage Advance & Final Completion**:
   - **Next Stage**: Call `weave_update` (`{"dir": "<workspace_root>/runs/<context_slug>", "type": "orchestrator", "status": "<next_stage_slug>/in_progress", "progress": "<Handoff summary>"}`), output `[WeaveMAS UI](sidecar://weavemas/panel/)`, and repeat Phases 1–2.
   - **Pipeline Complete**: Call `weave_update` (`{"dir": "<workspace_root>/runs/<context_slug>", "type": "orchestrator", "status": "<last_stage_slug>/completed", "outputs": "<final_pipeline_output_path>", "progress": "<Final summary>"}`, or `"status": "completed"` if stageless).
