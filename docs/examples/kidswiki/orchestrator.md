# Annotated Source: `orchestrator.md` & Stage Protocols

[← Back to Tutorial](../../TUTORIAL.md)

The orchestrator files define the high-level blueprint of the **KidsWiki** pipeline: what inputs it accepts, where outputs live, and how files move from one agent to the next across stages.

Notice that there is **zero tool-calling code** in these files—they are purely declarative.

---

## 1. Master Orchestrator (`orchestrator.md`)

### Generated Source Code

```markdown
# Multi-Agent KidsWiki Orchestrator Guide

Operate as a WeaveMAS orchestrator. You MUST use the `weave-core-orchestrator` skill to manage stage scaffolding, subagent pre-spawn hooks, and pipeline lifecycle tracking.

## Inputs
- `topic`: The article subject (e.g., `"Rocket"`). Required.
- `target_age`: Target reader age between `3` and `12` (default: `4`).

## Output Structure
Every run is scoped to a dedicated context directory matching:
`output/kidswiki_<topic_slug>_age<target_age>/` (e.g., `output/kidswiki_rocket_age4/`).

All stage directories, agent workspaces, status tracking files, and final compiled deliverables (`<topic_slug>.md` and `illustration.png`) live strictly inside this context root.

## Execution
The pipeline executes through sequential stages. For each stage, follow the referenced protocol guide to manage pre-spawn hooks, subagent dispatch, and deliverable verification:

### Stage 1: Editorial & Fact Checking (Writer + Fact Checker)
* **Execution Directory**: `stage01_editorial/`
* **Protocol**: [orchestrator/stage1_editorial.md](orchestrator/stage1_editorial.md)
* **Deliverable**: `01_editorial_approved.md`
* **Gate**: User review approval required before proceeding to Stage 2.

### Stage 2: Illustration & Publishing (Illustrator)
* **Execution Directory**: `stage02_publishing/`
* **Protocol**: [orchestrator/stage2_publishing.md](orchestrator/stage2_publishing.md)
* **Deliverable**: `<topic_slug>.md` (and `illustration.png`)
```

### How Each Part Works
* **Skill Mandate (`weave-core-orchestrator`)**: Instructs the primary agent to load the built-in orchestrator skill. That skill teaches the agent how to pre-create stage directories upfront, initialize master `status.md`, and surface the `[WeaveMAS UI](sidecar://weavemas/panel/)` badge.
* **`## Inputs`**: Defines the runtime parameters (`topic` and `target_age`) that the orchestrator extracts from the user's chat prompt.
* **`## Output Structure`**: Establishes the deterministic folder naming convention (`output/kidswiki_<topic_slug>_age<target_age>/`) so multiple runs never overwrite each other.
* **`## Execution` & Stage Gates**: Maps out each stage's execution directory (`stage01_editorial/`, `stage02_publishing/`), protocol file, stage-level deliverable, and optional **User Review Gate**. Because both stages are declared here, the orchestrator creates both empty stage directories at startup so the UI progress bar immediately knows this is a 2-stage pipeline.

---

## 2. Stage 1 Protocol (`orchestrator/stage1_editorial.md`)

### Generated Source Code

