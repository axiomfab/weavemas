# Authoring Guide: Outcome Review & Pipeline Revision (`C` $\leftrightarrow$ `R` Protocol)

Triggered when a user critiques or reports issues with the output of a WeaveMAS pipeline run in `output/<context_slug>/`.

---

## 🪜 Four-Phase Execution Protocol

### Phase 1: Decompose Outcome Changes (`c1..cx`) & Triage
Inspect the target outputs in `output/<context_slug>/`, break the user's feedback into atomic outcome issues (`c1, c2, ..., cx`), and classify each:
* **Taste (One-Off Preference)**: Pipeline followed instructions properly, but the user wants a run-specific creative/topical tweak. Maps to **no pipeline revision (`∅`)**—only an immediate fix in `output/<context_slug>/`.
* **Systemic Flaw (Pipeline Defect)**: An error, mismatch, omission, or quality failure that should never happen in future runs. Requires root-cause analysis (`r1..ry`).

### Phase 2: Parallel Root-Cause Subagents (1 per Systemic `ci`)
For every `ci` classified as a **Systemic Flaw**, batch-dispatch a dedicated read-only `research` subagent (`TypeName: "research"`, `Model: "inherit"`) to:
1. **Audit Runtime Sandbox (`output/<context_slug>/`)**: Compare staged Tier 2 inputs and Tier 1 parameters against `weave.md` logs and outputs in `<stage_slug>/agents/<agent_id>/`.
2. **Audit Pipeline Files (`orchestrator*.md`, `.agent/agents/*.md`)**: Identify whether a Tier 2 input was unstaged, an agent task lacked constraints/verification, or the orchestrator lacked a review loop.
3. **Return**: (a) Root Cause, (b) Immediate Outcome Fix for `ci` in `output/<context_slug>/`, and (c) Candidate Pipeline Edits to `.agent/agents/*.md` or `orchestrator*.md`.

### Phase 3: Synthesize `r1..ry` & Build $N$-to-$N$ Mapping
Deduplicate subagent proposals into orthogonal pipeline revisions (`r1, r2, ..., ry`) specifying exact target files (adhering to `authoring_agent.md` and `authoring_orchestrator.md`), and map `c1..cx` $\leftrightarrow$ `r1..ry`.

### Phase 4: Present Summary & Prompt via `ask_question`
**Never apply any `c` or `r` before explicit user selection.**

1. **Output Summary**:
   - **1. Outcome Fixes (`c1..cx` in `output/<context_slug>/`)**: Issue description + classification + immediate fix approach.
   - **2. Pipeline Improvements (`r1..ry` in `.agent/agents/` & `orchestrator/`)**: Target file + structural fix.
   - **3. Mapping Table (`C` $\leftrightarrow$ `R`)**:
     | Outcome Change (`c`) | Classification | Mapped Pipeline Revisions (`r`) |
     | :--- | :--- | :--- |
     | **`c1`**: <summary> | Systemic Flaw | `r1`, `r2` |
     | **`c2`**: <summary> | Taste (One-Off) | *None (`∅`)* |
2. **Invoke `ask_question`**:
   ```json
   {
     "questions": [
       {
         "question": "Which fixes would you like to apply?",
         "is_multi_select": false,
         "options": [
           "(Recommended) Apply (1) and (2) — Fix current outcome (c1..cx) and apply pipeline improvements (r1..ry)",
           "Apply (1) only — Fix current outcome (c1..cx) in output/<context_slug>/",
           "Apply (2) only — Apply pipeline improvements (r1..ry) to agents/orchestrator",
           "Do nothing"
         ]
       }
     ]
   }
   ```
3. **Execute Selected Changes**: Apply approved `c` fixes in `output/<context_slug>/` and/or approved `r` updates to `.agent/agents/*.md` and `orchestrator*.md`.
