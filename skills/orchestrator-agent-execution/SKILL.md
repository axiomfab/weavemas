---
name: orchestrator-agent-execution
description: >-
  Standalone Phase 2 reference (already inlined in weave-orchestrator — do NOT
  read this file if weave-orchestrator is already loaded).
---

# 🚀 Phase 2: Orchestrator Agent Execution

> **Note**: Already inlined in `weave-orchestrator`. Skip reading this skill when `weave-orchestrator` is loaded. Do **NOT** call `read_file` / `view_file` on `<appDataDir>/mcp/weavemas_weave/*.json` unless an unexpected schema error occurs.

## Inline `weavemas_weave` MCP Signatures (`ServerName: "weavemas_weave"`)
* `weave_init`: `{"dir": string, "type"?: "agent"|"orchestrator", "status"?: string, "instructions_file"?: string, "inputs"?: string[], "outputs"?: string|string[], "conversation_id"?: string}`
* `weave_update`: `{"dir": string, "status"?: string, "type"?: "agent"|"orchestrator", "progress"?: string, "outputs"?: string|string[], "conversation_id"?: string, "mirror_to"?: string}`
* `weave_verify`: `{"dir": string, "expected_role"?: string}`
* `weave_read`: `{"dir"?: string, "dirs"?: string[], "stage_dir"?: string, "expected_outputs"?: string|string[]|null, "expected_status"?: string, "mirror_to"?: string}` *(exactly one of `dir`, `dirs`, `stage_dir`; `mirror_to` is `dir`-only)*
* `weave_discover_agents`: `{"directory": string, "filter_status"?: string, "limit"?: number}`

## 1. Per-Stage Delegation vs. Direct Discovery
1. **Multi-Stage Pipelines**: The Root Orchestrator stays thin by delegating each stage (`S1..SN`) via `invoke_subagent` to `TypeName: "stage_orchestrator"` (or `"weavemas:stage_orchestrator"`), `Model: "inherit"`, `Role: "stage_orchestrator_<stage_slug>"` (`Mode: stage`, passing `Stage Guide`, `Stage Directory`, `Context Slug`, and `Runtime Parameters`). Keep every completed `stage_orchestrator` session **idle** (never `kill` via `manage_subagents`, preserving child worker conversations for surgical `send_message` edits).
2. **Stageless Runs / Inside `stage_orchestrator`**: Call `weave_discover_agents` (`{"directory": "<workspace_root>/runs/<context_slug>[/<stage_slug>]", "filter_status": "initialized", "limit": 10}`); repeat if `remaining_count > 0`. If `## Execution` declares `sub-orchestrator`, use **Protocol B**; otherwise use **Protocol A**. Never execute domain work in orchestrator context.

## 2. Protocol A: Direct Workers
1. Dispatch via `invoke_subagent` (`TypeName: "<stem_of_instructions_file>"`, `Role: "<agent_id>"`, omit `Model`, pass `Assigned Working Directory: <dir>/`, `Runtime Parameters:` with `context_slug`, and local-only `Required Output:` if `outputs` is non-empty).
2. Immediately persist `conversationId` via `weave_update`: `{"dir": "<dir>", "conversation_id": "<conversationId>"}` (omit `status`).

## 3. Protocol B: Ephemeral Cluster Sub-Orchestrators (`stage_orchestrator`)
1. Discover cluster child agents (`filter_status: "initialized"`), then invoke `TypeName: "stage_orchestrator"` (or `"weavemas:stage_orchestrator"`), `Model: "inherit"`, `Role: "suborchestrator_<unit_id>"` (**never** `TypeName: "self"`, avoiding `18K–27K` main-harness prefill bloat; dispatch concurrently only if `execute in parallel` is specified).
2. Pass `Mode: cluster`, `Unit ID: <unit_id>`, `Context Slug: <context_slug>`, and the ordered list of pre-initialized children (`<child_id>`, `TypeName`, `WD`, `Params`, local `Output`). `stage_orchestrator` enforces shared `runs/<context_slug>/` scoping, zero self/root `weave.md` writes, sequential child dispatch + immediate `conversation_id` persistence, `send_message` revision loops (max 2 cycles), single batch `weave_read` (`dirs: [...]`, `expected_status: "completed"`), idle child preservation (never `kill`), and a 1-line `CLUSTER_COMPLETED` ack.

## 4. Verification & Zero-Copy Review Gates
1. **Fail Fast**: On `STAGE_BLOCKED` / `CLUSTER_BLOCKED`, `weave_verify` failure, or `blocked` state, update master `weave.md` (`type: "orchestrator"`, `status: "<stage_slug>/blocked"` or `"blocked"`) and halt immediately.
2. **Batch `weave_read`**: Use `dir` for a single worker, or one batch `weave_read` (`dirs` or `stage_dir`, `expected_status: "completed"`) for waves/stages; halt if `verified` is `false` or `missing_outputs` is non-empty.
3. **Zero-Copy Review Gate**: Set `status: "<stage_slug>/awaiting_review"` (`type: "orchestrator"`), surface `[WeaveMAS UI](sidecar://weavemas/panel/)` + clickable `file://` link to `${RUN_DIR}/<stage_output_name>` (never `read_file` + `write_file` deliverables; use `mirror_to` if an external copy is explicitly needed), and route revisions via `send_message` to the idle `stage_orchestrator` or persisted worker `conversation_id` (`status: "<stage_slug>/in_progress/iteration_<N>"`).
