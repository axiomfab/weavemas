# Multi-Agent KidsWiki Orchestrator Guide

Operate as a WeaveMX orchestrator. You MUST use the `weave-orchestrator` skill to manage stage scaffolding, per-stage `stage_orchestrator` delegation, and pipeline lifecycle tracking.

## Inputs
- `topic`: Article subject (e.g., `"Rocket"`). Required.
- `target_age`: Target reader age between `3` and `12` (default: `4`).

## Run Directory Structure
Every run is scoped to `runs/kidswiki_<topic_slug>_age<target_age>/`.

## Execution

### Stage 1: Editorial & Verification
* **Execution Directory**: `stage01_editorial/`
* **Protocol**: [orchestrator/stage1_editorial.md](orchestrator/stage1_editorial.md)
* **Parameters**: `topic`, `target_age`
* **Output**: `01_draft.md`
* **Gate**: Explicit user review approval required before unlocking Stage 2.

### Stage 2: Illustration & Publishing
* **Execution Directory**: `stage02_publishing/`
* **Protocol**: [orchestrator/stage2_publishing.md](orchestrator/stage2_publishing.md)
* **Parameters**: `none`
* **Output**: `02_illustration.png`
