# WeaveMAS Agent: Protocol & Execution Specification

This document defines the universal operating protocol for any **WeaveMAS Agent**. When an agent definition specifies:
> *"Operate as a WeaveMAS agent following the `weave-core` protocol."*

It is strictly bound by the rules, boundaries, and lifecycle states defined below.

---

## 🏛️ 1. Working Boundary (Directory as Sandbox)

* **Exclusive CWD Confinement**: You operate strictly and exclusively within your assigned Current Working Directory (`Cwd = .`). All file writes, scratch files, intermediate notes, and deliverables must be saved in this directory.
* **Exceptions to CWD Exclusivity**: You are strictly forbidden from inspecting, reading, or traversing files outside your CWD **UNLESS** an explicit exception is declared:
  1. **Role Instruction Exception**: Stated in your agent definition (e.g. *"You are authorized to inspect writer personas from `prompts/personas/*.md`"*).
  2. **Orchestrator Dispatch Exception**: Explicitly passed in the runtime prompt by the orchestrator (e.g. an explicit asset manifest or read-only input path).
* **Zero Unnecessary Exploration (ZUE)**: Never run directory scans (`dir`, `ls`, `Get-ChildItem`), repo-wide searches, or traverse parent directories (`../`). Execute immediately using only the inputs provided in your prompt and authorized assets.

---

## 🔍 2. Role Resolution & Pre-Flight Check

* **Role Slug**: Your role identifier is the `name` property declared in your agent frontmatter (e.g., `stage1_setup/agent_director`).
* **Turn 1 Pre-Flight Check**: On your very first turn, before performing any creative or research actions, you must verify your working environment:
  ```bash
  python .agent/skills/weave-core/scripts/weave_status.py verify --expected-role <your_role_slug>
  ```
* **Fail Fast**: If the pre-flight check fails or exits non-zero, **HALT immediately**. Do not proceed with your task. Report the error and your current working directory.

---

## ⏱️ 3. Automatic Step-Driven State Tracking

Maintain `status.md` in your working directory via the `weave_status.py` helper across your execution lifecycle:

### Dynamic Step Slugs (`in_progress/<step_slug>`)

Most agent instructions define a multi-step workflow with numbered step sections (e.g., `Step 1: Reading Personas`, `Step 2: Selecting Persona`, `Step 3: Factual Research`).

* **Automatic Mapping**: Whenever you advance to a new step in your instructions, **automatically update your status to `in_progress/<step_slug>`**, where `<step_slug>` is the lowercase, snake_case slug of your current step title.
  * *Example*: `Step 1: Reading Personas` $\to$ `in_progress/reading_personas`
  * *Example*: `Step 2: Selecting Persona` $\to$ `in_progress/selecting_persona`
  * *Example*: `Step 3: Factual Research` $\to$ `in_progress/factual_research`
* **Zero Per-Step Prompt Clutter**: Agent definitions do not need repetitive status update directives inside each step heading. Advancing to a step automatically triggers a status update:
  ```bash
  python .agent/skills/weave-core/scripts/weave_status.py update \
    --status "in_progress/<step_slug>" \
    --progress "<concise 1-3 paragraph summary of previous step outputs and current focus>"
  ```

### Lifecycle State Table

| State | When to Use | Deliverable Field |
| :--- | :--- | :--- |
| `not_started` | Pre-spawn state scaffolded by orchestrator. | `null` |
| `in_progress/<step_slug>` | Automatically set upon starting any numbered step in your instructions. | `null` |
| `completed/<completion_slug>` | Set once the final deliverable file is written to disk (e.g., `completed/setup_ready`, `completed/draft_ready`). | `<filename>` |
| `blocked/<reason>` | Set if execution cannot proceed due to missing inputs or external errors. | `null` |

### Progress Summary Guidelines (Strict 1–3 Paragraphs)
* On every step transition, update your progress summary using the `--progress` flag.
* **Latest State Snapshot**: Summarize the current state of your work (e.g., excerpts of drafted text, discovered links/tracks, structural decisions, or key metrics).
* **Strict Length Cap**: Keep the summary bounded to **1 to 3 paragraphs max**. 
* **Deliverable Separation**: Never dump entire scripts, full transcripts, or raw output files into `status.md`. The full artifact belongs strictly in your deliverable file.

---

## 📦 4. Deliverable Registration

1. Save your completed output to the deliverable file specified in your role instructions (e.g., `setup.md`, `draft.md`).
2. Mark yourself complete:
   ```bash
   python .agent/skills/weave-core/scripts/weave_status.py update \
     --status "completed/<completion_slug>" \
     --deliverable "<deliverable_file>" \
     --progress "<final executive summary>"
   ```
* The helper automatically checks that `<deliverable_file>` exists in your CWD and fails fast with a non-zero exit code if the file is missing.

---

## 🛠️ 5. Quick Command Reference

```bash
# 1. Pre-flight verification (Turn 1)
python .agent/skills/weave-core/scripts/weave_status.py verify --expected-role <role_slug>

# 2. Step transitions (Intermediate turns - auto-derived from step heading)
python .agent/skills/weave-core/scripts/weave_status.py update --status in_progress/<step_slug> --progress "<summary>"

# 3. Final completion (Final turn)
python .agent/skills/weave-core/scripts/weave_status.py update --status completed/<completion_slug> --deliverable <file> --progress "<summary>"
```
