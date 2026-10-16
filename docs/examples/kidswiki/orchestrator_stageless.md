# Annotated Source: Single-File `orchestrator.md` (Without Stages)

[← Back to Tutorial](../../TUTORIAL.md)

When a pipeline only has a handful of agents and does not need separate stage milestones or stage-level review gates, WeaveMAS lets you put the entire orchestration blueprint in a **single `orchestrator.md` file**—with no `orchestrator/` subfolder required.

---

## Generated Source Code (`orchestrator.md`)

```markdown
# Multi-Agent KidsWiki Orchestrator Guide (Stageless Mode)

Operate as a WeaveMAS orchestrator. You MUST use the `weave-core-orchestrator` skill to manage workspace scaffolding, subagent pre-spawn hooks, and pipeline lifecycle tracking.

## Inputs
- `topic`: The article subject (e.g., `"Rocket"`). Required.
- `target_age`: Target reader age between `3` and `12` (default: `4`).

## Output Structure
Every run is scoped to a dedicated context directory matching:
`output/kidswiki_<topic_slug>_age<target_age>/` (e.g., `output/kidswiki_rocket_age4/`).

All agent workspaces (`agents/<agent_id>/`), status tracking files, and the final compiled deliverable (`<topic_slug>.md`) live strictly inside this context root.

## Agents

### Writer Agent: `writer`
* **Instructions**: [agent_writer.md](.agent/agents/agent_writer.md)
* **Working Directory**: `agents/writer/`

### Fact Checker Agent: `fact_checker`
* **Instructions**: [agent_fact_checker.md](.agent/agents/agent_fact_checker.md)
* **Working Directory**: `agents/fact_checker/`

## Execution
1. **`writer`**:
   - Inputs: Tier 1 parameters (`Topic: <topic>`, `Target Age: <target_age>`).
   - Execution: Draft the age-calibrated article text into `draft.md`.
   - Handoff: Ingest verified `draft.md` and stage into `fact_checker` workspace (`agents/fact_checker/draft.md`).

2. **`fact_checker`**:
   - Inputs: Staged `draft.md`, Tier 1 parameter (`Topic: <topic>`).
   - Execution: Strictly audit all factual and scientific claims in `draft.md`, saving findings to `audit.md`.
   - Revision Loop (Max 2 Cycles):
     - Inspect `audit.md`. If it contains `VERDICT: REVISION_REQUIRED`, send the correction bullets to the existing `writer` session via `send_message(Recipient: <writer_conversationId>)`.
     - Once `writer` updates `draft.md` in place, re-stage `draft.md` into `agents/fact_checker/draft.md` and notify `fact_checker` via `send_message(Recipient: <fact_checker_conversationId>)` to re-verify.

3. **Final Deliverable Ingestion**:
   - Once `audit.md` contains `VERDICT: APPROVED`, copy verified `draft.md` to `output/kidswiki_<topic_slug>_age<target_age>/<topic_slug>.md`.
```

---

## How Stageless Mode Differs from Multi-Stage Mode

1. **Everything in One File**: Instead of linking out to `orchestrator/stage1_editorial.md` and `orchestrator/stage2_publishing.md`, the `## Agents` list and the 4-step `## Execution` sequence live directly inside `orchestrator.md`.
2. **Flat Agent Workspaces (`agents/<agent_id>/`)**: Each agent's working directory sits directly under the run root (`output/kidswiki_rocket_age4/agents/writer/`, `.../agents/fact_checker/`, `.../agents/illustrator/`) instead of being nested inside `stage01_.../` folders.
3. **Direct Agent-to-Agent Handoff**: Once `fact_checker` approves the draft, the orchestrator copies the verified draft straight into `agents/illustrator/approved_draft.md` without needing an intermediate stage deliverable file.
