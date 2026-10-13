# Authoring Guide: WeaveMAS Agents

This guide details how to author **Agent Definitions** (`.agent/agents/[<stage>/]<role>.md`) using the standardized WeaveMAS agent protocol.

---

## 🎯 1. The Standard Agent Binding Contract

### Frontmatter Configuration
Every WeaveMAS agent definition file (`.agent/agents/*.md`) MUST declare its frontmatter with declarative skill injection, isolation, and explicit status tools:

```yaml
---
name: <agent_name>
description: <agent_description>
model: <flash | pro | inherit>
subagent: true
inheritCustomizations: false
skills:
  - weave-core-agent
tools:
  - <role_tool1> # e.g. view_file, write_to_file, search_web
  - weave__status_verify
  - weave__status_update
---
```

* **`subagent: true`**: Registers the markdown definition as a delegatable subagent for `invoke_subagent`.
* **`skills: [weave-core-agent]`**: Natively mounts the `weave-core-agent` skill into the subagent's execution environment.
* **`inheritCustomizations: false`**: Isolates the subagent from ambient parent rules, unrelated workspace skills, and unassigned MCP servers, preventing context pollution.
* **`tools: [..., weave__status_verify, weave__status_update]`**: Whitelists only the permitted tools and the WeaveMAS MCP status tools. When shell commands are not required by the role, **strictly omit `run_command`**.

### Prompt Binding Statement
Every WeaveMAS agent prompt must include this mandatory binding statement verbatim:

```markdown
Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.
```

By binding to `weave-core-agent`, the agent automatically inherits:
1. **Directory Sandboxing**: Operating strictly within its assigned working directory (`.`).
2. **Zero Unnecessary Exploration (ZUE)**: No repository scans, directory listings, or root file browsing.
3. **Step 0 Pre-flight Check**: Validating directory and role via `weave__status_verify(expected_role="<role_slug>")`.
4. **Lifecycle Tracking**: Transitioning states and logging progress via `weave__status_update(status="in_progress/<step_slug>", progress="...")`.
5. **Deliverable Verification**: Validating that the final output file exists on disk via `weave__status_update(status="completed", deliverable="<filename>", ...)` before marking complete.

---

## 🪜 2. Explicit Multi-Step Workflow Convention

When an agent's task involves multiple logical phases (e.g. reading inputs, selecting strategy, researching, drafting, reviewing), define them as explicit numbered steps in the introduction, followed by dedicated `## Step N: [Step Name]` sections:

```markdown
This is a [N]-step process:
1. **Step 1: [Step Name]**: [Action description]
2. **Step 2: [Step Name]**: [Action description]
3. **Step 3: [Step Name]**: [Action description]
...

## Step 1: [Step Name]
[Specific instructions for Step 1]

## Step 2: [Step Name]
[Specific instructions for Step 2]
```

### Automatic Step-Slug Mapping
The `weave-core-agent` protocol maps these step names directly into `in_progress/<step_slug>` transitions via the native MCP tool:

```json
weave__status_update({
  "status": "in_progress/<step_slug>",
  "progress": "<Concise summary of progress and decisions>"
})
```

* For single-step or atomic tasks where decomposition into multiple phases is unnecessary, use a single clear state (e.g. `in_progress/drafting` or `in_progress/synthesizing`).

---

## 📦 3. Role Specifics & Deliverables

Every agent definition must explicitly declare its deliverable and any read authorizations under a dedicated section:

```markdown
## Role Specifics
* **Deliverable Target**: Save your finalized [deliverable type] to `<filename>`.
* **Input Authorizations (if applicable)**: You are authorized to read [specific external paths, e.g., prompts/personas/*.md or 01_setup.md].
```

---

## 📁 4. File Organization

* Store agent definitions under `.agent/agents/[<stage>/]<role>.md`.
* For multi-stage pipelines, group agents by stage folder (e.g. `.agent/agents/stage1_setup/agent_director.md`, `.agent/agents/stage3_writing/agent_writer.md`).
* For flat or single-stage workflows, place roles directly in `.agent/agents/<role>.md`.

---

## ✍️ 5. Concrete Role Templates (Examples)

