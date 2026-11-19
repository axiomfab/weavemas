---
name: orchestrator-agent-execution
description: >-
  Standalone Phase 2 reference (already inlined in weave-core-orchestrator — do NOT
  read this file if weave-core-orchestrator is already loaded).
---

# 🚀 Phase 2: Orchestrator Agent Execution

> **Note**: Already inlined in `weave-core-orchestrator`. Skip reading this skill when `weave-core-orchestrator` is loaded. Do **NOT** call `read_file` / `view_file` on `<appDataDir>/mcp/weavemas_weave/*.json` unless an unexpected schema error occurs.

## Inline `weavemas_weave` MCP Signatures (`ServerName: "weavemas_weave"`)
* `weave_init`: `{"dir": string, "type"?: "agent"|"orchestrator", "status"?: string, "instructions_file"?: string, "inputs"?: string[], "outputs"?: string|string[], "conversation_id"?: string}`
* `weave_update`: `{"dir": string, "status"?: string, "type"?: "agent"|"orchestrator", "progress"?: string, "outputs"?: string|string[], "conversation_id"?: string, "mirror_to"?: string}`
* `weave_verify`: `{"dir": string, "expected_role"?: string}`
* `weave_read`: `{"dir"?: string, "dirs"?: string[], "stage_dir"?: string, "expected_outputs"?: string|string[]|null, "expected_status"?: string, "mirror_to"?: string}` *(exactly one of `dir`, `dirs`, `stage_dir`; `mirror_to` is `dir`-only)*
* `discover_agents`: `{"directory": string, "filter_status"?: string, "limit"?: number}`

## 1. Discover & Select Protocol
1. Call `discover_agents` (`{"directory": "<workspace_root>/runs/<context_slug>/<stage_slug>", "filter_status": "initialized", "limit": 10}`); repeat if `remaining_count > 0`.
2. If `## Execution` declares `sub-orchestrator`, use **Protocol B**; otherwise use **Protocol A**. Never execute domain work in orchestrator context.

## 2. Protocol A: Direct Workers
1. Dispatch via `invoke_subagent` (`TypeName: "<stem_of_instructions_file>"`, `Role: "<agent_id>"`, omit `Model`, pass `Assigned Working Directory: <dir>/`, `Runtime Parameters:` with `context_slug`, and local-only `Required Output:` if `outputs` is non-empty).
2. Immediately persist `conversationId` via `weave_update`: `{"dir": "<dir>", "conversation_id": "<conversationId>"}` (omit `status`).

## 3. Protocol B: Ephemeral Sub-Orchestrators
1. Discover cluster child agents (`filter_status: "initialized"`), then invoke `TypeName: "self"`, `Model: "inherit"`, `Role: "suborchestrator_<unit_id>"` (concurrently only if `execute in parallel` is specified).
2. Require shared `runs/<context_slug>/` root, zero self/root `weave.md` writes, inline `weave_update`/`weave_read` signatures (no `<appDataDir>/mcp/weavemas_weave/*.json` reads), sequential native child dispatch + immediate `conversation_id` persistence, `send_message` revision loop (max 2 cycles), single batch `weave_read` (`dirs: [...]`, `expected_status: "completed"`), and a 1-line completion ack.

## 4. Verification & Zero-Copy Review Gates
1. **Fail Fast**: On `weave_verify` failure or `blocked` state, update master `weave.md` (`type: "orchestrator"`, `status: "<stage_slug>/blocked"` or `"blocked"`) and halt immediately.
2. **Batch `weave_read`**: Use `dir` for a single worker, or one batch `weave_read` (`dirs` or `stage_dir`, `expected_status: "completed"`) for waves/stages; halt if `verified` is `false` or `missing_outputs` is non-empty.
3. **Zero-Copy Review Gate**: Set `status: "<stage_slug>/awaiting_review"` (`type: "orchestrator"`), surface `[WeaveMAS UI](sidecar://weavemas/panel/)` + clickable `file://` link to `${RUN_DIR}/<stage_output_name>` (never `read_file` + `write_file` deliverables; use `mirror_to` if an external copy is explicitly needed), and route revisions via `send_message` using persisted `conversation_id` (`status: "<stage_slug>/in_progress/iteration_<N>"`).