```markdown
# Stage 1: Editorial & Fact Checking

## Objective
Draft an age-calibrated KidsWiki article and verify its scientific and factual accuracy before illustration.

## Agents

### Writer Agent: `writer`
* **Instructions**: [agent_writer.md](.agent/agents/stage1_editorial/agent_writer.md)
* **Working Directory**: `stage01_editorial/agents/writer/`

### Fact Checker Agent: `fact_checker`
* **Instructions**: [agent_fact_checker.md](.agent/agents/stage1_editorial/agent_fact_checker.md)
* **Working Directory**: `stage01_editorial/agents/fact_checker/`

## Execution
1. **`writer`**:
   - Inputs: Tier 1 parameters (`Topic: <topic>`, `Target Age: <target_age>`).
   - Execution: Draft the age-calibrated article and illustration brief into `draft.md`.
   - Handoff: Ingest verified `draft.md` and stage into `fact_checker` workspace (`stage01_editorial/agents/fact_checker/draft.md`).

2. **`fact_checker`**:
   - Inputs: Staged `draft.md`, Tier 1 parameter (`Topic: <topic>`).
   - Execution: Audit all factual and scientific claims in `draft.md`, saving findings to `audit.md`.
   - Revision Loop (Max 2 Cycles):
     - Inspect `audit.md`. If it contains `VERDICT: REVISION_REQUIRED`, send the correction bullets to the existing `writer` session via `send_message(Recipient: <writer_conversationId>)`.
     - Once `writer` updates `draft.md` in place, re-stage `draft.md` into `fact_checker/` and notify `fact_checker` via `send_message(Recipient: <fact_checker_conversationId>)` to re-verify.

3. **Deliverable Ingestion**:
   - Once `audit.md` contains `VERDICT: APPROVED`, ingest the approved draft as stage deliverable `01_editorial_approved.md` at the context root.

4. **User Review Gate**:
   - Present `01_editorial_approved.md` to the user for intermediate review.
   - If the user requests adjustments, send the feedback to `writer` via `send_message(Recipient: <writer_conversationId>)` and re-verify before updating `01_editorial_approved.md`.
   - Do not proceed to Stage 2 until the user approves.
```

### How Each Part Works
* **`## Agents`**: Binds each agent ID (`writer`, `fact_checker`) to its markdown instruction file and its isolated sandbox folder (`stage01_editorial/agents/<id>/`).
* **File Staging (Handoff)**: Notice how `draft.md` is physically copied into `stage01_editorial/agents/fact_checker/draft.md`. The orchestrator never summarizes the article in the prompt—the Fact Checker reads the exact file the Writer wrote.
* **In-Place Revision Loop**: If `audit.md` reports `VERDICT: REVISION_REQUIRED`, the orchestrator uses `send_message` to talk to the **already-running** `writer` session rather than spawning a brand-new subagent.
* **User Review Gate (Intermediate State Review)**: Before moving on to Stage 2 (where the Illustrator generates the image), the orchestrator pauses and lets the user inspect `01_editorial_approved.md`—and even ask for manual tweaks—right from the WeaveMAS UI or chat.

---

## 3. Stage 2 Protocol (`orchestrator/stage2_publishing.md`)

### Generated Source Code

```markdown
# Stage 2: Illustration & Publishing

## Objective
Generate the age-matched illustration and compile the final illustrated markdown article.

## Agents

### Illustrator Agent: `illustrator`
* **Instructions**: [agent_illustrator.md](.agent/agents/stage2_publishing/agent_illustrator.md)
* **Working Directory**: `stage02_publishing/agents/illustrator/`

## Execution
1. **`illustrator`**:
   - Inputs: Stage `01_editorial_approved.md` into `stage02_publishing/agents/illustrator/01_editorial_approved.md`, plus Tier 1 parameters (`Topic: <topic>`, `Topic Slug: <topic_slug>`, `Target Age: <target_age>`).
   - Execution: Read placeholder alt-text prompt, generate `illustration.png`, and copy `01_editorial_approved.md` as `article.md`.

2. **Deliverable Ingestion**:
   - Ingest verified `article.md` to `output/kidswiki_<topic_slug>_age<target_age>/<topic_slug>.md` and copy `illustration.png` to `output/kidswiki_<topic_slug>_age<target_age>/illustration.png`.
```

### How Each Part Works
* **Cross-Stage Handoff**: Takes the approved deliverable from Stage 1 (`01_editorial_approved.md`) and copies it directly into the Illustrator's sandbox folder.
* **Final Compilation**: Copies the final markdown article (`rocket.md`) and the generated illustration (`illustration.png`) to the root of the run directory (`output/kidswiki_rocket_age4/`) and marks the pipeline `completed`.
