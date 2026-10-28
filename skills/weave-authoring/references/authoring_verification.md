# Authoring Guide: Static Pipeline Data-Flow Verification

Run this static analysis **purely on the authored pipeline files** (`orchestrator.md`, `orchestrator/*.md`, `.agent/agents/*.md`, and static workspace files)—before any pipeline execution—whenever creating or revising a WeaveMAS pipeline.

---

## 🔍 1. Core Concepts: File Inputs vs. Runtime Parameters

Always distinguish between physical **File Inputs** and scalar **Runtime Parameters**:
* **File Inputs (`* **Inputs**:` in `## Agents`)**: Physical files on disk (e.g. `01_setup.md`, `../writer/draft.md`, `../act_*/segment_*/writer/draft.md`, `prompts/personas/<host_id>.md`) recorded in `weave.md` `inputs`, resolved by `weave_verify`, and read via `view_file`.
* **Runtime Parameters (`## Execution` / `invoke_subagent`)**: Scalar values (e.g. `topic`, `target_duration`, `show_title`, `host_wpm`, `segment_id`) passed in the `Runtime Parameters:` block of the dispatch prompt. Do **not** flag scalar parameters as missing file inputs.

---

## 🧭 2. Unified Symbolic Execution Model (The Available File Set $\mathcal{F}$)

Trace the **Pipeline Data-Flow Graph (DFG)** from start to finish by maintaining the set of available files $\mathcal{F}$ across three lookup scopes:
1. **Agent Directory (`agentDir`)**: `<stage_slug>/agents/<agent_id>/` (or `agents/<agent_id>/` in stageless pipelines). Paths starting with `./` or `../` resolve **exclusively** against `agentDir`.
2. **Run Directory (`runDir`)**: Active run directory (`runs/<context_slug>/` or legacy `output/<context_slug>/`) containing stage-promoted outputs (e.g. `01_setup.md`, `02_concept.md`).
3. **Workspace Directory (`workspaceDir`)**: Root repository directory outside the run directory (e.g. `prompts/personas/*.md`).

### Four Mandatory Checks Per Stage
For each Stage (and each sequential step or parallel wave $t$ in `## Execution`):

1. **Check 1 — Agent/Orchestrator Contract Match (`.agent/agents/<agent>.md` $\leftrightarrow$ `orchestrator/stage<N>.md`)**:
   - **Step 1A: Extract Agent Contract**:
     - **File Inputs**: Every file path the agent instructions read via `view_file` (e.g. `setup.md`, `draft.md`).
     - **Scalar Runtime Parameters**: Thoroughly inspect `.agent/agents/<agent>.md` (especially `# Role Specifics` and `# Tasks`). Identify any runtime parameter needed:
       1. Angle-bracket placeholders `<param>` that do not refer to files (e.g. `<segment_id>`, `<act_id>`, `<shard_id>`, `<topic>`, `<target_duration>`).
       2. Mentions of invocation prompt data (e.g., "from your prompt", "provided query batch", "assigned segment").
       3. Scoped/Subset processing: If an input file contains multi-segment or whole-show data (like `concept.md`) and the agent is scoped to structure, draft, or audit a specific section, selector parameters (e.g. `segment_id`, `act_id`) are **strictly required**.
       Record as: `Agent (Params: <param1>, <param2>)` (or `Agent (Params: none)` if no scalar parameters are needed).
     - **Outputs**: Every output file the agent writes (e.g. `beats.md`).
   - **Step 1B: Extract Orchestrator Declaration**:
     - **File Inputs**: Every file listed in `* **Inputs**:` under `## Agents`.
     - **Scalar Runtime Parameters**: Locate the execution step for the agent under `## Execution`.
       - **Explicit Declaration When Needed**: When an agent requires scalar runtime parameters, the orchestrator step **must** contain an explicit `Parameters:` line (e.g. `- Parameters: segment_id (Act<AA>_Segment<SS>), act_id (Act <AA>)`). If an agent requires no scalar parameters, the `Parameters:` line is optional and omitting it defaults to `(Params: none)`.
       - **Strict In-Prose Prohibition**: Descriptive prose (e.g. "Structures beats for assigned segment Act<AA>_Segment<SS>") does **NOT** count as a parameter declaration. Required parameters must be explicitly listed on a `Parameters:` line.
       - **Strict Agent ID/Path Parsing Prohibition**: Never assume an agent parses its own name (`architect_a01_s01`) or working directory path to discover parameter values.
       Record as: `Orchestrator (Params: <param1>, <param2>)` (or `Orchestrator (Params: none)`).
     - **Outputs**: Expected output(s) declared in the step.
   - **Step 1C: Symmetrical Verification & Strict Discrepancy Failure**:
     - Compare both sides symmetrically:
       - **Inputs**: Agent `Reads [...]` $\leftrightarrow$ Orchestrator `Inputs [...]`
       - **Parameters**: Agent `(Params: ...)` $\leftrightarrow$ Orchestrator `(Params: ...)`
       - **Outputs**: Agent `Writes [...]` $\leftrightarrow$ Orchestrator `Outputs [...]`
     - **Zero Tolerance on Parameter Mismatches**: If `Agent` requires scalar parameters that `Orchestrator` does not explicitly declare on a `Parameters:` line under `## Execution` (or if it attempts to convey them in descriptive prose):
       - **You are strictly forbidden from outputting `- [x]`**.
       - You **MUST** flag it with `- [ ] ⚠️` and output an explicit `Discrepancy:` line detailing the missing parameter(s).
     - If both Agent and Orchestrator have `(Params: none)`, it is a verified match (`- [x]`).
