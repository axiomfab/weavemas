# Authoring Guide: WeaveMAS Orchestrators

This guide details how to author **Orchestrator Guidelines** (defined across `orchestration_guide.md` and modular stage files in the `orchestration/` folder) by weaving concrete workspace paths, upfront stage directory scaffolding, pre-spawn hooks, state supervision, and fail-fast deliverable ingestion directly into orchestrator instructions.

---

## 🎯 1. Orchestration Architecture & The Concrete Weaving Principle

### Orchestration Documentation Hierarchy
Every multi-stage WeaveMAS pipeline structures its orchestration documentation into two coordinated tiers:
1. **Master Orchestrator Guide (`orchestration_guide.md`)**: The root specification at the workspace root. Defines pipeline inputs, overall output structure, strict execution constraints, and the global sequence connecting all stages.
2. **Modular Stage Guides (`orchestration/[<stage_slug>].md`)**: Dedicated guideline files residing in the `orchestration/` folder (e.g., `orchestration/stage1_setup.md`, `orchestration/stage2_concept.md`, `orchestration/stage3_writing.md`, etc.). Each file details the exact agent roles, pre-spawn hooks, ZUE constraints, dispatch prompts, and handoff contracts for that individual stage.

> **Golden Rule of WeaveMAS**: When authoring orchestrator guidelines, **never present abstract meta-options**. Inline the *exact, concrete directory structure, subagent paths, and hook templates* for that specific workflow.

* **Context Root (`<context_slug>`)**: Specify the exact context directory: `output/<context_slug>/`.
  * **What is `<context_slug>`?**: A slug representing the specific entity or run instance the pipeline is generating. For example:
    * *Radio / Podcast Pipeline*: A specific broadcast episode (`show_09-10-2026_the_clash`).
    * *Creative Writing Pipeline*: A specific article or chapter (`article_2026-10-12_ai_chips` or `chapter_04_the_arrival`).
    * *Software Engineering Pipeline*: A specific feature or refactoring task (`refactor_auth_module`).
  * Scoping everything to `output/<context_slug>/` isolates all intermediate drafts, subagent directories, logs, and deliverables into a clean sandbox, preventing root directory pollution and multi-run collisions.
* **Subagent Working Directories**: Specify the exact relative path structure: `<stage_slug>/agents/<agent_identifier>/`.
* **Pre-Spawn Hook**: Provide the exact YAML structure the orchestrator must write before invoking subagents.
* **Deliverable Ingestion**: Specify the exact file path read from the agent's `deliverable` frontmatter upon completion.

---

## 📋 2. Prescriptive Orchestrator Building Blocks

Every WeaveMAS orchestrator guideline must specify four core mechanisms:

### Block A: Master Orchestrator Status Contract & Upfront Stage Scaffolding
The orchestrator maintains the master `status.md` at the root of `output/<context_slug>/`.

> [!IMPORTANT]
> **Orchestrator Startup Initialization & Upfront Stage Scaffolding**:
> Once the orchestration starts, if the pipeline has stages, **the orchestrator must perform two immediate scaffolding actions in `output/<context_slug>/` before dispatching any subagents**:
> 1. **Initialize Master `status.md`**: Create `output/<context_slug>/status.md` if it does not already exist, setting `type: orchestrator` and initial stage status.
> 2. **Pre-Create All Stage Directories Upfront**: Create a directory in the output directory for each stage defined in the orchestration pipeline—**even though they are initially empty**.
>    * *Example*: For `output/show_09-10-2026_the_clash/`, the orchestrator immediately creates `stage01_setup/`, `stage02_concept/`, `stage03_writing/`, `stage04_staging/`, `stage05_audio/`, `stage06_promo/`, `stage07_video/` upfront on startup.
>    * *Why Upfront Stage Directories are Mandatory*:
>      - **UI & Dashboard Observability**: The pipeline tracker sidecar UI and file watchers discover the full pipeline topology on day zero, rendering the complete stage stepper without 404s, missing directory warnings, or delayed detection.
>      - **Deterministic Workspace Boundaries**: Establishes the physical layout of the entire multi-stage pipeline before any subagent is dispatched.
>      - **Clean Sandboxing**: Guarantees each stage has its designated root directory ready for subagent hooks and deliverables.

* **`type`**: Always `orchestrator`.
* **`status`**: Current pipeline stage (`not_started`, `in_progress/<stage_name>`, `completed`, `blocked/<reason>`).
* **`deliverable`**: Relative path to the final compiled result of the entire pipeline (e.g. `07_video/final_render.mp4` or `final_broadcast.md`), or `null` while in progress.
* **`updated_at`**: ISO 8601 timestamp.

