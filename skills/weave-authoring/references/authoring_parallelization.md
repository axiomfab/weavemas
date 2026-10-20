# Authoring Guide: Sub-Orchestrators & Parallel Execution

This guide defines the architectural patterns and declarative authoring rules for **encapsulating multi-agent sub-workflows** and **executing workflows in parallel** in WeaveMAS.

---

## 🎯 1. Architectural Philosophy: Two Independent Concepts

In WeaveMAS, **Sub-Orchestrators** and **Parallel Execution** are two completely decoupled, orthogonal concepts:

1. **Sub-Orchestrators (Encapsulation)**: A structural design pattern to encapsulate a multi-agent sub-workflow (e.g. `architect` $\rightarrow$ `writer` $\rightleftarrows$ `factchecker`) inside an ephemeral coordinator.
   * *Purpose*: Protects the root orchestrator's context window by isolating internal review/revision loops and intermediate drafts.
   * *Execution*: Sub-orchestrators can be executed **sequentially** OR **in parallel**.
2. **Parallel Execution (Concurrency Modifier)**: An execution modifier that runs multiple units of work simultaneously.
   * *Application*: Parallel execution can be applied directly to **agents** OR to **sub-orchestrators**.

---

## 🏛️ 2. The Orthogonal Architecture Matrix

| | **Sequential Execution** | **Parallel Execution** |
| :--- | :--- | :--- |
| **Direct Agents** | **Standard Sequential Agents**<br/>Root coordinates agents one by one.<br/>*Example*: Setup $\rightarrow$ Master Concept $\rightarrow$ Compilation | **Direct Parallel Agents**<br/>Root runs agents concurrently.<br/>*Example*: Run all 5 architects in parallel; or run sourcer, stylist, and playlist curator in parallel. |
| **Sub-Orchestrators** | **Sequential Sub-Orchestrators**<br/>Root runs sub-orchestrators one by one.<br/>*Example*: Segment 2 depends on Segment 1, but each segment has an internal Writer ⇆ Fact-Checker loop. | **Parallel Sub-Orchestrators**<br/>Root runs sub-orchestrators concurrently.<br/>*Example*: 10 independent talk segments, each running its local architect $\rightarrow$ writer $\rightleftarrows$ checker trio in parallel. |

---

## 📦 3. Concept 1: Sub-Orchestrators (Encapsulation)

A Sub-Orchestrator is an ephemeral coordinator that manages a localized team of agents.

### Why Use a Sub-Orchestrator?
* **Local Revision Encapsulation**: When agents have iterative critique loops (e.g., Writer ⇆ Fact-Checker), having the root orchestrator mediate every draft and critique floods the root context window with intermediate noise. A sub-orchestrator handles these feedback cycles locally via `send_message`.
* **Clean Root Context**: The root orchestrator only sees the final verified handoff, keeping its context lean for subsequent stages.

### The Ephemeral Sub-Orchestrator Protocol
Sub-orchestrators follow strict execution rules:
1. **Never Listed in `## Agents`**: The `## Agents` section of a stage guideline is strictly reserved for concrete leaf agents with physical directories and `status.md` files. Sub-orchestrators are declared solely in `## Execution` (e.g. `For each <item>, cluster into a sub-orchestrator...`).
2. **Shared Context Root**: Operates directly in the shared context root (`output/<context_slug>/`).
3. **Zero `status.md` Creation (Master State Integrity & Clean UI)**:
   * Sub-orchestrators **MUST NEVER create a `status.md` for themselves and MUST NEVER touch root `status.md`**.
   * *Why*: The root `status.md` belongs exclusively to the Root Orchestrator. Because the Sub-Orchestrator writes no `status.md`, the WeaveMAS sidecar UI dashboard remains 100% focused on actual content producers, with zero redundant "ghost manager" cards.
4. **Standard Agent Paths**:
   * Agents reside in their standard stage directories (e.g. `stage03_writing/agents/architect_a01_s01/`).
   * **DO NOT invent artificial nested `<unit_id>/` subfolders on disk**. The sub-orchestrator is simply parameterized via its prompt with the specific agent slugs it supervises.
