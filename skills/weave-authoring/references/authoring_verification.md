# Authoring Guide: Static Pipeline Data-Flow Verification

Run this static analysis **purely on the authored pipeline files** (`orchestrator.md`, `orchestrator/*.md`, `.agent/agents/*.md`, and static workspace files)—before any pipeline execution—whenever creating or revising a WeaveMAS pipeline.

---

## 🔍 1. Core Concepts: File Inputs vs. Runtime Parameters

Always distinguish between physical **File Inputs** and scalar **Runtime Parameters**:
* **File Inputs (`* **Inputs**:` in `## Agents`)**: Physical files on disk (e.g. `01_setup.md`, `../writer/draft.md`, `../act_*/segment_*/writer/draft.md`, `prompts/personas/<host_id>.md`) recorded in `weave.md` `inputs`, resolved by `weave_verify`, and read via `view_file`.
* **Runtime Parameters (`## Execution` / `invoke_subagent`)**: Scalar values (e.g. `topic`, `target_duration`, `show_title`, `host_wpm`, `segment_id`) passed in the `Runtime Parameters:` block of the dispatch prompt. Do **not** flag scalar parameters as missing file inputs.

---

## 🧭 2. Unified Symbolic Execution Model (The Available File Set $\mathcal{F}$)

Trace the **Pipeline Data-Flow Graph (DFG)** from start to finish by maintaining the set of available files $\mathcal{F}$ across three root tiers:
1. **Tier 1 — Agent CWD (`agentDir`)**: `<stage_slug>/agents/<agent_id>/` (or `agents/<agent_id>/` in stageless pipelines). Paths starting with `./` or `../` resolve **exclusively** against `agentDir`.
2. **Tier 2 — Output Context Directory (`output/<context_slug>/`)**: Stage-promoted outputs and run-root files (e.g. `01_setup.md`, `02_concept.md`).
3. **Tier 3 — Project / Workspace Root (`<workspace_root>/`)**: Static repository files outside `output/` (e.g. `prompts/personas/*.md`).

### Four Mandatory Checks Per Stage
For each Stage (and each sequential step or parallel wave $t$ in `## Execution`):

1. **Check 1 — Explicit Side-by-Side Contract Diff (`.agent/agents/<agent>.md` $\leftrightarrow$ `orchestrator/stage<N>.md`)**:
   - Extract the **Agent `.md` Contract**: every **File Input** (not scalar parameter) the agent prompt instructs to read, and every **Output** file/pattern it writes.
   - Extract the **Orchestrator Declaration**: every file in `* **Inputs**:` (under `## Agents`), any mid-stage file referenced in `## Execution`, and the expected output(s).
   - Compare them side-by-side. Flag (`- [ ] ⚠️`) any file read by the agent prompt or passed in `## Execution` (such as `sourced_tracks.md`, `beats.md`, `draft.md`) that is missing from `* **Inputs**:` or from `.agent/agents/<agent>.md`.
2. **Check 2 — 3-Tier Input Availability at Consumption Step ($t_{\text{used}}$)**:
   - Even if zero declared file inputs exist on disk when an agent starts at $t_{\text{start}}$ (`weave_verify` returns not-yet-created files in `pending_inputs`), every file input required by a specific task of the agent must exist in $\mathcal{F}_{t_{\text{used}}-1}$ (**strictly prior** to the step $t_{\text{used}}$ where that task runs—never produced in the same parallel wave).
   - If an agent pauses (`waiting/...`) while peer agents run and then resumes via `send_message` at step $t_{\text{resume}}$, any input consumed on resume (e.g. `../youtube_sourcers/youtube_sourcer_*/sourced_tracks.md`) must be declared in `* **Inputs**:` and must exist in $\mathcal{F}_{t_{\text{resume}}-1}$ when the agent wakes up and re-runs `weave_verify`.
3. **Check 3 — Provisioner Dynamic Placeholder Resolution**:
   - For every `<placeholder>` in `* **Working Directory**:` or `* **Inputs**:` (e.g. `<AA>`, `<SS>`, `<host_id>`), verify that the value can be extracted from an existing upstream stage output referenced in `## Agents` (such as `01_setup.md`, `02_concept.md`, or `03_script.md`).
