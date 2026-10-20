# Authoring Guide: WeaveMAS Outcome Review & Pipeline Revision Protocol

This guide defines the **Post-Run Outcome Review & Continuous Improvement Protocol** triggered when a user provides feedback, critique, or bug reports regarding the output of a WeaveMAS pipeline run (e.g., mismatched illustrations, factual or tonal mistakes in generated text, formatting defects, or structural omissions).

---

## 🧠 Architectural Overview: The `C` $\leftrightarrow$ `R` ($N$-to-$N$) Model

User feedback on a pipeline outcome often mixes several distinct issues—some are subjective, one-off preferences for the current run ("taste"), while others expose structural flaws in the pipeline's agents or orchestrator handoffs.

To prevent rushed, superficial fixes and keep the primary context window clean, the revision mechanism operates in **four phases**:

1. **Extract & Triage Outcome Changes (`c1, c2, ..., cx`)**: Decompose user feedback into discrete outcome flaws/requests (`c1..cx`) and classify each as either **Taste (Run-Specific Preference)** or **Systemic Flaw (Pipeline Defect)**.
2. **Parallel Subagent Root-Cause Investigation (1 Subagent per Systemic `ci`)**: For every `ci` classified as a **Systemic Flaw**, spawn a dedicated read-only `research` subagent in parallel to deeply audit `output/<context_slug>/` and `.agent/agents/*.md` / `orchestrator*.md`.
3. **Synthesize & Deduplicate Pipeline Revisions (`r1, r2, ..., ry`)**: Aggregate subagent findings into a deduplicated set of structural pipeline changes (`r1..ry`), establishing an explicit **$N$-to-$N$ mapping** between `c1..cx` and `r1..ry` (where one `c` may map to zero `r`s if it is taste, one `r`, or multiple `r`s; and multiple `c`s may share the same `r`).
4. **Present Summary & Interactive Selection (`ask_question`)**: Present the `c1..cx` outcome fixes, the `r1..ry` pipeline revisions, and their mapping table, then prompt the user via `ask_question` on what to apply.

---

## 🪜 Step-by-Step Execution Protocol

### Phase 1: Decompose `c1..cx` & Triage ("Taste" vs. "Systemic Flaw")

1. **Locate the Target Run**: Identify the `output/<context_slug>/` directory and inspect the final deliverable(s) referenced by the user.
2. **Itemize Outcome Changes (`c1, c2, ..., cx`)**: Break the user's feedback down into atomic, numbered outcome flaws or requested changes (`c1`, `c2`, `c3`, ...).
3. **Assess Taste vs. Systemic Flaw**: For each `ci`, determine:
   * **Taste (Run-Specific / Subjective Preference)**:
     * *Definition*: The pipeline executed its instructions properly, but the user wants a specific creative, stylistic, or topical tweak for this particular output (e.g., *"Change the hero example in paragraph 2 to Marie Curie"*, *"Make the background of illustration 1 sunset orange"*).
     * *Pipeline Impact*: Maps to **no pipeline revision (`∅`)**—only requires an immediate outcome fix (`ci`) in `output/<context_slug>/`.
   * **Systemic Flaw (Generalizable Pipeline Defect)**:
     * *Definition*: The output exhibits an error, mismatch, omission, or quality failure that should never happen in *any* run (e.g., *"The illustrations do not match the article sections"*, *"The text uses complex academic jargon instead of kid-friendly language"*, *"A stage ignored constraints established in Stage 1"*).
     * *Pipeline Impact*: Requires deep root-cause investigation to identify one or more structural pipeline revisions (`r1, r2, ...`).

---

### Phase 2: Spawn Parallel Analysis Subagents for Systemic Flaws

**DO NOT** investigate systemic flaws superficially in the main thread. For every `ci` classified as a **Systemic Flaw**, launch a dedicated `research` subagent in a single batched `invoke_subagent` call (`TypeName: "research"`, `Model: "inherit"`):

