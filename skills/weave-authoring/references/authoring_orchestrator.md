# Authoring Guide: WeaveMAS Orchestrators

This guide details how to author **Orchestrator Guidelines**—comprising the workspace trigger rule (`.agent/rules/orchestrator_trigger.md`), the master orchestrator guide (`orchestrator.md`), and optional modular stage files in the `orchestrator/` folder—by weaving concrete workspace paths, upfront directory scaffolding, pre-spawn hooks, state supervision, and fail-fast deliverable ingestion directly into orchestrator instructions.

---

## 🎯 1. The Standard Orchestrator Binding Contract

### A. Workspace Trigger Rule (`.agent/rules/orchestrator_trigger.md`)
In Antigravity, the primary agent operates in the main conversation and transitions into either a WeaveMAS orchestrator (to run the pipeline) or a WeaveMAS revision architect (to diagnose and fix outcome issues) when triggered by a workspace rule in `.agent/rules/`:

```markdown
---
trigger: always_on
---

# <Pipeline Name> Protocol

## 1. Pipeline Execution
**Trigger:** Any request to run or generate with the pipeline containing "<trigger_phrase_1>", "<trigger_phrase_2>", or "<trigger_phrase_3>".
**Action:** Before invoking any subagents or running commands, you must first read `orchestrator.md` (and follow the modular stage guidelines under `orchestrator/` if present).

## 2. Outcome Feedback & Pipeline Revision
**Trigger:** Any request providing feedback, critique, or reporting mistakes on the outcome/output of a pipeline run (e.g., in `output/<context_slug>/`).
**Action:** Do NOT jump straight to ad-hoc edits. You MUST activate the `weave-authoring` skill and follow its Outcome Review & Revision guide (`references/authoring_revision.md`) to address this.
```

* **Why Mandatory**: Without this rule, the primary agent neither knows to read `orchestrator.md` when asked to run the pipeline, nor knows to run structured dual-track revision when the user critiques a generated outcome.
* **`.agent/rules/` Write Protection & Mandatory Red Chat Alert**: Because Antigravity blocks agents from writing directly into `.agent/rules/`, you **MUST** write the rule file to the workspace root as `orchestrator_trigger.md` and include the following **RED** (`[!CAUTION]`) alert block at the top or bottom of your final chat response so the user cannot miss it:
  ```markdown
  > [!CAUTION]
  > 🔴 **IMPORTANT — MANUAL STEP REQUIRED TO ACTIVATE PIPELINE**
  > Antigravity prevents agents from writing directly to `.agent/rules/`. To enable automatic pipeline triggering:
  > 1. Ensure the directory `.agent/rules/` exists (create it in the AGY IDE file tree if needed).
  > 2. Copy or drag-and-drop the generated `orchestrator_trigger.md` file into `.agent/rules/orchestrator_trigger.md`.
  >
  > Alternatively, run:
  > ```powershell
  > New-Item -ItemType Directory -Force -Path .agent/rules | Out-Null; Copy-Item -Force orchestrator_trigger.md .agent/rules/orchestrator_trigger.md
  > ```
  ```

### B. Master Prompt Binding Statement (`orchestrator.md`)
Every `orchestrator.md` file must include this mandatory binding statement verbatim near the top of the document:

```markdown
Operate as a WeaveMAS orchestrator. You MUST use the `weave-core-orchestrator` skill to manage stage scaffolding, subagent pre-spawn hooks, and pipeline lifecycle tracking.
```

---

## 🏛️ 2. Orchestrator Architecture & The Concrete Weaving Principle

### Two Structural Modes (Stages are Optional)
WeaveMAS supports both **Multi-Stage Modular** pipelines and **Single-File (Stageless)** pipelines:

