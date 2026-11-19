# Authoring Guide: Sub-Orchestrators & Parallel Execution

WeaveMAS uses the lean **`stage_orchestrator`** custom subagent (`TypeName: "stage_orchestrator"`, `~8.5K–9.5K` cold-start tokens vs. `18K–27K` for `self`) at **two encapsulation boundaries**:
1. **Per-Stage Sub-Orchestration (Automatic in Multi-Stage Pipelines)**: `weave-core-orchestrator` automatically delegates each stage (`S1..SN`) to its own `stage_orchestrator` (`Mode: stage`) and keeps it idle upon completion (never `kill`), isolating heavy intra-stage loops from the Root Orchestrator's KV-cache while preserving child worker sessions for surgical edits.
2. **Intra-Stage Cluster Sub-Orchestration (Protocol B)**: Declared inside `## Execution` when a stage contains multi-agent units with local revision loops. **Sub-Orchestrators (Encapsulation)** and **Parallel Execution (Concurrency)** combine into a 2x2 matrix:

| | **Sequential Execution** | **Parallel Execution** |
| :--- | :--- | :--- |
| **Direct Agents**<br/>*(No internal review loop)* | **Standard Sequential Agents**<br/>Dispatcher runs agents one by one.<br/>*Ex*: Setup $\rightarrow$ Concept $\rightarrow$ Compile | **Direct Parallel Agents**<br/>Dispatcher runs multiple agents concurrently.<br/>*Ex*: Run 5 architects in parallel. |
| **Cluster Sub-Orchestrators**<br/>*(Encapsulates multi-agent revision loops, e.g. Writer $\rightleftarrows$ Checker)* | **Sequential Sub-Orchestrators**<br/>Dispatcher runs `stage_orchestrator` (`Mode: cluster`) units one by one.<br/>*Ex*: Segment 2 depends on Segment 1, each with an internal Writer $\rightleftarrows$ Checker loop. | **Parallel Sub-Orchestrators**<br/>Dispatcher runs `stage_orchestrator` (`Mode: cluster`) units concurrently.<br/>*Ex*: 10 independent segments, each running `architect` $\rightarrow$ `writer` $\rightleftarrows$ `checker`. |

---

## 📦 1. Ephemeral Cluster Sub-Orchestrator Authoring Rules

Use an intra-stage cluster sub-orchestrator whenever a multi-agent unit has local iterative feedback loops (e.g. Writer $\rightleftarrows$ Fact-Checker) so intermediate drafts and critiques do not bloat the stage or root orchestrator's context:
1. **Omit from `## Agents`**: Declare only concrete leaf agents in `## Agents` (with their upstream peer outputs declared in `* **Inputs**:`, e.g. `../writer/draft.md`, and their outputs declared in `* **Outputs**:`, e.g. `draft.md`). Sub-orchestrators are declared solely in `## Execution`.
2. **Standard Flat Agent Paths**: Leaf agents keep their standard stage directories (`stage<NN>_<slug>/agents/<agent_id>/`). Never invent nested `<unit_id>/` subfolders.
3. **Zero Runtime Boilerplate**: Do not write sub-orchestrator runtime rules (such as `TypeName: "stage_orchestrator"`, zero `weave.md` creation, idle session preservation, or shared root scoping) into stage guides—`weave-core-orchestrator` and `stage_orchestrator` enforce them automatically.

---

## ⚡ 2. Declarative `## Execution` Syntax Patterns

### A. Direct Parallel Agents (Homogeneous Loop or Heterogeneous List)
```markdown
For each segment (`seg_01` to `seg_05`), run `architect_<seg_id>` in parallel:
- Parameters: `seg_id`
- Execution: Generate `beats.md` from `concept.md`.
```
```markdown
Run the following agents in parallel:
* `showrunner_editorial`: Refines narrative tone and pacing constraints.
* `youtube_sourcer`: Researches historical background and clips.
```

### B. Sequential or Parallel Sub-Orchestrators
*(Append `and execute in parallel` for concurrent dispatch, or omit it for sequential dispatch)*:
```markdown
For each `TALK` segment (`a<AA>_s<SS>`), cluster into a sub-orchestrator and execute in parallel:
1. `architect_a<AA>_s<SS>`:
   - Parameters: `act_id` (`<AA>`), `segment_id` (`<SS>`)
   - Execution: Drafts beats (`beats.md`).
2. `writer_a<AA>_s<SS>`:
   - Parameters: `act_id` (`<AA>`), `segment_id` (`<SS>`)
   - Execution: Drafts dialogue (`draft.md`) from `beats.md`.
3. `factchecker_a<AA>_s<SS>`:
   - Parameters: `act_id` (`<AA>`), `segment_id` (`<SS>`)
   - Execution: Audits `draft.md` (`audit.md`). If revision required (max 2 cycles), message `writer_a<AA>_s<SS>` via `send_message`.
```
