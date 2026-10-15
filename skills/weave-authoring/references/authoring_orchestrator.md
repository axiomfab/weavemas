# Authoring Guide: WeaveMAS Orchestrators

This guide details how to author **Orchestrator Guidelines** (defined across `orchestration_guide.md` and modular stage files in the `orchestration/` folder) by weaving concrete workspace paths, upfront stage directory scaffolding, pre-spawn hooks, state supervision, and fail-fast deliverable ingestion directly into orchestrator instructions.

---

## 🎯 1. The Standard Orchestrator Binding Contract

### Frontmatter Configuration
When defining an orchestrator agent (`.agent/agents/orchestrator.md` or root prompt frontmatter), declare:

```yaml
---
name: pipeline_orchestrator
description: Master orchestrator for <pipeline_name>
model: pro
subagent: false
inheritMcp: true
skills:
  - weave-core-orchestrator
tools:
  - invoke_subagent
  - view_file
  - write_to_file
  # strictly omit run_command unless shell compilation or binary asset manipulation is required
---
```

* **`subagent: false`**: Orchestrators act as parent agents, not leaf workers.
* **`skills: [weave-core-orchestrator]`**: Natively mounts the orchestrator execution protocol.
* **`inheritMcp: true`**: Grants access to WeaveMAS MCP status tools (`status_init`, `status_update`, `status_verify`, `status_read`).
* **Least-Privilege `tools:`**:
  * **`invoke_subagent`**: Mandatory for spawning and coordinating stage agents.
  * **`view_file`**: Mandatory for inspecting deliverables and checking stage outputs.
  * **`write_to_file`**: Mandatory for input staging (Tier 2 handoffs) and assembling final compiled deliverables.
  * **`run_command`**: **Strictly omit** by default. Only include if the orchestrator itself must run shell compilation tools or binary asset CLI commands.

### Prompt Binding Statement
Every WeaveMAS orchestrator prompt must include this mandatory binding statement verbatim:

```markdown
Operate as a WeaveMAS orchestrator. You MUST use the `weave-core-orchestrator` skill to manage stage scaffolding, subagent pre-spawn hooks, and pipeline lifecycle tracking.
```

---

## 🏛️ 2. Orchestration Architecture & The Concrete Weaving Principle

### Orchestration Documentation Hierarchy
Every multi-stage WeaveMAS pipeline structures its orchestration documentation into two coordinated tiers:
1. **Master Orchestrator Guide (`orchestration_guide.md`)**: The root specification at the workspace root. Defines pipeline inputs, output context root scoping (`output/<context_slug>/`), and the declarative `## Execution` section. For each stage, it specifies:
   * **`Execution Directory`**: The stage directory slug (e.g. `stage01_setup/`).
   * **`Protocol`**: Link to the dedicated stage guide (e.g. `[orchestration/stage1_setup.md](orchestration/stage1_setup.md)`).
   * **`Deliverable`**: Canonical stage deliverable ingested into the root (e.g. `01_setup.md`).
   * **`Gate`** *(Optional)*: Explicit review approval required before unlocking the next stage.
   * *Anti-Pattern*: Never duplicate subagent action steps, prompts, or internal reasoning in the master guide. The master guide is strictly a high-level contract; stage guides govern stage details.
2. **Modular Stage Guides (`orchestration/[<stage_slug>].md`)**: Dedicated guideline files residing in the `orchestration/` folder (e.g., `orchestration/stage1_setup.md`, `orchestration/stage2_concept.md`, `orchestration/stage3_writing.md`, etc.). Each file details the exact agent roles, pre-spawn hooks, ZUE constraints, dispatch prompts, and handoff contracts for that individual stage.
   * **Single-Agent Stages**: Concise 15–20 line guide declaring the agent role, working directory, inputs, deliverable ingestion, and review gate (Template B).
   * **Multi-Agent Relay / Loop Stages**: When a stage coordinates multiple subagent instances across an item collection (e.g. segments, chapters), author concise declarations defining the **Iteration Scope**, **Parameterized Workspaces** (`<stage_slug>/agents/<item_id>/<role>/`), and per-agent micro-specs (**Directory**, **Inputs**, **Handoff/Gate**) without prompt-inlining bloat (Template C).

> **Golden Rule of WeaveMAS**: When authoring orchestrator guidelines, **never present abstract meta-options**. Inline the *exact, concrete directory structure, subagent paths, and hook templates* for that specific workflow.