1. **Mode 1: Multi-Stage Modular Pipeline (`orchestrator.md` + `orchestrator/stage<N>_<slug>.md`)**:
   * **Master Orchestrator Guide (`orchestrator.md`)**: Resides at the workspace root. Defines pipeline inputs, output context root scoping (`output/<context_slug>/`), and the declarative `## Execution` section listing each stage:
     * **`Execution Directory`**: The stage directory slug (e.g. `stage01_setup/`).
     * **`Protocol`**: Link to the dedicated stage guide (e.g. `[orchestrator/stage1_setup.md](orchestrator/stage1_setup.md)`).
     * **`Deliverable`**: Canonical stage deliverable ingested into the context root (e.g. `01_setup.md`).
     * **`Gate`** *(Optional)*: Explicit review approval required before unlocking the next stage.
     * *Anti-Pattern*: Never duplicate subagent action steps, prompts, or internal reasoning in the master guide when using modular stage guides.
   * **Modular Stage Guides (`orchestrator/[<stage_slug>].md`)**: Dedicated guideline files residing in the `orchestrator/` folder (e.g. `orchestrator/stage1_setup.md`, `orchestrator/stage2_concept.md`). Each file details `## Objective`, `## Agents`, and `## Execution` for that stage.
2. **Mode 2: Single-File / Stageless Pipeline (`orchestrator.md` only)**:
   * For simpler workflows that do not require separate stage files, omit the `orchestrator/` folder entirely.
   * Define `## Inputs`, `## Output Structure`, `## Agents`, and the complete `## Execution` steps directly inside `orchestrator.md`.
   * Subagent working directories live directly at `output/<context_slug>/agents/<agent_identifier>/` (or under stage folders if declared inline).

> **Golden Rule of WeaveMAS**: When authoring orchestrator guidelines, **never present abstract meta-options**. Inline the *exact, concrete directory structure, subagent paths, and hook templates* for that specific workflow.

* **Context Root (`<context_slug>`)**: Specify the exact context directory: `output/<context_slug>/` (e.g. `output/show_09-10-2026_the_clash/` or `output/article_2026-10-12_ai_chips/`). Scoping everything to `output/<context_slug>/` isolates all intermediate drafts, subagent directories, logs, and deliverables into a clean sandbox, preventing root directory pollution and multi-run collisions.
* **Subagent Working Directories**: Specify the exact relative path structure: `<stage_slug>/agents/<agent_identifier>/` (multi-stage) or `agents/<agent_identifier>/` (single-file stageless).
* **Agent Identifier Convention (`<agent_identifier>`)**: Every agent declared in `## Agents` MUST be assigned an explicit, lowercase snake_case identifier slug:
  - *Single-Instance Agents*: Semantic role slugs (`director`, `showrunner`, `youtube_sourcer`, `staging`, `continuity_writer`).
  - *Multi-Instance Agents*: Parameterized slugs with zero-padded coordinates (`architect_a<AA>_s<SS>`, `segment_writer_a<AA>_s<SS>`, `factchecker_a<AA>_s<SS>`).
  - *Strict Prohibition — No Ephemeral Sub-Orchestrators in `## Agents`*: The `## Agents` section is strictly and exclusively reserved for **concrete, stateful leaf agents** with dedicated physical working directories and leaf `status.md` files. Ephemeral sub-orchestrators are purely execution constructs declared in `## Execution` (e.g. `For each <item>, cluster into a sub-orchestrator and execute in parallel:`). **Never declare ephemeral sub-orchestrators under `## Agents`.**
  - *Why Mandatory*: Unambiguously referenced throughout `## Execution`, passed directly as `Role: "<agent_identifier>"` in `invoke_subagent` for deterministic UI sidecar badges, and targeted in `send_message(Recipient: <id>)`.
* **Sub-Orchestrators & Parallel Execution**: The `## Execution` section in `orchestrator.md` or individual stage guides defines the step-by-step operational procedure for running the stage. WeaveMAS provides two independent, orthogonal concepts for designing workflows:
  - **Sub-Orchestrators (Encapsulation)**: A multi-agent loop or sub-workflow can be clustered into an ephemeral sub-orchestrator to isolate internal revision cycles (e.g. Writer ⇆ Fact-Checker) and intermediate drafts from the root context window. Sub-orchestrators can be executed **sequentially** (e.g. `For each <item>, cluster into a sub-orchestrator:`) or **in parallel** (`...and execute in parallel:`).
  - **Parallel Execution (Concurrency Modifier)**: Parallelism is a general execution modifier that can be applied to **agents** (e.g. `Run the following agents in parallel:`, `For each <item>, run <agent> in parallel:`) or to **sub-orchestrators** (e.g. `Cluster each into a sub-orchestrator and execute in parallel:`).
  - *Reference*: See [`authoring_parallelization.md`](authoring_parallelization.md) for the complete architecture matrix, selection criteria, the ephemeral sub-orchestrator contract, and protocol templates.
