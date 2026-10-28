# Authoring Guide: WeaveMAS Orchestrators

Authoring a WeaveMAS orchestrator produces:
1. `orchestrator_trigger.md` (workspace trigger rule for `.agent/rules/`)
2. `orchestrator.md` (master orchestrator guide)
3. `orchestrator/<stage_slug>.md` *(optional — used only in multi-stage pipelines)*

---

## 🎯 1. Workspace Trigger Rule (`orchestrator_trigger.md`)

Because Antigravity blocks writing directly to `.agent/rules/`, write `orchestrator_trigger.md` to the workspace root and include this `[!CAUTION]` alert in your final chat response:

```markdown
> [!CAUTION]
> 🔴 **IMPORTANT — MANUAL STEP REQUIRED TO ACTIVATE PIPELINE**
> Move `orchestrator_trigger.md` into `.agent/rules/orchestrator_trigger.md`:
> ```powershell
> New-Item -ItemType Directory -Force -Path .agent/rules | Out-Null; Copy-Item -Force orchestrator_trigger.md .agent/rules/orchestrator_trigger.md
> ```
```

### Trigger Rule Template (`orchestrator_trigger.md`)
```markdown
---
trigger: always_on
---

# <Pipeline Name> Protocol

## 1. Pipeline Execution
**Trigger:** Any request to run or generate with the pipeline containing "<trigger_phrase_1>" or "<trigger_phrase_2>".
**Action:** Before invoking any subagents or running commands, read `orchestrator.md` (and modular guides under `orchestrator/` if present).

## 2. Outcome Feedback & Pipeline Revision
**Trigger:** Any request providing feedback, critique, or reporting mistakes on the outcome of a pipeline run in `output/<context_slug>/`.
**Action:** Activate the `weave-authoring` skill and follow `references/authoring_revision.md`.
```

---

## 🏛️ 2. Core Authoring Rules for `orchestrator.md` & Stage Guides

* **Mandatory Binding Statement**: Place near the top of `orchestrator.md`:
  ```markdown
  Operate as a WeaveMAS orchestrator. You MUST use the `weave-core-orchestrator` skill to manage stage scaffolding, Phase 1 provisioner delegation, and pipeline lifecycle tracking.
  ```
* **Pure Declarative Authoring (Zero Runtime Mechanics)**:
  Stage files declare **what** (agents, inputs, outputs, and sequence); `weave-core-orchestrator` handles **how** (upfront stage folder creation, Phase 1 `provisioner` delegation, Phase 2 `discover_agents`, black-box prompts, and `weave_read`).
  - **NEVER** author a `Step 0: Upfront Scaffolding` section in `orchestrator.md`.
  - **NEVER** author `invoke_subagent` prompt templates, `weave_init` calls, or polling reminders in stage files.
* **Black-Box Execution Abstraction (No Internal Leaks)**:
  Keep `## Execution` steps high-level and focused strictly on the domain workflow. Never expose internal subagent implementation details:
  - **No Internal Task Labels**: Do not reference internal agent task headings or section IDs (e.g. avoid `pause at Task 02_handoff`; write `report unverified track queries and wait for track sourcing`).
  - **No Status String Leaks**: Do not prescribe low-level status enums in execution steps (e.g. avoid `transition status to waiting/sourcer_calibration`; write `wait for ...`). Subagent instructions define their own internal status transitions; the orchestrator guide defines only the observable domain sequence.
* **Agent Declarations & `inputs` (`## Agents`)**:
  - Use lowercase `snake_case` slugs (parameterized with zero-padded indices for loops, e.g. `writer_a<AA>_s<SS>`).
  - List **only** concrete stateful leaf agents with physical directories (`stage<NN>_<slug>/agents/<agent_id>/` or `agents/<agent_id>/`). **Never** list ephemeral sub-orchestrators under `## Agents`.
  - **File Inputs (`* **Inputs**:`)**: Never copy or stage input files into agent directories, and never inline prior outputs into prompts. Instead, list all required input files under `* **Inputs**:` using **portable relative paths** (with optional logical names `- <Name>: <path>` and optional `*` wildcards):
    1. **Relative to Agent CWD**: `../writer/draft.md` or `../architect_*/beats.md`
    2. **Relative to Run Directory (`runs/<context_slug>/`)**: `01_editorial_approved.md`
    3. **Relative to Workspace Root (`<workspace_root>/`)**: `prompts/personas/<host_id>.md` or `prompts/rules/*.md`
    - *Named Input Aliases (Recommended for Stage Output Decoupling)*:
      Promoted deliverables in the run directory should use zero-padded numeric prefixes (e.g. `01_setup.md`, `01_host.md`, `02_concept.md`, `03_script.md`) for clean chronological sorting in file explorers.
      To keep subagents completely decoupled from orchestrator stage numbers, bind a clean semantic alias:
      `- setup.md: output/<context_slug>/01_setup.md`
      `- host.md: output/<context_slug>/01_host.md`
      `- concept.md: output/<context_slug>/02_concept.md`
      At runtime, `weave_verify` maps these aliases in `resolved_inputs`, allowing the subagent instructions to refer purely to `setup.md`, `host.md`, or `concept.md`.
  - During Phase 1, the `provisioner` records these relative/named entries directly in `weave.md` `inputs`. When the agent starts and calls `weave_verify` on Turn 1, `weave_verify` resolves each entry across the 3-tier hierarchy (`agentDir` to `runs/<context_slug>/` to `<workspace_root>/`), fails fast if any is missing, and returns the resolved absolute path(s).