#### Markdown Content Body Specification (Pipeline Progress Summary)
Below the YAML frontmatter block, **the markdown content part of the master `status.md` must be maintained with a running summary of the pipeline's progress**:
* **Current Stage & Active Agents**: Document current stage objectives, which subagents have been dispatched, and intermediate milestones.
* **Stage Transitions & Handoffs**: When completing a stage, append a bulleted summary of completed deliverables, key metrics, and handoff notes before advancing to the next stage.

```yaml
---
type: orchestrator
status: in_progress/<first_stage>
deliverable: null
updated_at: "<ISO 8601 Timestamp>"
---
# Pipeline Execution Summary
* Current Stage: <first_stage>
* Status: Initialized
* Progress: Scaffolding complete, dispatched initial subagents.
```

---

### Block B: The Mandatory Pre-Spawn Hook
Before dispatching any subagent via `invoke_subagent`, the orchestrator **must** execute this pre-spawn hook:

1. Create the dedicated subagent directory: `<stage_slug>/agents/<agent_identifier>/`.
2. Initialize `status.md` inside that directory with:
   ```yaml
   ---
   type: agent
   role: <role_slug>
   status: not_started
   deliverable: null
   updated_at: "<ISO 8601 Timestamp>"
   ---
   Agent working directory initialized by orchestrator.
   ```

> [!IMPORTANT]
> **Why the Pre-Spawn Hook is Critical**:
> * **Zero Race Conditions**: The UI tracker and sidecar observe `status: not_started` immediately, preventing missing-node flicker or 404s.
> * **Pre-Flight Validation**: Subagents can run their pre-flight check on startup to verify they are in the correct directory with the matching `role` before executing.

> [!TIP]
> **Subagent Progress Summary Guidance**:
> When authoring subagent dispatch prompts, the single contract-level rule (`* Progress Summary: On every state change, update the markdown content below the frontmatter with a concise summary of your current progress, metrics, or outputs.`) is **fully sufficient** by default. Subagents naturally log their progress without needing micromanaged per-step instructions. Only define explicit body format requirements when a downstream agent or validator strictly demands a specialized schema (e.g. structured verification tables).

---

### Block C: Subagent Input Feeding Strategies (The 3-Tier Model)
To prevent LLM summarization loss and enforce Zero Unnecessary Exploration (ZUE), orchestrators categorize inputs by their structural type rather than subjective byte guesses:

1. **Tier 1: Task Directives & Runtime Parameters (Prompt Inlining)**:
   * **What**: Immediate prompt configuration—target duration (`60.0 min`), host persona ID (`Jack Turner @ 145 WPM`), segment identifiers (`SEG-01`), and specific narrative beats.
   * **Rule**: Inlined directly in the `invoke_subagent` prompt.
   * **Advantage**: Zero tool latency, immediate turn-1 drafting.
2. **Tier 2: Prior Stage Handoff Deliverables (Pre-Spawn Workspace Staging)**:
   * **What**: Canonical artifacts generated by prior pipeline stages (`01_setup.md`, `02_concept.md`, `03_script.md`).
   * **Rule**: The orchestrator **must copy the deliverable file into the subagent's working directory during the pre-spawn hook** (e.g. `<stage_slug>/agents/<agent_identifier>/01_setup.md`).
   * **Strict Prohibition**: **Never** instruct an orchestrator to inline a prior stage deliverable into a prompt. LLMs have an intrinsic brevity bias and will summarize or truncate the document, stripping out critical research milestones, dates, and guardrails.
3. **Tier 3: Bulk Read-Only Assets (Media Libraries, Audio/Video, Large Datasets)**:
   * **What**: Heavy binary assets (e.g. 100 MP3s to convert to MP4). Never copy bulk files.
   * **Rule**: Pass an `asset_manifest.md` or explicit `Asset Source (Read-Only)` path.
   * **Write Confinement**: The subagent reads source media from the external path, but **all rendered assets, outputs, logs, and `status.md` must be written strictly inside its assigned CWD**. Arbitrary directory browsing (`dir`, `ls`, scanning parent directories `..`) remains strictly banned.

---

### Block D: Dispatch & Deliverable Ingestion Protocol
1. **Dispatch (`invoke_subagent`)**:
   * **Subagent Working Directory (Sandbox)**: The orchestrator operates from `output/<context_slug>/`, but the subagent must be scoped strictly to its own assigned subfolder. In the subagent invocation prompt, explicitly state:
     `Assigned Working Directory: output/<context_slug>/<stage_slug>/agents/<agent_identifier>/`
   * **The Black Box Dispatch Constraint (No Prompt Over-Specification)**:
     - The orchestrator must treat subagents as autonomous black boxes.
     - The dispatch prompt must provide **only**:
       1. The target agent role definition file (e.g. `Act as the agent configured in .agent/agents/<stage>/agent_<role>.md`).
       2. The assigned working directory.
       3. The staged inputs in that directory (or Tier 1 runtime params).
       4. The final required deliverable.
     - **Strict Prohibition**: The orchestrator is **strictly forbidden from micromanaging or dictating the agent's internal lifecycle** in the dispatch prompt. Never specify intermediate status transitions (e.g. `"update status to in_progress/xyz"`), how to conduct pre-flight checks, or step-by-step internal reasoning phases. All execution mechanics and status progression belong solely in the agent's system definition file.
   * Instruct the subagent with its specific task, inlined inputs, and Zero Exploration constraints.
   * Do NOT poll in a loop; leverage reactive wakeups.
