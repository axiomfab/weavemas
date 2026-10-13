# WeaveMAS Status Architecture & Contracts

WeaveMAS separates state observability and execution into two coordinated tiers:

---

## 🏛️ Two-Tier Architecture

| Level | File Location | Node Type | Reference Guide | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Agent** | `<stage>/agents/<role>/status.md` | `agent` | [`weave_agent_protocol.md`](./weave_agent_protocol.md) | Universal WeaveMAS agent specification: CWD boundaries, read exceptions, ZUE, and lifecycle tracking. |
| **Orchestrator** | `output/<context_slug>/status.md` | `orchestrator` | [`orchestrator_status_contract.md`](./orchestrator_status_contract.md) | End-to-end pipeline stage progression, stage handoffs, and final compiled deliverables. |

---

## 🔑 Shared Principles

1. **Standard Frontmatter**: Both files use YAML frontmatter enclosed in `---` blocks with `type`, `role`, `status`, `deliverable`, and `updated_at`.
2. **Fail-Fast Validation**: When marking any node `completed`, the deliverable file must exist on disk.
3. **Observability**: File watchers and UI sidecars discover pipeline state strictly by observing these two file types, requiring zero inter-process message passing.