* **Orchestrator Operations**: Keep orchestrator file transformations minimal and at the end of sub-orchestrator units, stages, or the pipeline (e.g., **Orchestrator Operations** promoting `stage01_editorial/agents/writer/draft.md` to `${RUN_DIR}/01_editorial_approved.md`).
* **Mandatory Static Verification**: After authoring or modifying any orchestrator, stage, or agent file, always run [`references/authoring_verification.md`](authoring_verification.md) and print the stage-by-stage verification checklist to the user.
* **In-Place Revisions**: Specify `send_message` to the existing `<agent_id>` (with a max iteration cap, e.g. max 2 cycles) rather than re-spawning agents.

---

## ✍️ 3. Orchestrator & Stage Templates

### Template A: Multi-Stage Master Guide (`orchestrator.md`)
```markdown
# Multi-Agent <Pipeline Name> Orchestrator Guide

Operate as a WeaveMAS orchestrator. You MUST use the `weave-core-orchestrator` skill to manage stage scaffolding, Phase 1 provisioner delegation, and pipeline lifecycle tracking.

## Inputs
- `param1`: ...

## Run Directory Structure
Every run is scoped to `runs/<context_slug>/`.

## Execution

### Stage 1: <Stage Title>
* **Execution Directory**: `stage01_<slug>/`
* **Protocol**: [orchestrator/stage1_<slug>.md](orchestrator/stage1_<slug>.md)
* **Output**: `01_<output>.md`
* **Gate**: Explicit user review approval required before unlocking Stage 2.

### Stage 2: <Stage Title>
* **Execution Directory**: `stage02_<slug>/`
* **Protocol**: [orchestrator/stage2_<slug>.md](orchestrator/stage2_<slug>.md)
* **Output**: `02_<output>.md`
```

### Template B: Single-File / Stageless Master Guide (`orchestrator.md`)
```markdown
# Multi-Agent <Pipeline Name> Orchestrator Guide

Operate as a WeaveMAS orchestrator. You MUST use the `weave-core-orchestrator` skill to manage workspace scaffolding, Phase 1 provisioner delegation, and pipeline lifecycle tracking.

## Inputs
- `param1`: ...

## Run Directory Structure
Every run is scoped to `runs/<context_slug>/`.

## Agents

### <Role 1> Agent: `<agent_1>`
* **Instructions**: [agent_<role1>.md](.agent/agents/agent_<role1>.md)
* **Working Directory**: `${RUN_DIR}/agents/<agent_1>/`

### <Role 2> Agent: `<agent_2>`
* **Instructions**: [agent_<role2>.md](.agent/agents/agent_<role2>.md)
* **Working Directory**: `${RUN_DIR}/agents/<agent_2>/`
* **Inputs**:
  - `../<agent_1>/<output_1>.md`
  - `Context Data`: `${RUN_DIR}/<context_file>.md`
  - `${PROJECT_DIR}/prompts/<shared_prompt>.md`

## Execution
1. **`<agent_1>`**: Pass runtime inputs and verify `<output_1>.md`.
2. **`<agent_2>`**: Audit `<output_1>.md` and produce `<output_2>.md`. If revisions are required (max 2 cycles), route feedback to `<agent_1>` via `send_message`.
3. **Orchestrator Operations**: Promote verified output to `${RUN_DIR}/<final_output>.md`.
```

### Template C: Modular Stage Guide (`orchestrator/stage<N>_<slug>.md`)
```markdown
# Stage <N>: <Stage Title>

## Objective
<1-sentence goal of the stage>

## Agents

### <Role 1> Agent: `<role1>_<item_id>`
* **Instructions**: [stage<N>_<role1>.md](.agent/agents/stage<N>_<role1>.md)
* **Working Directory**: `${RUN_DIR}/stage<NN>_<slug>/agents/<role1>_<item_id>/`
* **Inputs**:
  - `Prior Output`: `${RUN_DIR}/<prior_output>.md`
  - `${PROJECT_DIR}/prompts/<reference_file>.md`
  - `../<sibling_agent>/<sibling_output>.md`

## Execution
1. **`<role1>_<item_id>`**: Execute with stage parameters and verify `<output_name>.md`.
2. **Orchestrator Operations**: Promote verified output to `${RUN_DIR}/<NN>_<stage_output>.md`.
3. **User Review Gate** *(Optional)*: Present `<NN>_<stage_output>.md` for approval; route any revision feedback to `<role1>_<item_id>` via `send_message`.
```
