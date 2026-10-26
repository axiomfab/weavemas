---
name: weave-authoring
description: >-
  Authoring guide for WeaveMAS: designing decoupled multi-agent pipelines, weaving concrete status contracts into agent instructions, building observable UI dashboards, and revising outcomes and pipeline definitions from user feedback.
---

# WeaveMAS: Authoring & Design Guide

**WeaveMAS** orchestrates multi-agent pipelines with strict directory sandboxing, zero repository exploration, and file-based status tracking. Load only the reference guide matching your current authoring target:

| Target | Reference Guide | When to Read |
| :--- | :--- | :--- |
| **Agents** | [`references/authoring_agent.md`](references/authoring_agent.md) | Authoring flat `.agent/agents/<agent_name>.md` definitions. |
| **Orchestrators** | [`references/authoring_orchestrator.md`](references/authoring_orchestrator.md) | Authoring `orchestrator_trigger.md`, `orchestrator.md`, and `orchestrator/*.md` stage guides. |
| **Parallelization** | [`references/authoring_parallelization.md`](references/authoring_parallelization.md) | Designing sequential/parallel workflows and ephemeral sub-orchestrators. |
| **Static Verification** | [`references/authoring_verification.md`](references/authoring_verification.md) | **Mandatory** after authoring or revising any pipeline: verifying the Pipeline Data-Flow Graph and printing the stage-by-stage checkbox report. |
| **Outcome Revision** | [`references/authoring_revision.md`](references/authoring_revision.md) | Diagnosing user feedback to propose immediate outcome fixes (`c`) and pipeline improvements (`r`). |
| **UI & Dashboards** | [`references/authoring_ui.md`](references/authoring_ui.md) | Building sidecar extensions and web panels that observe `status.md` files. |

---

## 🏛️ Core Authoring Constraints

1. **Concrete Inlining (Zero Meta-Optionality)**: Author only exact role-specific paths, deliverables, and tasks—never abstract menus of options or raw MCP tool JSON payloads.
2. **Closed 6-Key `status.md` Frontmatter**: Locked strictly to `type`, `status`, `instructions_file`, `inputs`, `deliverable`, `updated_at`. Never invent extra keys (e.g., `role`, `is_completed`, `progress`) without explicit user permission.
3. **Model Selection**: Configure subagents with `flash` (recommended default), `pro`, or `inherit`. **NEVER use `flash_lite`** (fails to invoke `call_mcp_tool` reliably).
