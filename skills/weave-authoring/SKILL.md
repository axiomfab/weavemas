---
name: weave-authoring
description: >-
  Authoring guide for WeaveMAS: designing decoupled multi-agent pipelines, weaving concrete status contracts into agent instructions, and building observable UI dashboards.
---

# WeaveMAS: Authoring & Design Guide

**WeaveMAS** is an architectural pattern for orchestrating multi-agent pipelines with strict directory sandboxing, zero repository exploration, and observable file-based status tracking.

Rather than loading runtime skills during execution, WeaveMAS **weaves concrete contracts directly into agent prompts**, eliminating runtime token overhead and tool call latency.

---

## 🧭 Targeted Authoring Guides

Load only the specific guide for the entity you are authoring:

| Building Target | Reference Guide | When to Read |
| :--- | :--- | :--- |
| **Agents** | [`references/authoring_agent.md`](references/authoring_agent.md) | Weaving concrete role-specific `status.md` contracts and deliverables directly into agent definitions with zero meta-optionality. |
| **Orchestrators** | [`references/authoring_orchestrator.md`](references/authoring_orchestrator.md) | Weaving pre-spawn hooks, relative directory scoping from `output/<context_slug>/`, and state supervision into orchestrators. |
| **UI & Dashboards** | [`references/authoring_ui.md`](references/authoring_ui.md) | Building Sidecar extensions, web panels, tree visualizers, and state parsers that observe WeaveMAS filesystem states. |

---

## 🏛️ The Three WeaveMAS Pillars
1. **Directory as Sandbox**: Every agent's workspace is an isolated subfolder. The orchestrator operates at `output/<context_slug>/`; subagents run in relative directories with their `Cwd` scoped to their assigned folder.
2. **File as State Machine**: All state, logs, and handoffs are serialized into canonical `status.md` files. Zero fragile inter-process tool calls.
3. **Concrete Inlining (Zero Meta-Optionality)**: Each agent's instructions contain only its exact role-specific deliverable and states—never abstract menus of options.