* **Pre-Spawn Hook**: Provide the exact MCP call the orchestrator must execute before invoking subagents.
* **Deliverable Ingestion**: Specify the exact file path read from the agent's `deliverable` frontmatter upon completion.

---

## 📋 3. Prescriptive Orchestrator Building Blocks

Every WeaveMAS orchestrator relies on four core runtime mechanisms. Understand the fundamental division of labor: **stage files define what** (agents, inputs, deliverables, and sequential flow); the mounted `weave-core-orchestrator` skill handles **how** (pre-spawn hooks, prompt formatting, tool mapping, and status verification). Do NOT re-write these procedural mechanics into stage files:

### Block A: Master Orchestrator Status Contract & Upfront Stage Scaffolding
The orchestrator maintains the master `status.md` at the root of `output/<context_slug>/`.

> [!IMPORTANT]
> **Orchestrator Startup Initialization & Upfront Stage Scaffolding (Executed by Skill)**:
> Once orchestration starts, **the orchestrator executes two immediate scaffolding actions before dispatching subagents**:
> 1. **Pre-Create All Stage Directories Upfront**: Create a directory in the output directory for each stage defined in the pipeline (e.g. `stage01_setup/`, `stage02_concept/`, `stage03_writing/`)—**even though they are initially empty**.
>    * *Why Mandatory*: The WeaveMAS UI tracker sidecar discovers the full pipeline topology on day zero, rendering the complete stage stepper without 404s or delayed detection.
> 2. **Initialize status (`status.md`)**:
>    Declare the initial master status (`status.md`):
>    * `role: orchestrator`, `type: orchestrator`
>    * `status: in_progress/<first_stage>`
>    * `deliverable: null`
>
> > [!NOTE]
> > **Do NOT Author "Step 0" into `orchestrator.md`**: Pre-creating stage folders and initializing master `status.md` are universal runtime obligations of the mounted `weave-core-orchestrator` skill. Writing a literal `### Step 0: Upfront Scaffolding` section in `orchestrator.md` is redundant boilerplate. In `orchestrator.md`, `## Execution` jumps directly to `### Stage 1: ...`.

* **`type`**: Always `orchestrator`.
* **`status`**: Current pipeline stage (`in_progress/<stage_name>`, `completed`, `blocked/<reason>`).
* **`deliverable`**: Relative path to the final compiled result of the entire pipeline, or `null` while in progress.
* **`updated_at`**: ISO 8601 timestamp string.

> [!CAUTION]
> **Closed Frontmatter Schema**: The `status.md` frontmatter schema is strictly closed to these 5 fields (`type`, `role`, `status`, `deliverable`, `updated_at`). Every time an author wants to introduce a new frontmatter parameter, it **MUST explicitly ask the user first**. Adding unapproved fields is strictly prohibited.

---

### Block B: The Mandatory Pre-Spawn Hook
Before dispatching any subagent via `invoke_subagent`, the orchestrator **must** execute this pre-spawn hook:

1. Initialize status (`status.md`) with `role: "<role_slug>"` (`status: not_started`). Calling `status_init` automatically creates the target working directory (`<stage_slug>/agents/<agent_identifier>/`) recursively, eliminating separate directory creation commands. (When initializing multiple subagents for a wave, multi-agent stage, or loop, batch initialization via `status_init` with `items: [...]` is preferred).
2. Stage required Tier 2 deliverables directly into the initialized subagent directory.

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
   * **Standardized Declarative Syntax in `## Agents`**:
     Declare all input sources concisely using this standard single-line format under `* **Inputs**:`:
     - Whole file handoff: `- Source: <file_path> (staged as: <local_name>)`
     - Section extraction: `- Source: <file_path> (extract section <section_id>) (staged as: <local_name>)`
     *Example*:
     ```markdown
     * **Inputs**:
       - Source: `output/<context_slug>/02_concept.md` (extract section `### Segment <SS>`) (staged as: `concept.md`)
       - Source: `prompts/personas/<host_id>.md` (staged as: `persona.md`)
     ```
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

### Template A1: Workspace Trigger Rule (`.agent/rules/orchestrator_trigger.md`)

```markdown
---
trigger: always_on
---

# <Pipeline Name> Protocol

