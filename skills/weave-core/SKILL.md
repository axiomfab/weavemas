---
name: weave-core
description: >-
  Core status lifecycle management and execution constraints for WeaveMAS multi-agent pipelines.
  Use when agents or orchestrators initialize, verify, or update status.md tracking files,
  record deliverables, and maintain pipeline observability.
---

# WeaveMAS Core: Lifecycle & Execution Guide

`weave-core` provides deterministic, script-driven lifecycle management and execution constraints for WeaveMAS multi-agent workflows. It encapsulates directory sandboxing, Zero Unnecessary Exploration (ZUE), `status.md` formatting, state transitions, deliverable checks, and fail-fast pre-flight validation.

---

## 🤖 The Weave Agent Baseline

Any agent instructed to **"Operate as a WeaveMAS agent following the `weave-core` protocol"** must strictly adhere to these universal constraints:

### 1. Directory Sandbox
Your current working directory (`.`) is your absolute execution boundary:
* All file outputs, intermediate notes, scratch files, and deliverables must be written strictly within your assigned working directory.
* Never use absolute paths or write outside your current working directory.

### 2. Zero Unnecessary Exploration (ZUE)
* Do **NOT** run directory scans (`dir`, `ls`, `Get-ChildItem`), repo-wide searches, or inspect parent directories.
* Only read external files if your specific role prompt explicitly grants targeted read authorization (e.g. static persona manifests or explicit input clips).

### 3. Role Resolution
Your role slug matches the `name` field declared in your agent frontmatter (e.g., `stage1_setup/agent_director`).

### 4. Turn 1 Pre-Flight Check (Fail Fast)
On your very first turn, before performing any creative or research work, verify your execution environment:
```bash
python .agent/skills/weave-core/scripts/weave_status.py verify --expected-role <your_role_slug>
```
* **Critical**: If this command fails or returns a non-zero exit code, **HALT immediately**. Do not proceed with creative work.

### 5. Progress Updates (Automatic Step-Slug Mapping)
As you advance across numbered steps in your instructions (e.g. `Step 1: Reading Personas` $\to$ `Step 2: Selecting Persona`), automatically derive `<step_slug>` from your current step title:
```bash
python .agent/skills/weave-core/scripts/weave_status.py update \
  --status "in_progress/<step_slug>" \
  --progress "<concise 1-3 paragraph summary of completed work and current focus>"
```
* Keep the summary bounded to **1 to 3 paragraphs**. Never dump entire output files or raw scripts into `status.md`.

### 6. Completion & Deliverable Verification
When your deliverable file has been written to disk inside your working directory, complete your status:
```bash
python .agent/skills/weave-core/scripts/weave_status.py update \
  --status "completed/<completion_slug>" \
  --deliverable "<deliverable_file>" \
  --progress "<final executive summary>"
```
* The CLI tool automatically verifies that `<deliverable_file>` exists on disk and will fail fast with an error if missing.

---

## 👑 Orchestrator Operations

### 1. Master Pipeline Initialization
Initialize the master pipeline status at the root of `output/<context_slug>/`:
```bash
python .agent/skills/weave-core/scripts/weave_status.py init \
  --type orchestrator \
  --status "in_progress/stage01_setup" \
  --dir "output/<context_slug>"
```

### 2. Pre-Spawn Subagent Scaffolding
Before dispatching any subagent via `invoke_subagent`, the orchestrator must scaffold the subagent's directory and initial `status.md`:
```bash
python .agent/skills/weave-core/scripts/weave_status.py init \
  --role "<role_slug>" \
  --dir "<subagent_directory>"
```

---

## 🧭 Targeted Reference Guides

| Guide | Target | Reference File | Scope |
| :--- | :--- | :--- | :--- |
| **Agent Protocol** | Subagents | [`weave-core-agent`](../weave-core-agent/SKILL.md) | Universal agent specification: CWD boundaries, read exceptions, ZUE, and lifecycle tracking. |
| **Orchestrator Protocol** | Orchestrator | [`weave-core-orchestrator`](../weave-core-orchestrator/SKILL.md) | Upfront scaffolding, master pipeline progression, pre-spawn hooks, and deliverable ingestion. |
| **Architecture Overview** | Shared | [`references/status_contract.md`](./references/status_contract.md) | Two-tier architecture overview and principles. |