2. **Check 2 — Input Availability at Consumption Step ($t_{\text{used}}$)**:
   - Even if zero declared file inputs exist on disk when an agent starts at $t_{\text{start}}$ (`weave_verify` returns not-yet-created files in `pending_inputs`), every file input required by a specific task of the agent must exist in $\mathcal{F}_{t_{\text{used}}-1}$ (**strictly prior** to the step $t_{\text{used}}$ where that task runs—never produced in the same parallel wave).
   - If an agent pauses (`waiting/...`) while peer agents run and then resumes via `send_message` at step $t_{\text{resume}}$, any input consumed on resume (e.g. `../youtube_sourcers/youtube_sourcer_*/sourced_tracks.md`) must be declared in `* **Inputs**:` and must exist in $\mathcal{F}_{t_{\text{resume}}-1}$ when the agent wakes up and re-runs `weave_verify`.
3. **Check 3 — Provisioner Dynamic Placeholder Resolution**:
   - For every `<placeholder>` in `* **Working Directory**:` or `* **Inputs**:` (e.g. `<AA>`, `<SS>`), verify that the value can be extracted from an existing upstream stage output referenced in `## Agents` (such as `01_setup.md`, `02_concept.md`, or `03_script.md`).
4. **Check 4 — Orchestrator Operations & Output Registration ($\mathcal{F}_t$)**:
   - **No Staging into `agents/<id>/`**: Flag (`- [ ] ⚠️`) any orchestrator step that copies, stitches, or writes files *inside* an agent's working directory (`.../agents/<agent_id>/`). Prefer wildcard inputs (e.g. `../act_*/segment_*/writer/draft.md`) or stage-root/context-root promotion.
   - **Advance $\mathcal{F}_t$**: Register `<agentDir>/<output>` and any valid orchestrator promotion target in the run directory into $\mathcal{F}_t$.
   - **Source Attribution Syntax**: Format orchestrator promotion steps clearly with the source agent directory: `Promotes <output> (<agent_id> agent directory) to <target_output> (run directory)`.

---

## ✅ 3. Mandatory Screen Output Format (Stage-by-Stage Checkboxes)

Always print the verification report to the screen using Markdown checkboxes (`- [x]` for verified, `- [ ] ⚠️` for any mismatch or missing link) with explicit side-by-side contract signatures:

```markdown
### 🔎 Static Pipeline Data-Flow Verification

#### Stage 1: `<stage_slug>` (`orchestrator/<stage_file>.md`)
- [x] **`<agent_1>`** (`.agent/agents/<agent_1>.md`)
  - [x] **Agent/Orchestrator Contract Match**:
    - Agent: Reads `[prompts/personas/*.md]` (Params: `topic`, `duration`), Writes `[setup.md]`
    - Orchestrator: Inputs `[prompts/personas/*.md]` (Params: `topic`, `duration`), Outputs `[setup.md]`
  - [x] **Input Availability ($t=1$)**: `prompts/personas/*.md` available in workspace directory
- [x] **Orchestrator Operations**:
  - [x] Promotes `setup.md` (director agent directory) to `01_setup.md` (run directory)

#### Stage 2: `<stage_slug>` (`orchestrator/<stage_file>.md`)
- [x] **`<agent_2>`** (`.agent/agents/<agent_2>.md`)
  - [x] **Agent/Orchestrator Contract Match**:
    - Agent: Reads `[setup.md, host.md]` at $t=1$, `[sourced_tracks.md]` on wakeup at $t=3$, Writes `[concept.md]`
    - Orchestrator: Inputs `[setup.md: 01_setup.md, host.md: 01_host.md, ../youtube_sourcers/youtube_sourcer_*/sourced_tracks.md]`, Outputs `[concept.md]`
  - [x] **Input Availability**:
    - Turn 1 ($t=1$): `01_setup.md` and `01_host.md` available in run directory; `sourced_tracks.md` in `pending_inputs`
    - Wakeup ($t=3$): `../youtube_sourcers/youtube_sourcer_*/sourced_tracks.md` available in agent directory (produced at $t=2$)
- [x] **Orchestrator Operations**:
  - [x] Promotes `concept.md` (showrunner agent directory) to `02_concept.md` (run directory)

#### Pipeline Summary (`orchestrator.md`)
- [x] All stage outputs and final pipeline outputs are produced, promoted, and gate-aligned.
```

#### Example Failure Report (Parameter / Contract Discrepancy)
```markdown
#### Stage 3: `<stage_slug>` (`orchestrator/<stage_file>.md`)
- [ ] ⚠️ **`<agent>`** (`.agent/agents/<agent>.md`)
  - [ ] ⚠️ **Agent/Orchestrator Contract Match**:
    - Agent: Reads `[concept.md]` (Params: `segment_id`, `act_id`), Writes `[beats.md]`
    - Orchestrator: Inputs `[concept.md: ${RUN_DIR}/02_concept.md]` (Params: none), Outputs `[beats.md]`
    - Discrepancy: Agent expects runtime parameters `(Params: segment_id, act_id)` but Orchestrator has `(Params: none)` and does not explicitly declare them under `## Execution`.
```

> [!IMPORTANT]
> If any check fails (`- [ ] ⚠️`), clearly list the root cause and fix the pipeline or agent markdown files until all checks pass (`- [x]`).
