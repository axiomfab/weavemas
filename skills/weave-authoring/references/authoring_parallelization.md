# Authoring Guide: Sub-Orchestrators & Parallel Execution

**Sub-Orchestrators (Encapsulation)** and **Parallel Execution (Concurrency)** are orthogonal concepts that combine into a 2x2 matrix:

| | **Sequential Execution** | **Parallel Execution** |
| :--- | :--- | :--- |
| **Direct Agents**<br/>*(No internal review loop)* | **Standard Sequential Agents**<br/>Root runs agents one by one.<br/>*Ex*: Setup $\rightarrow$ Concept $\rightarrow$ Compile | **Direct Parallel Agents**<br/>Root dispatches multiple agents concurrently.<br/>*Ex*: Run 5 architects in parallel. |
| **Sub-Orchestrators**<br/>*(Encapsulates multi-agent revision loops, e.g. Writer $\rightleftarrows$ Checker)* | **Sequential Sub-Orchestrators**<br/>Root runs sub-orchestrators one by one.<br/>*Ex*: Segment 2 depends on Segment 1, each with an internal Writer $\rightleftarrows$ Checker loop. | **Parallel Sub-Orchestrators**<br/>Root runs sub-orchestrators concurrently.<br/>*Ex*: 10 independent segments, each running `architect` $\rightarrow$ `writer` $\rightleftarrows$ `checker`. |

---

## 📦 1. Ephemeral Sub-Orchestrator Authoring Rules

Use a sub-orchestrator whenever a multi-agent unit has local iterative feedback loops (e.g. Writer $\rightleftarrows$ Fact-Checker) so intermediate drafts and critiques do not bloat the root orchestrator's context:
1. **Omit from `## Agents`**: Declare only concrete leaf agents in `## Agents` (with their upstream peer deliverables declared in `* **Inputs**:`, e.g. `../writer/draft.md`). Sub-orchestrators are declared solely in `## Execution`.
2. **Standard Flat Agent Paths**: Leaf agents keep their standard stage directories (`stage<NN>_<slug>/agents/<agent_id>/`). Never invent nested `<unit_id>/` subfolders.
3. **Zero Runtime Boilerplate**: Do not write sub-orchestrator runtime rules (such as zero `weave.md` creation or shared root scoping) into stage guides—`orchestrator-agent-execution` enforces them automatically.

---

## ⚡ 2. Declarative `## Execution` Syntax Patterns

### A. Direct Parallel Agents (Homogeneous Loop or Heterogeneous List)
```markdown
For each segment (`seg_01` to `seg_05`), run `architect_<seg_id>` in parallel:
- Inputs: `02_concept.md`, segment parameters.
- Deliverable: Verify `beats.md`.
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
1. `architect_a<AA>_s<SS>`: Drafts beats (`beats.md`).
2. `writer_a<AA>_s<SS>`: Drafts dialogue (`draft.md`) from `beats.md`.
3. `factchecker_a<AA>_s<SS>`: Audits `draft.md` (`audit.md`). If revision required (max 2 cycles), message `writer_a<AA>_s<SS>` via `send_message`.
```
