---
name: weave-authoring
description: >-
  Authoring guide for WeaveMAS: designing decoupled multi-agent pipelines, weaving concrete status contracts into agent instructions, building observable UI dashboards, and revising outcomes and pipeline definitions from user feedback.
---

# WeaveMAS: Authoring & Design Guide

**WeaveMAS** is an architectural pattern for orchestrating multi-agent pipelines with strict directory sandboxing, zero repository exploration, and observable file-based status tracking.

Rather than loading runtime skills during execution, WeaveMAS **weaves concrete contracts directly into agent prompts**, eliminating runtime token overhead and tool call latency.

---

## 🧭 Targeted Authoring Guides

Load only the specific guide for the entity you are authoring or revising:

| Building Target | Reference Guide | When to Read |
| :--- | :--- | :--- |
| **Agents** | [`references/authoring_agent.md`](references/authoring_agent.md) | Weaving concrete role-specific `status.md` contracts and deliverables directly into agent definitions with zero meta-optionality. |
| **Orchestrators** | [`references/authoring_orchestrator.md`](references/authoring_orchestrator.md) | Weaving pre-spawn hooks, relative directory scoping from `output/<context_slug>/`, and state supervision into orchestrators. |
| **Parallelization Strategies** | [`references/authoring_parallelization.md`](references/authoring_parallelization.md) | Designing parallel workflows: selecting between Sequential, Flat Wave Parallelism, and Hierarchical 2-Tier Sub-Orchestration based on workflow semantics. |
| **Outcome Review & Revision** | [`references/authoring_revision.md`](references/authoring_revision.md) | Diagnosing user feedback on pipeline outcomes to propose both (1) an immediate outcome fix and (2) systemic agent/orchestrator improvements. |
| **UI & Dashboards** | [`references/authoring_ui.md`](references/authoring_ui.md) | Building Sidecar extensions, web panels, tree visualizers, and state parsers that observe WeaveMAS filesystem states. |

---

## 🏛️ The Four WeaveMAS Pillars
1. **Directory as Sandbox**: Every agent's workspace is an isolated subfolder. The orchestrator operates at `output/<context_slug>/`; subagents run in relative directories with their `Cwd` scoped to their assigned folder.
2. **File as State Machine**: All state, logs, and handoffs are serialized into canonical `status.md` files. Zero fragile inter-process tool calls.
3. **Concrete Inlining (Zero Meta-Optionality)**: Each agent's instructions contain only its exact role-specific deliverable and states—never abstract menus of options.
4. **Strictly Closed 5-Key Frontmatter Standard**: All `status.md` files are strictly locked to EXACTLY 5 frontmatter keys: `type`, `role`, `status`, `deliverable`, `updated_at`.
   - **Mandatory User Approval Rule**: Every time the author/assistant wants to introduce or modify a frontmatter parameter, it **MUST explicitly ask the user** for permission first. Adding unapproved parameters (e.g. `is_completed`, `progress`, `success`, `deliverable_exists`) is strictly forbidden.
   - **No Derived State in Frontmatter**: State is derived directly from raw values (`status: "completed"`, `deliverable: "file.md"`). Never invent synthetic booleans.
   - **No Narrative Logs in Frontmatter**: Progress summaries and step logs belong exclusively in the Markdown body, never in YAML frontmatter.

---

## 🤖 Model Tier Selection & Constraints

* **Supported Subagent Models**: `flash` (recommended default for cost/throughput balance), `pro` (complex reasoning/synthesis), or `inherit`.
* ⚠️ **Strict Ban on `flash_lite`**: **Do NOT use `flash_lite`** for WeaveMAS subagents. `flash_lite` consistently fails to invoke and format calls to MCP tools (`call_mcp_tool`), causing `status_verify` pre-flight checks and `status_update` lifecycle reporting to fail. Until dedicated CLI tooling is available for status tracking, all WeaveMAS subagents must be configured with `flash`, `pro`, or `inherit`.
