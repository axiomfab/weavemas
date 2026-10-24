# WeaveMAS Orchestrator Status Contract Reference

This document defines the contract for the master `status.md` file maintained by the root orchestrator at the root of the context directory (`output/<context_slug>/status.md`).

---

## 1. Frontmatter Specification

```yaml
---
type: orchestrator
status: in_progress/stage01_setup
deliverable: null
updated_at: "2026-10-13T22:30:00.000000+00:00"
---
```

### Fields

* **`type`**: Always `orchestrator`. Identifies the master control node for pipeline trackers and UI panels.
* **`status`**: Overall pipeline stage state:
  * `in_progress/<stage_name>`: Actively running a pipeline stage (e.g., `in_progress/stage01_setup`, `in_progress/stage02_concept`).
  * `completed`: Entire pipeline has finished and final deliverable is produced.
  * `blocked/<reason>`: Pipeline blocked pending manual user review or error.
* **`deliverable`**: Relative path to the final compiled pipeline output (e.g. `final_broadcast.md` or `07_video/render.mp4`). Must remain `null` while intermediate stages are running.
* **`updated_at`**: ISO 8601 UTC timestamp.

---

## 2. Markdown Content Body Specification

The markdown body of the orchestrator's `status.md` provides a running pipeline execution summary.

### Content Guidelines

1. **Active Stage & Dispatches**:
   * Current stage objective and list of dispatched subagent roles.
2. **Stage Progression & Handoff Log**:
   * When advancing from one stage to the next, append a concise milestone summary of completed stage deliverables.
   * Document key decisions or sign-offs (e.g., writer persona selected, concept locked).
3. **Executive Scope**:
   * Keep the summary high-level. Do not duplicate the internal work logs of individual subagents; reference their deliverables instead.