## 1. Pipeline Execution
**Trigger:** Any request to run or generate with the pipeline containing "<trigger_phrase_1>", "<trigger_phrase_2>", or "<trigger_phrase_3>".
**Action:** Before invoking any subagents or running commands, you must first read `orchestrator.md` and follow the modular guidelines under `orchestrator/` (if present).

## 2. Outcome Feedback & Pipeline Revision
**Trigger:** Any request providing feedback, critique, or reporting mistakes on the outcome/output of a pipeline run (e.g., in `output/<context_slug>/`).
**Action:** Do NOT jump straight to ad-hoc edits. You MUST activate the `weave-authoring` skill and follow its Outcome Review & Revision guide (`references/authoring_revision.md`) to address this.
```

### Template A2: Master Orchestrator Guide — Multi-Stage (`orchestrator.md`)

> [!TIP]
> **No "Step 0" Section**: Notice that `## Execution` below transitions immediately into `### Stage 1: ...`. Never insert a `Step 0` or startup scaffolding step between `## Execution` and `### Stage 1`—all startup stage directory creation and master `status.md` initialization are handled automatically by `weave-core-orchestrator`.

```markdown
# Multi-Agent <Pipeline Name> Orchestrator Guide

Operate as a WeaveMAS orchestrator. You MUST use the `weave-core-orchestrator` skill to manage stage scaffolding, subagent pre-spawn hooks, and pipeline lifecycle tracking.

## Inputs
- `param1`: ...
- `param2`: ...

## Output Structure
Every run is scoped to a dedicated context directory matching:
`output/<context_slug>/` (referred to as context root).

All stage directories, agent workspaces, status tracking files, and final compiled deliverables live strictly inside this context root.

## Execution
The pipeline executes through sequential stages. For each stage, the orchestrator follows the referenced protocol guide to manage pre-spawn hooks, subagent dispatch, and deliverable verification:

### Stage 1: <Stage Title> (<Agent Names>)
* **Execution Directory**: `stage01_<slug>/`
* **Protocol**: [orchestrator/stage1_<slug>.md](orchestrator/stage1_<slug>.md)
* **Deliverable**: `01_<deliverable>.md`
* **Gate**: Explicit user review approval required before unlocking Stage 2.

### Stage 2: <Stage Title> (<Agent Names>)
* **Execution Directory**: `stage02_<slug>/`
* **Protocol**: [orchestrator/stage2_<slug>.md](orchestrator/stage2_<slug>.md)
* **Deliverable**: `02_<deliverable>.md`
```

### Template A3: Master Orchestrator Guide — Single-File / Stageless (`orchestrator.md`)

Use this self-contained template when a pipeline does not need separate `orchestrator/stage*.md` files:

```markdown
# Multi-Agent <Pipeline Name> Orchestrator Guide

Operate as a WeaveMAS orchestrator. You MUST use the `weave-core-orchestrator` skill to manage stage scaffolding, subagent pre-spawn hooks, and pipeline lifecycle tracking.

## Inputs
- `param1`: ...

## Output Structure
Every run is scoped to a dedicated context directory matching:
`output/<context_slug>/`.

## Agents

### <Role 1> Agent: `<agent_id_1>`
* **Instructions**: [agent_<role1>.md](.agent/agents/agent_<role1>.md)
* **Working Directory**: `agents/<agent_id_1>/`

### <Role 2> Agent: `<agent_id_2>`
* **Instructions**: [agent_<role2>.md](.agent/agents/agent_<role2>.md)
* **Working Directory**: `agents/<agent_id_2>/`

## Execution
1. **`<agent_id_1>`**:
   - Inputs: Pass required parameters and staged inputs.
   - Handoff: Ingest verified `<deliverable_1>.md` and stage into `<agent_id_2>` workspace.
2. **`<agent_id_2>`**:
   - Inputs: Staged `<deliverable_1>.md`.
   - Deliverable Ingestion: Ingest verified `<deliverable_2>.md` as final deliverable `<final_deliverable>.md` at context root.
```

### Template B: Single-Agent Modular Stage Guide (`orchestrator/<stage_slug>.md`)