* **Context Root (`<context_slug>`)**: Specify the exact context directory: `output/<context_slug>/` (e.g. `output/show_09-10-2026_the_clash/` or `output/article_2026-10-12_ai_chips/`). Scoping everything to `output/<context_slug>/` isolates all intermediate drafts, subagent directories, logs, and deliverables into a clean sandbox, preventing root directory pollution and multi-run collisions.
* **Subagent Working Directories**: Specify the exact relative path structure: `<stage_slug>/agents/<agent_identifier>/`.
* **Agent Identifier Convention (`<agent_identifier>`)**: Every agent declared in `## Agent Roles` MUST be assigned an explicit, lowercase snake_case identifier slug:
  - *Single-Instance Stages*: Semantic role slugs (`director`, `showrunner`, `youtube_sourcer`, `staging`).
  - *Multi-Instance Stages*: Parameterized slugs with zero-padded coordinates (`architect_a<AA>_s<SS>`, `writer_a<AA>_s<SS>`, `factchecker_a<AA>_s<SS>`) or specialized roles (`writer_global_flow`).
  - *Why Mandatory*: Unambiguously referenced throughout `## Execution`, passed directly as `Role: "<agent_identifier>"` in `invoke_subagent` for deterministic UI sidecar badges, and targeted in `send_message(Recipient: <id>)`.
* **Pre-Spawn Hook**: Provide the exact MCP call the orchestrator must execute before invoking subagents.
* **Deliverable Ingestion**: Specify the exact file path read from the agent's `deliverable` frontmatter upon completion.

---

## 📋 3. Prescriptive Orchestrator Building Blocks

Every WeaveMAS orchestrator guideline must specify four core mechanisms:

### Block A: Master Orchestrator Status Contract & Upfront Stage Scaffolding
The orchestrator maintains the master `status.md` at the root of `output/<context_slug>/`.

> [!IMPORTANT]
> **Orchestrator Startup Initialization & Upfront Stage Scaffolding**:
> Once orchestration starts, **the orchestrator performs two immediate scaffolding actions before dispatching subagents**:
> 1. **Pre-Create All Stage Directories Upfront**: Create a directory in the output directory for each stage defined in the pipeline (e.g. `stage01_setup/`, `stage02_concept/`, `stage03_writing/`)—**even though they are initially empty**.
>    * *Why Mandatory*: The WeaveMAS UI tracker sidecar discovers the full pipeline topology on day zero, rendering the complete stage stepper without 404s or delayed detection.
> 2. **Initialize status (`status.md`)**:
>    Declare the initial master status (`status.md`):
>    * `role: orchestrator`, `type: orchestrator`
>    * `status: in_progress/<first_stage>`
>    * `deliverable: null`

* **`type`**: Always `orchestrator`.
* **`status`**: Current pipeline stage (`in_progress/<stage_name>`, `completed`, `blocked/<reason>`).
* **`deliverable`**: Relative path to the final compiled result of the entire pipeline, or `null` while in progress.
* **`updated_at`**: ISO 8601 timestamp string.

> [!CAUTION]
> **Closed Frontmatter Schema**: The `status.md` frontmatter schema is strictly closed to these 5 fields (`type`, `role`, `status`, `deliverable`, `updated_at`). Every time an author wants to introduce a new frontmatter parameter, it **MUST explicitly ask the user first**. Adding unapproved fields is strictly prohibited.

---

### Block B: The Mandatory Pre-Spawn Hook
Before dispatching any subagent via `invoke_subagent`, the orchestrator **must** execute this pre-spawn hook:

1. Create the dedicated subagent directory: `<stage_slug>/agents/<agent_identifier>/`.
2. Initialize status (`status.md`) with `role: "<role_slug>"` (`status: not_started`).
3. Stage required Tier 2 deliverables directly into the subagent directory.

> [!IMPORTANT]
> **Declarative Authoring Mandate & `status.md` Referencing**:
> In stage guides, write clean, declarative directives referencing `status.md` (e.g. *"Initialize status (`status.md`) with `role: ...`"*, *"Advance master status (`status.md`) to `...`"*). Never paste raw `call_mcp_tool` JSON boilerplate into individual stage guidelines; the `weave-core-orchestrator` skill mandates that whenever an orchestration script references status or `status.md`, the orchestrator executes the corresponding WeaveMAS MCP status tool (`status_init`, `status_update`, `status_verify`), strictly supplying the absolute workspace path for `dir`.

---

### Block C: Subagent Input Feeding Strategies (The 3-Tier Model)
To prevent LLM summarization loss and enforce Zero Unnecessary Exploration (ZUE), orchestrators categorize inputs by their structural type:

1. **Tier 1: Task Directives & Runtime Parameters (Prompt Inlining)**:
   * **What**: Immediate prompt configuration—target duration (`60.0 min`), segment identifiers (`SEG-01`), and specific narrative beats.
   * **Rule**: Inlined directly in the `invoke_subagent` prompt.
2. **Tier 2: Prior Stage Handoff Deliverables (Pre-Spawn Workspace Staging)**:
   * **What**: Canonical artifacts generated by prior pipeline stages (`01_setup.md`, `02_concept.md`, `03_script.md`).
   * **Rule**: The orchestrator **must copy or write the deliverable file into the subagent's working directory during the pre-spawn hook** (e.g. `<stage_slug>/agents/<agent_identifier>/01_setup.md`).
   * **Strict Prohibition**: **Never** instruct an orchestrator to inline a prior stage deliverable into a prompt. LLMs have an intrinsic brevity bias and will summarize or truncate the document.
3. **Tier 3: Bulk Read-Only Assets (Media Libraries, Audio/Video, Large Datasets)**:
   * **What**: Heavy binary assets. Never copy bulk files.
   * **Rule**: Pass an `asset_manifest.md` or explicit read-only directory path. The subagent reads source media from the external path, but all outputs and `status.md` must be written strictly inside its assigned CWD.

---

### Block D: Dispatch & Deliverable Ingestion Protocol
1. **Dispatch (`invoke_subagent`)**:
   * Dispatch via `TypeName: "self"` (which guarantees full inheritance of mounted plugin skills, tool permissions, and MCP servers), setting `Model: "flash"` (or as configured in the agent definition).
   * **Assigned Working Directory**: Explicitly state:
     `Assigned Working Directory: output/<context_slug>/<stage_slug>/agents/<agent_identifier>/`
   * **The Black Box Dispatch Constraint (No Prompt Over-Specification)**:
     - Treat subagents as autonomous black boxes.
     - The dispatch prompt must provide:
       1. The role instruction file path to read (e.g. `Act as the <role> configured in <path>.\nRead <path> for your role instructions...`).
       2. The assigned working directory.
       3. The staged inputs in that directory (Tier 1 parameters & Tier 3 asset references).
       4. The final required deliverable.
     - Never micromanage intermediate status updates or internal reasoning in the prompt.
   * Do NOT poll in a loop; leverage reactive wakeups.
2. **Completion & Deliverable Ingestion (Fail Fast)**:
   * When the agent finishes, query its status via `status_read` (`dir: "<absolute_subagent_dir>"`).
   * Verify `status` indicates `completed` (or starts with `completed`).
   * Match the subagent's actual `deliverable` against orchestrator expectations (e.g. `deliverable: "setup.md"` or `deliverable: null` for agents producing no file).
   * If a deliverable file is expected, verify it exists on disk and is non-empty.
   * If `status` is not completed or deliverable does not match expectations, **fail fast** and log a blocker error immediately.
   * Ingest the verified deliverable. Never use `view_file` to inspect `status.md`.

---

## 🔁 4. Subagent Session Continuity & Iterative Feedback Loops

When an agent needs revision (e.g. from user review gates, Showrunner adjustments, or Fact Checker feedback):

1. **Session Continuity Mandate**:
   * `invoke_subagent` is strictly reserved for the **initial instantiation** of an agent role within a stage.
   * When revisions or feedback occur, the orchestrator **must** send the feedback directly to the existing agent instance using `send_message(Recipient: <conversationId>, Message: ...)`.
   * **Zero Subagent Churn**: Spawning duplicate agent instances for an already active or idle subagent role is strictly prohibited.
2. **In-Place Deliverable Iteration**:
   * Never delete or reset existing deliverable files (`concept.md`, `draft.md`) or status files on revision. The subagent inspects its previous work in its assigned directory and refines it in place.
3. **Hard Cap (Strict Termination)**:
   * Always enforce a maximum revision iteration limit (e.g., maximum 2 revision loops). If exceeded, halt and escalate to the user.

---

## ✍️ 5. Concrete Orchestrator Guideline Templates

### Template A: Master Orchestrator Guide (`orchestration_guide.md`)