4. **Check 4 — Zero File-Staging into Agent Directories & Post-Step Output Registration ($\mathcal{F}_t$)**:
   - **No Staging into `agents/<id>/`**: Flag (`- [ ] ⚠️`) any orchestrator step that copies, stitches, or writes files *inside* an agent's working directory (`.../agents/<agent_id>/`). Prefer wildcard inputs (e.g. `../act_*/segment_*/writer/draft.md`) or stage-root/context-root promotion.
   - **Advance $\mathcal{F}_t$**: Register `<agentDir>/<output>` (and any valid Orchestrator Promotion / Ingestion target in `output/<context_slug>/`) into $\mathcal{F}_t$.
   - **Fully Qualified Paths Mandate**: Every agent output and orchestrator promotion source MUST be specified using its full context-relative path (`<stage_slug>/agents/<agent_id>/<output>`). Truncated or bare filenames (e.g. `concept.md -> 02_concept.md`) are strictly forbidden.

---

## ✅ 3. Mandatory Screen Output Format (Stage-by-Stage Checkboxes)

Always print the verification report to the screen using Markdown checkboxes (`- [x]` for verified, `- [ ] ⚠️` for any mismatch or missing link) with explicit side-by-side contract signatures:

```markdown
### 🔎 Static Pipeline Data-Flow Verification

#### Stage 1: `<stage_slug>` (`orchestrator/<stage_file>.md`)
- [x] **`<agent_1>`** (`.agent/agents/<agent_1>.md`)
  - [x] **Contract Diff**:
    - Agent `.md`: Reads `[prompts/personas/*.md]` (Params: `topic`, `duration`) $\rightarrow$ Writes `[setup.md]`
    - Orchestrator: Inputs `[prompts/personas/*.md]` $\rightarrow$ Output `[setup.md]`
  - [x] **3-Tier Availability ($t=1$)**: `prompts/personas/*.md` resolves in Tier 3 (Workspace Root)
  - [x] **Produces**: `stage01_setup/agents/director/setup.md`
- [x] **Orchestrator File Operation (Stage 1 Ingestion)**:
  - [x] Promotes `stage01_setup/agents/director/setup.md` $\rightarrow$ `01_setup.md` (Tier 2: `output/<context_slug>/`)

#### Stage 2: `<stage_slug>` (`orchestrator/<stage_file>.md`)
- [x] **`<agent_2>`** (`.agent/agents/<agent_2>.md`)
  - [x] **Contract Diff**:
    - Agent `.md`: Reads `[01_setup.md]` at $t=1$, `[sourced_tracks.md]` on wakeup at $t=3$ (Params: `duration`, `host_wpm`) $\rightarrow$ Writes `[track_queries.md, concept.md]`
    - Orchestrator: Inputs `[01_setup.md, ../youtube_sourcers/youtube_sourcer_*/sourced_tracks.md]` $\rightarrow$ Outputs `[track_queries.md, concept.md]`
  - [x] **3-Tier Availability**:
    - Turn 1 ($t=1$): `01_setup.md` available in Tier 2 (`output/<context_slug>/`); `sourced_tracks.md` in `pending_inputs`
    - Wakeup ($t=3$): `../youtube_sourcers/youtube_sourcer_*/sourced_tracks.md` available in Tier 1 (produced at $t=2$)
  - [x] **Produces**: `stage02_concept/agents/showrunner/concept.md`
- [x] **Orchestrator File Operation (Stage 2 Ingestion)**:
  - [x] Promotes `stage02_concept/agents/showrunner/concept.md` $\rightarrow$ `02_concept.md` (Tier 2: `output/<context_slug>/`)

#### Pipeline Summary (`orchestrator.md`)
- [x] All stage outputs and final pipeline outputs are produced, promoted, and gate-aligned.
```

> [!IMPORTANT]
> If any check fails (`- [ ] ⚠️`), clearly list the root cause and fix the pipeline or agent markdown files until all checks pass (`- [x]`).
