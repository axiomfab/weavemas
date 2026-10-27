---
name: weave-core-orchestrator
description: >-
  Core WeaveMAS orchestrator protocol. Enforces workspace sandboxing, universal MCP
  status tooling, Step 0 stage directory scaffolding, and autonomous chaining of the
  orchestrator-agent-instantiation and orchestrator-agent-execution microskills.
---

# 👑 WeaveMAS Core Orchestrator Protocol

All status and discovery operations use `call_mcp_tool` with `ServerName: "weavemas_weave"`. All `dir` / `directory` arguments **must be absolute paths**.

---

## 1. Workspace Sandbox & Boundaries

* **Master Execution Root**: Scope every run to `output/<context_slug>/`. Never write files to the workspace root (`./`).
* **Zero Runtime Code Creation**: Never create or modify code files, scripts, helpers, or tests during a pipeline run.
* **Universal MCP Status Mandate**: Never read (`view_file`) or manually edit (`write_to_file`) any `weave.md` file. Translate all declarative `weave.md` directives in stage guides into `weavemas_weave` MCP tool calls:
  - `weave_init`: Used by the root orchestrator **ONLY** for the root master status (`output/<context_slug>/weave.md`).
  - `weave_update`: Advance or complete master pipeline status.
  - `weave_read`: Verify subagent completion and output existence.
  - `discover_agents`: Discover provisioned stage subagents (including their `instructions_file` and `inputs`).
* **Strict Worker Scaffolding Prohibition**: The root orchestrator is **strictly forbidden** from creating worker agent directories or calling `weave_init` for stage agents directly. Always delegate stage setup to Phase 1 (`orchestrator-agent-instantiation`).
* **Fail-Fast on Subagent Verification Failure (No Workarounds)**: If any subagent halts because `weave_verify` failed (e.g. a declared `inputs` file does not exist on disk), the orchestrator **MUST halt immediately and surface the error to the user**. Never attempt workarounds such as manually copying files or editing `weave.md`.

---

## 2. Step 0: Upfront Stage Scaffolding & Master Status

Before running any stage:
1. **Pre-Create Stage Directories**: If the pipeline declares stages, create all empty stage directories (e.g. `output/<context_slug>/stage01_setup/`, `stage02_concept/`) upfront so the UI sidecar renders the full pipeline stepper immediately. (Skip for single-file/stageless pipelines).
2. **Initialize Master Status**:
   Call `weave_init`: `{ "dir": "<workspace_root>/output/<context_slug>", "type": "orchestrator", "status": "in_progress/<first_stage_or_step>" }`
3. **Announce UI Tracker**: Output `[WeaveMAS UI](sidecar://weavemas/panel/)` at pipeline start and at the start of every stage.

---

## 3. Two-Phase Stage Execution Loop

Execute every stage (or stageless manifest) by chaining these two microskills in strict sequence:
1. **Phase 1 — `orchestrator-agent-instantiation`**: Delegate stage workspace provisioning to the `provisioner` subagent and wait reactively for `PROVISIONING_COMPLETE`.
2. **Phase 2 — `orchestrator-agent-execution`**: Immediately upon receiving `PROVISIONING_COMPLETE`, expand and execute `orchestrator-agent-execution` to discover, dispatch, and verify stage agents.

---

## 4. Stage Transitions & Pipeline Completion

* **Advance to Next Stage**:
  Call `weave_update`: `{ "dir": "<workspace_root>/output/<context_slug>", "status": "in_progress/<next_stage>", "progress": "<Stage handoff summary>" }`, output `[WeaveMAS UI](sidecar://weavemas/panel/)`, and repeat the Two-Phase loop.
* **Final Pipeline Completion**:
  Call `weave_update`: `{ "dir": "<workspace_root>/output/<context_slug>", "status": "completed", "outputs": "<final_pipeline_output_path>", "progress": "<Final execution summary>" }`