> [!CAUTION]
> **Stage File Anti-Patterns**:
> 1. **Never write out `invoke_subagent` prompt templates or tool JSON**: The mounted `weave-core-orchestrator` skill automatically constructs standard black-box dispatch prompts from the agent instructions, working directory, and staged inputs.
> 2. **Never write out mechanical pre-spawn procedures** (e.g., *"Step 1: Initialize status via status_init..."*): Declaring agents and inputs under `## Agents` is all the orchestrator needs to execute scaffolding automatically.
> 3. **Never write out reactive wait or polling reminders**: Reactive wakeup is handled natively by the messaging runtime.
> 4. Stage files are **declarative workflow contracts** (who, what inputs, what sequence), NOT procedural execution scripts written in markdown.

```markdown
# Stage <N>: <Stage Title>

## Objective
<1-sentence description of the stage's creative or technical goal>

## Agents

### <Role Title> Agent: `<agent_identifier>`
* **Instructions**: [agent_<role>.md](.agent/agents/<stage>/agent_<role>.md)
* **Working Directory**: `stage<NN>_<slug>/agents/<role_slug>/`

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

### Template C: Multi-Agent Relay / Loop Stage Guide (`orchestrator/<stage_slug>.md`)

Use this template when a stage coordinates multiple subagent roles across a parameterized loop (e.g. per-segment, per-chapter, or per-item processing):

```markdown
# Stage <N>: <Stage Title>

## Objective
<1-sentence description of the stage's goal>

## Agents

### <Role 1> Agents: `<role1>_<item_id>`
* **Instructions**: [agent_<role1>.md](.agent/agents/<stage>/agent_<role1>.md)
* **Working Directory**: `stage<NN>_<slug>/agents/<item_id>/<role1_slug>/`
* **Inputs**:
  - Source: `output/<context_slug>/<prior_deliverable>.md` (extract section `<section_id>`) (staged as: `<local_name>`)

### <Role 2> Agents: `<role2>_<item_id>`
* **Instructions**: [agent_<role2>.md](.agent/agents/<stage>/agent_<role2>.md)
* **Working Directory**: `stage<NN>_<slug>/agents/<item_id>/<role2_slug>/`
* **Inputs**:
  - Source: `stage<NN>_<slug>/agents/<item_id>/<role1_slug>/<deliverable_1>` (staged as: `<deliverable_1>`)
  - Source: `prompts/<reference_file>.md` (staged as: `<reference_file>.md`)

### <Role 3> Agents: `<role3>_<item_id>`
* **Instructions**: [agent_<role3>.md](.agent/agents/<stage>/agent_<role3>.md)
* **Working Directory**: `stage<NN>_<slug>/agents/<item_id>/<role3_slug>/`
* **Inputs**:
  - Source: `stage<NN>_<slug>/agents/<item_id>/<role2_slug>/<deliverable_2>` (staged as: `<deliverable_2>`)

### Consolidation Agent: `<consolidation_role>`
* **Instructions**: [agent_<consolidation_role>.md](.agent/agents/<stage>/agent_<consolidation_role>.md)
* **Working Directory**: `stage<NN>_<slug>/agents/<consolidation_role>/`
* **Inputs**:
  - Source: `stage<NN>_<slug>/agents/<consolidation_role>/draft_assembled.md` (staged as: `draft_assembled.md`)
  - Source: `output/<context_slug>/<prior_deliverable>.md` (staged as: `<prior_deliverable>.md`)

---

## Execution

### 1. <Item> Processing Loop
For each `<item_id>`, cluster into a sub-orchestrator and execute in parallel:

1. **`<role1>_<item_id>`**:
   - Ingest verified `<deliverable_1>` and stage into `<role2>_<item_id>` workspace.

2. **`<role2>_<item_id>`**:
   - Ingest verified `<deliverable_2>` and stage into `<role3>_<item_id>` workspace.

3. **`<role3>_<item_id>`**:
   - Ingest verified `<deliverable_3>`. If revision requested (max 2 cycles), re-invoke `<role2>_<item_id>` via `send_message` before approving.
   - Deliver verified unit deliverable.

### 2. Aggregation & Compilation
1. **Draft Assembly**:
   - Stitch all verified unit deliverables into `draft_assembled.md` under `stage<NN>_<slug>/agents/<consolidation_role>/`.
2. **`<consolidation_role>`**:
   - Review continuity across assembled items and compile final `<NN>_<stage_deliverable>.md`.
3. **Compilation**:
   - Ingest verified `<NN>_<stage_deliverable>.md` to `output/<context_slug>/`.
   - Advance master pipeline status (`status.md`) to `completed`.
```

