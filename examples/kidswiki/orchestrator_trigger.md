---
trigger: always_on
---

# KidsWiki Pipeline Protocol

## 1. Pipeline Execution
**Trigger:** Any request to write, generate, or run a KidsWiki article (e.g., "Write a KidsWiki article about ...").
**Action:** Before invoking any subagents or running commands, read `orchestrator.md` (do NOT preload `orchestrator/*.md` stage guides into the root orchestrator -- delegate each stage to `stage_orchestrator`).

## 2. Outcome Feedback & Pipeline Revision
**Trigger:** Any request providing feedback, critique, or surgical edits on a completed run in `runs/<context_slug>/`.
**Action:** Activate the `weave-authoring` skill and follow `references/authoring_revision.md` (or route run-specific surgical edits via `send_message` to the persisted `conversation_id`).