2. **Completion & Deliverable Ingestion (Fail Fast)**:
   * When the agent finishes, read its `status.md`.
   * Verify `status` starts with `completed` (e.g. `completed` or `completed/<sub_state>`).
   * Verify the agent updated its `status.md` markdown content body with a comprehensive progress summary.
   * Read the relative file path specified in `deliverable`. If `deliverable` is `null`, missing, or points to an empty file, **fail fast** and log a blocker error immediately rather than proceeding with corrupted state.

---

## 🔁 3. Authoring Bounded Feedback Loops

When one subagent audits or reviews another (e.g., Auditor auditing Writer):

1. **Blocked Transition**:
   * If the auditor reports `status: blocked/revision_requested`, the orchestrator updates the authoring agent's `status.md` to:
     `status: blocked/revision_requested`
2. **Targeted Re-Invocation**:
   * Re-invoke the authoring agent, injecting the auditor's specific flags directly into the prompt.
3. **Hard Cap (Strict Termination)**:
   * Always enforce a maximum revision iteration limit (e.g., maximum 2 revision loops). If the limit is exceeded, escalate to the user rather than running indefinitely.

---

## ✍️ 4. Concrete Orchestrator Guideline Template

```markdown
# Orchestrator Guidelines: <Pipeline / Stage Name>

You coordinate the execution of the <pipeline_name> workflow. Orchestration is defined in `orchestration_guide.md` and modular stage guides under `orchestration/`.

## Workspace Scoping & Startup Scaffolding
* Your working directory is: `output/<context_slug>/` (where `<context_slug>` is the unique entity/run folder, e.g. `show_09-10-2026_the_clash`).
* **Startup Scaffolding**:
  1. Pre-create all stage directories upfront in `output/<context_slug>/` (e.g. `stage01_setup/`, `stage02_concept/`, `stage03_writing/`, etc.), even though they are initially empty.
  2. If `output/<context_slug>/status.md` does not exist, create it with `type: orchestrator`, `status: in_progress/<first_stage>`, `deliverable: null`, and initial run summary in the body.

## Status & Deliverable Contract
Maintain `status.md` at the root of your working directory (`output/<context_slug>/status.md`):
* **Progress Summary**: On every state change and stage transition, update the markdown content below the frontmatter with a running summary of pipeline progress, completed deliverables, and active milestones.
* **Execution**:
  1. When starting: set frontmatter `status` to `in_progress/<first_stage>` and `deliverable` to `null`.
  2. During stage transitions: advance `status` to `in_progress/<next_stage>` and append completed stage summaries in the body.
  3. When the entire pipeline completes: set frontmatter `status` to `completed` and `deliverable` to the final compiled output file of the entire pipeline (e.g. `<final_pipeline_deliverable_path>`).

## Execution Sequence

### Phase 1: Pre-Spawn & Dispatch
For each agent in the workflow:
1. Create directory: `<stage_slug>/agents/<agent_identifier>/`.
2. Write initial `status.md` with `type: agent`, `role: <role_slug>`, `status: not_started`, and `deliverable: null`.
3. Dispatch agent via `invoke_subagent`, explicitly passing `Assigned Working Directory: output/<context_slug>/<stage_slug>/agents/<agent_identifier>/` in the prompt so the subagent is sandboxed to its folder.

### Phase 2: Ingestion & Verification
1. Verify agent `status.md` indicates `status: completed` (or `completed/<sub_state>`).
2. Read deliverable from path specified in `deliverable` frontmatter field.
3. Validate deliverable contents against stage requirements.
4. Verify the agent updated its `status.md` markdown content body with an execution progress summary.

### Phase 3: Stage Handoff & Pipeline Completion
1. Compile stage deliverable into `output/<context_slug>/<stage_output_file>`.
2. If transitioning to next stage: advance master `output/<context_slug>/status.md` to `in_progress/<next_stage>` and append completed stage summaries to the body.
3. If final pipeline stage completes: update master `output/<context_slug>/status.md` frontmatter to `status: completed`, set `deliverable` to `<final_pipeline_deliverable_path>`, and append final pipeline completion summary to the body.
```