```markdown
# Multi-Agent <Pipeline Name> Orchestration Guide

Operate as a WeaveMAS orchestrator. You MUST use the `weave-core-orchestrator` skill to manage stage scaffolding, subagent pre-spawn hooks, and pipeline lifecycle tracking.

## Inputs
- `param1`: ...
- `param2`: ...

## Output Structure
Every run is scoped to a dedicated context directory matching:
`output/<context_slug>/` (referred to as `SHOW_DIR` or context root).

All stage directories, agent workspaces, status tracking files, and final compiled deliverables live strictly inside this context root.

## Execution
The pipeline executes through sequential stages. For each stage, the orchestrator follows the referenced protocol guide to manage pre-spawn hooks, subagent dispatch, and deliverable verification:

### Stage 1: <Stage Title> (<Agent Roles>)
* **Execution Directory**: `stage01_<slug>/`
* **Protocol**: [orchestration/stage1_<slug>.md](orchestration/stage1_<slug>.md)
* **Deliverable**: `01_<deliverable>.md`
* **Gate**: Explicit user review approval required before unlocking Stage 2.

### Stage 2: <Stage Title> (<Agent Roles>)
* **Execution Directory**: `stage02_<slug>/`
* **Protocol**: [orchestration/stage2_<slug>.md](orchestration/stage2_<slug>.md)
* **Deliverable**: `02_<deliverable>.md`
```

### Template B: Single-Agent Modular Stage Guide (`orchestration/<stage_slug>.md`)

```markdown
# Stage <N>: <Stage Title>

## Objective
<1-sentence description of the stage's creative or technical goal>

## Agent Roles
* `<agent_identifier>`: `.agent/agents/<stage>/agent_<role>.md` (Directory: `stage<NN>_<slug>/agents/<role_slug>/`)

## Execution
1. **`<agent_identifier>`**:
   - Inputs: Pass required parameters and staged prior deliverables / asset references.
   - Execution: <Summary of execution action>
2. **Deliverable Ingestion**:
   - Ingest verified `<deliverable_name>.md` as stage deliverable `<NN>_<stage_deliverable>.md`.
3. **User Review Gate** *(Optional)*:
   - Present `<NN>_<stage_deliverable>.md` to the user for review approval.
   - If not approved, route user feedback to `<agent_identifier>` via `send_message` for an additional iteration on its deliverable.
   - Do not proceed to the next stage until the user grants explicit approval.
```

### Template C: Multi-Agent Relay / Loop Stage Guide (`orchestration/<stage_slug>.md`)

Use this template when a stage coordinates multiple subagent roles across a parameterized loop (e.g. per-segment, per-chapter, or per-item processing):

```markdown
# Stage <N>: <Stage Title>

## Objective
<1-sentence description of the stage's goal>

## Agent Roles
* `<role1>_<item_id>`: `.agent/agents/<stage>/agent_<role1>.md` (Directory: `stage<NN>_<slug>/agents/<item_id>/<role1_slug>/`)
* `<role2>_<item_id>`: `.agent/agents/<stage>/agent_<role2>.md` (Directory: `stage<NN>_<slug>/agents/<item_id>/<role2_slug>/`)
* `<role3>_<item_id>`: `.agent/agents/<stage>/agent_<role3>.md` (Directory: `stage<NN>_<slug>/agents/<item_id>/<role3_slug>/`)

## Execution

### 1. Upfront Scaffolding
For each item (`<item_id>`) in `<prior_stage_deliverable>.md`:
* Scaffold agent workspaces under `stage<NN>_<slug>/agents/<item_id>/`:
  - `<role1_slug>/`: Stage `<input_files>`.
  - `<role2_slug>/`: Stage `<input_files>`.
  - `<role3_slug>/`: Empty (receives deliverable from `<role2>_<item_id>` during loop).

### 2. <Item> Processing Loop
For each `<item_id>`:

1. **`<role1>_<item_id>`**:
   - Inputs: Staged input files, item parameters.
   - Handoff: Ingest verified `<deliverable_1>` and stage into `<role2>_<item_id>` workspace.

2. **`<role2>_<item_id>`**:
   - Inputs: Staged `<deliverable_1>` (from `<role1>_<item_id>`), runtime parameters.
   - Handoff: Ingest verified `<deliverable_2>` and stage into `<role3>_<item_id>` workspace.

3. **`<role3>_<item_id>`**:
   - Inputs: Staged `<deliverable_2>` (from `<role2>_<item_id>`).
   - Ingestion & Gate: Ingest verified `<deliverable_3>`. If revision requested (max 2 cycles), re-invoke `<role2>_<item_id>` via `send_message` before approving.

### 3. Aggregation & Deliverable Compilation
1. **Aggregation Pass** *(Optional)*:
   - Spawn designated agent (e.g. `<role>_global_flow`) to review continuity across assembled items.
2. **Deliverable Compilation**:
   - Assemble finalized items into stage deliverable `<NN>_<stage_deliverable>.md`.
```