* **1 Subagent per Systemic `ci`**: If `c1` and `c3` are systemic flaws (while `c2` is taste), spawn two concurrent `research` subagents—one dedicated exclusively to `c1` and one to `c3`.
* **Subagent Investigation Mandate**: Each subagent must:
  1. **Audit Runtime Artifacts (`output/<context_slug>/`)**: Trace backward from the flawed deliverable into the responsible `<stage_slug>/agents/<agent_identifier>/` sandbox. Inspect what Tier 2 staged files and Tier 1 prompt parameters the subagent received versus what it logged in `status.md` and wrote to its deliverable.
  2. **Audit Pipeline Definitions (`orchestrator.md`, `orchestrator/*.md`, `.agent/agents/*.md`)**: Read the exact agent instructions and stage orchestrator guide to pinpoint *why* the flaw occurred:
     - Was a required Tier 2 deliverable never staged into the subagent's workspace by the orchestrator?
     - Was an agent's `## Task: <slug>` instruction vague, missing negative constraints, or missing a verification/self-check step?
     - Did the orchestrator lack a review gate or relay verification loop?
  3. **Return Structured Findings for `ci`**:
     - **Root Cause**: Precise explanation of why `ci` occurred.
     - **Immediate Outcome Fix for `ci`**: Exact method to repair the artifact in `output/<context_slug>/` (e.g., re-running image generation with a corrected prompt, messaging/re-running a specific subagent, or editing the target section).
     - **Candidate Pipeline Changes**: Concrete edits to `.agent/agents/*.md` and/or `orchestrator*.md` required to prevent this flaw in future runs.

*(Note: For `ci` items classified as **Taste**, the main agent determines the immediate outcome fix directly without spawning a pipeline root-cause subagent.)*

---

### Phase 3: Synthesize `r1..ry` & Build the $N$-to-$N$ Mapping

Once all analysis subagents report back, the main agent synthesizes their findings:

1. **Deduplicate & Index Pipeline Revisions (`r1, r2, ..., ry`)**:
   * Merge overlapping or related candidate pipeline changes proposed by different `ci` subagents into a clean, orthogonal list of numbered pipeline revisions: `r1`, `r2`, `r3`, ...
   * Ensure every `rj` specifies the exact target file (`.agent/agents/[<stage>/]<role>.md`, `orchestrator/<stage>.md`, or `orchestrator.md`) and adheres strictly to [`authoring_agent.md`](references/authoring_agent.md) and [`authoring_orchestrator.md`](references/authoring_orchestrator.md).
2. **Establish the $N$-to-$N$ Mapping (`C` $\leftrightarrow$ `R`)**:
   * Map each `ci` to the zero, one, or multiple `rj` revisions required to prevent it in the future.
   * Map each `rj` back to the `ci` flaw(s) it resolves.

---

### Phase 4: Present Summary & Prompt User via `ask_question`

**DO NOT apply any outcome fix (`c`) or pipeline revision (`r`) before receiving the user's explicit selection.**

#### 1. Output the Structured Summary
Present a clear, concise report in chat with three sections:

* **1. Outcome Changes & Fixes (`c1..cx`) — Fix Current Run (`output/<context_slug>/`)**:
  - **`c1`** `[Systemic Flaw | Taste]`: Description of the issue $\rightarrow$ Concrete approach to fix the current outcome (e.g., recreate illustration `img_02.png` with nano banana using updated prompt; rewrite paragraph 3).
  - **`c2`** `[Systemic Flaw | Taste]`: ...
* **2. Pipeline Improvements (`r1..ry`) — Prevent Future Mistakes (`.agent/agents/` & `orchestrator/`)**:
  - **`r1`** (`<target_file_path>`): Root cause & concrete improvement to the agent task, prompt constraint, or orchestrator Tier 2 handoff.
  - **`r2`** (`<target_file_path>`): ...
* **3. $N$-to-$N$ Mapping Table (`C` $\leftrightarrow$ `R`)**:

  | Outcome Change (`c`) | Classification | Mapped Pipeline Revisions (`r`) |
  | :--- | :--- | :--- |
  | **`c1`**: <short summary> | Systemic Flaw | `r1`, `r2` |
  | **`c2`**: <short summary> | Taste (One-Off) | *None (`∅` — taste only)* |
  | **`c3`**: <short summary> | Systemic Flaw | `r2` |

#### 2. Prompt the User with `ask_question`
Immediately invoke `ask_question` so the user can select whether to apply (1) the outcome fixes `c1..cx`, (2) the pipeline improvements `r1..ry`, both, nothing, or a custom subset (e.g., typing `"c1, c2, and r1"` in the write-in field):

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
*(The `ask_question` modal automatically includes a free-text input option where the user can specify a custom selection such as `"Apply c1, c3 and r2"` or provide additional instructions.)*

#### 3. Execute Approved Changes
* **When Outcome Fixes (`c1..cx` or selected subset) are approved**: Execute the fixes in `output/<context_slug>/` (re-invoking/messaging subagents or regenerating assets/text as specified) and verify the updated deliverables on disk.
* **When Pipeline Improvements (`r1..ry` or selected subset) are approved**: Load [`authoring_agent.md`](references/authoring_agent.md) and/or [`authoring_orchestrator.md`](references/authoring_orchestrator.md) and apply the structural changes to `.agent/agents/*.md` and/or `orchestrator*.md`.