5. **Local Revision Loops**: Downstream critiques (e.g. from Fact-Checker) are sent directly to the upstream agent (e.g. Writer) via `send_message` up to an explicit hard cap (max 2 cycles).
6. **Declarative Authoring Mandate**: Do NOT duplicate these runtime rules into individual stage markdown files. They are automatically enforced by the `weave-core-orchestrator` execution skill. Keep stage files purely declarative.

### Execution Modes for Sub-Orchestrators
* **Sequential**: When unit $i+1$ requires unit $i$'s output, but each unit still requires encapsulated review loops:
  ```markdown
  For each `TALK` segment (`a<AA>_s<SS>`), cluster into a sub-orchestrator:
  1. `architect_a<AA>_s<SS>`: ...
  2. `writer_a<AA>_s<SS>`: ...
  3. `factchecker_a<AA>_s<SS>`: ...
  ```
* **Parallel**: When units are independent and can run concurrently:
  ```markdown
  For each `TALK` segment (`a<AA>_s<SS>`), cluster into a sub-orchestrator and execute in parallel:
  1. `architect_a<AA>_s<SS>`: ...
  2. `writer_a<AA>_s<SS>`: ...
  3. `factchecker_a<AA>_s<SS>`: ...
  ```

---

## ⚡ 4. Concept 2: Parallel Execution (Concurrency Modifier)

Parallel execution can be applied to either direct agents or to clustered sub-orchestrators.

### Form A: Parallel Execution Applied to Direct Agents
The root orchestrator dispatches and manages multiple agents concurrently in a single turn.

1. **Parameterized Loop (Homogeneous Roles)**:
   ```markdown
   For each segment (`seg_01` to `seg_05`), run `architect_<seg_id>` in parallel:
   - Inputs: Staged `02_concept.md`, segment parameters.
   - Deliverable: Ingest verified `beats.md`.
   ```
2. **Explicit List (Heterogeneous Roles Running Concurrently)**:
   ```markdown
   Run the following agents in parallel:
   * `showrunner_editorial`: Refines narrative tone and pacing constraints.
   * `youtube_sourcer`: Researches historical background and clips.
   * `playlist_curator`: Selects matching musical transitions.
   ```

* **Best For**: One-shot tasks, synchronized role waves (where root inspects all outputs together before moving to the next role), and workflows with zero intermediary manager overhead.

---

### Form B: Parallel Execution Applied to Sub-Orchestrators
The root orchestrator dispatches and runs multiple sub-orchestrators concurrently.

1. **Parameterized Loop (Homogeneous Units)**:
   ```markdown
   For each `TALK` segment (`a<AA>_s<SS>`), cluster into a sub-orchestrator and execute in parallel:
   1. `architect_a<AA>_s<SS>`: Drafts beats.
   2. `writer_a<AA>_s<SS>`: Drafts spoken dialogue.
   3. `factchecker_a<AA>_s<SS>`: Audits and messages writer for revisions if needed.
   ```
2. **Explicit Heterogeneous Clusters (Different Tracks Running Concurrently)**:
   ```markdown
   Cluster each of the following tracks into a sub-orchestrator and execute in parallel:

   * **Story Track**:
     1. `story_architect`: Outlines narrative beats.
     2. `script_writer`: Drafts dialogue.
     3. `fact_checker`: Audits claims and messages `script_writer` for corrections if needed.

   * **Music Track**:
     1. `music_selector`: Curates songs based on tempo.
     2. `audio_balancer`: Verifies fade durations.

   * **Sponsor Track**:
     1. `promo_copywriter`: Drafts sponsor spot.
     2. `compliance_auditor`: Audits legal disclaimer.
   ```

* **Best For**: Independent units or tracks where each track involves a multi-agent team with localized feedback loops.

---

## ⚖️ 5. Summary Decision Guide

1. **Do agents need iterative feedback loops (e.g. Writer ⇆ Checker)?**
   * **Yes**: Cluster them into a **Sub-Orchestrator** to encapsulate the revisions.
   * **No**: Use **Direct Agents**.
2. **Can the units of work run concurrently?**
   * **Yes**: Apply **Parallel Execution** (to the agents or to the sub-orchestrators).
   * **No**: Keep execution **Sequential**.