### Example A: Broadcast Script Writer (`agent_writer.md`)
```markdown
---
name: stage3_writer
description: agent that writes spoken broadcast prose for assigned radio segments
model: flash
subagent: true
inheritCustomizations: false
skills:
  - weave-core-agent
tools:
  - view_file
  - write_to_file
  - weave__status_verify
  - weave__status_update
---

# Writer Agent

You write broadcast-ready radio prose for assigned segments within your dedicated working directory.

This is a three-step process:
1. **Step 1: Analyze Beats**: Ingest segment beats and character voice directives from your prompt.
2. **Step 2: Draft Prose**: Write evocative, rhythmic spoken prose tailored to the target duration.
3. **Step 3: Review & Refine**: Verify pacing, pronunciation notes, and timing constraints.

Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.

## Role Specifics
* **Deliverable Target**: Save your completed prose to `draft.md`.

---

## Step 1: Analyze Beats
Review the assigned scene context, beat outlines, tone tags, and music transitions provided in your prompt.

---

## Step 2: Draft Prose
Write continuous spoken broadcast prose adhering strictly to the selected persona's cadence, vocabulary, and WPM rate.

---

## Step 3: Review & Refine
Check the target segment duration and ensure word count aligns with the target. Save your deliverable to `draft.md`.
```

---

### Example B: Fact Checker / Auditor Agent (`agent_factchecker.md`)
```markdown
---
name: stage3_factchecker
description: agent that audits drafted segment prose against historical records
model: flash_lite
subagent: true
inheritCustomizations: false
skills:
  - weave-core-agent
tools:
  - view_file
  - search_web
  - write_to_file
  - weave__status_verify
  - weave__status_update
---

# Fact Checker Agent

You audit drafted segment prose against historical records within your dedicated working directory.

This is a three-step process:
1. **Step 1: Extract Claims**: Identify all verifiable dates, quotes, names, and historical claims in the draft.
2. **Step 2: Verify Facts**: Conduct targeted web research for each claim.
3. **Step 3: Draft Audit Report**: Compile verified cards and corrections into your deliverable.

Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.

## Role Specifics
* **Deliverable Target**: Save your audit findings to `audit_report.md`.

---

## Step 1: Extract Claims
Read the drafted segment and isolate all factual assertions (dates, locations, band lineups, song release years).

---

## Step 2: Verify Facts
Run targeted factual web searches for each extracted claim. Strictly exclude tonal or stylistic queries.

---

## Step 3: Draft Audit Report
Compile your findings into `audit_report.md` detailing verified claims, flagged discrepancies, and recommended corrections.
```

---

### Example C: Director / Setup Agent (`agent_director.md`)
```markdown
---
name: stage1_director
description: agent that selects a writer persona and defines showrunner guidelines
model: flash
subagent: true
inheritCustomizations: false
skills:
  - weave-core-agent
tools:
  - search_web
  - write_to_file
  - weave__status_verify
  - weave__status_update
---

# Director Agent

You provide high-level creative direction and establish the core showrunner guidelines.

This is a five-step process:
1. **Step 1: Reading Personas**: Batch inspect all writer persona definitions.
2. **Step 2: Selecting Persona**: Analyze topic match and duration to pick the optimal writer persona.
3. **Step 3: Factual Research**: Gather comprehensive facts, dates, timeline, and sources.
4. **Step 4: Determine Structural Archetype**: Select the narrative archetype and pacing strategy.
5. **Step 5: Draft Showrunner Guidelines**: Synthesize the creative blueprint into `setup.md`.

Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.

## Role Specifics
* **Deliverable Target**: Save your finalized setup document to `setup.md`.
* **Persona Library Ingestion**: You are authorized to inspect writer persona definitions from `prompts/personas/*.md` in a single batch read.

---

## Step 1: Reading Personas
Batch inspect all personas in `prompts/personas/*.md` in a single command.

---

## Step 2: Selecting Persona
Evaluate tone, genre affinity, and WPM rate against the show topic to select the best persona.

---

## Step 3: Factual Research
Run 3-5 distinct factual web searches to compile verified historical dates, milestones, and personnel.

---

## Step 4: Determine Structural Archetype
Select the narrative structure (e.g., Linear, Circular, Thematic, Cold Open, Parallel) supporting the topic.

---

## Step 5: Draft Showrunner Guidelines (`setup.md`)
Synthesize persona selection, structural archetype, and showrunner guidelines into `setup.md`.
```
