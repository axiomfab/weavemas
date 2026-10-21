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
inheritCustomizations: true
inheritMcp: true
skills:
  - weave-core-agent
tools:
  - <role_tool1> # Built-in tools ONLY: view_file, write_to_file, search_web, run_command
---
```

* **`subagent: true`**: Registers the markdown definition as a delegatable subagent for `invoke_subagent`.
* **`model: <flash | pro | inherit>`**: Specifies the execution model tier for the subagent.
  * ✅ **Recommended**: Use `flash` (optimal balance of throughput, speed, and cost) or `pro` (for high-complexity analytical reasoning or synthesis). `inherit` is also supported.
  * ⚠️ **CRITICAL: NEVER USE `flash_lite`**: **Do NOT configure `model: flash_lite`**. `flash_lite` models fail to execute MCP tools (`call_mcp_tool`) correctly and reliably (e.g., schema validation failures, missing required tool calls, or invalid parameter payloads). Because WeaveMAS agents strictly rely on MCP status tools (`status_verify`, `status_update`) provided by `weave-core-agent` for lifecycle management, using `flash_lite` causes silent or noisy pipeline execution failures.
* **`inheritCustomizations: true`**: Required for the subagent to discover and inherit skills from installed plugins (e.g. `weavemas`) and access plugin MCP services.
* **`skills: [weave-core-agent]`**: Natively mounts the `weave-core-agent` skill into the subagent's execution environment.
* **`inheritMcp: true`**: Automatically provides the subagent with the native Antigravity MCP dispatcher (`call_mcp_tool`) for mounted MCP servers (`weavemas_weave`).
* **`tools: [...]`**: Strictly whitelists **built-in core tools** (e.g. `view_file`, `write_to_file`, `search_web`, `run_command`).
  * ⚠️ **CRITICAL RULE**: **NEVER** list `call_mcp_tool` or `weave__*` in the `tools:` array. Listing MCP tools in `tools:` causes executor component registry failures (`tool not found in registry`). MCP tool access is granted solely via `inheritMcp: true`.
  * When shell execution is not required by the role, **strictly omit `run_command`**.
* **Arbitrary Keys, Skills, and Tools**: The frontmatter is fully extensible. You may include an arbitrary number of additional keys (custom configuration parameters, domain flags), supplementary skills under `skills:`, and built-in tools under `tools:` as required by the agent.

### Prompt Binding Statement
Every WeaveMAS agent prompt must include this mandatory binding statement verbatim:

```markdown
Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.
```

* **Placement**: Place this statement near the beginning of the prompt body—ideally right after the agent's title and high-level role summary, before `# Role Specifics`, `# Lifecycle`, or `# Tasks`.

By binding to `weave-core-agent`, the agent automatically inherits:
1. **Directory Sandboxing**: Operating strictly within its assigned working directory (`.`).
2. **Zero Unnecessary Exploration (ZUE)**: No repository scans, directory listings, or root file browsing.
3. **Step 0 Pre-flight Check**: Validating directory and role via `call_mcp_tool` (`status_verify` with `expected_role="<role_slug>"` and `dir="<cwd>"`).
4. **Lifecycle Tracking**: Transitioning states and logging progress via `call_mcp_tool` (`status_update` with `status="in_progress/<step_slug>"`, `progress="..."`, and `dir="<cwd>"`).
5. **Deliverable Verification**: Validating that the final output file exists on disk via `call_mcp_tool` (`status_update` with `status="completed"`, `deliverable="<filename>"`, ...) before marking complete.

---

## 🪜 2. Tasks & Lifecycle Workflow Convention

When an agent's workflow involves multiple logical operations (e.g. ingesting inputs, factual research, drafting prose, auditing), organize the workflow into explicit `# Tasks` and `# Lifecycle` sections:

```markdown
# Role Specifics
* **Deliverable Target**: Save your finalized [deliverable type] to `<filename>`.
* **Input Authorizations (if applicable)**: ...

# Tasks

## Task: 01_<task_slug>
[Specific instructions for task 01]

## Task: 02_<task_slug>
[Specific instructions for task 02]

## Task: 03_<task_slug>
[Specific instructions for task 03]

# Lifecycle
Tasks are executed sequentially:
1. `01_<task_slug>`
2. `02_<task_slug>`
3. `03_<task_slug>`
```

### The `# Tasks` Section
* Group all task definitions under a dedicated `# Tasks` section.
* Declare each task with a subsection heading: `## Task: [slug_name]`.
* **Slug Naming Practice**:
  * **Short & Punchy Slugs**: Keep slug names as short and concise as possible (typically 1–2 words, e.g., `01_personas`, `02_research`, `03_draft`, `04_verify`). Avoid verbose phrases (e.g. use `05_guidelines` instead of `05_draft_showrunner_guidelines`). Short slugs produce clean, readable status strings that render well in UI dashboards without truncation.
  * **Zero-Padded Numbering**: For sequential workflows, prefix slug names with zero-padded numbers (`01_`, `02_`, etc.) to enforce an unambiguous execution sequence and produce sortable status strings (`status: in_progress/01_personas`).
  * Keep slug names strictly lowercase and snake_cased.

### The `# Lifecycle` Section
* Accompany `# Tasks` with an explicit `# Lifecycle` section describing execution flow:
  * **Sequential Workflows**: Explicitly state that tasks are executed sequentially and reiterate all task slug names in an ordered list to reinforce the mandatory execution sequence.
  * **Dynamic / Branching Workflows**: Outline state transitions, branching rules, retry loops, or conditional handoffs (e.g., transitioning between drafting, auditing, and revising).

### Non-Mandatory / Single-Purpose Agents
* The `# Tasks` and `# Lifecycle` sections are **not mandatory**.
* For a single-purpose or atomic agent whose objective is fulfilled in a single unified operation, define the task directly in the initial role overview and simply use `status: "in_progress"`, omitting `# Tasks` and `# Lifecycle` entirely.

### Zero Tool-Calling Boilerplate Mandate
Agent definitions must NEVER instruct the agent on how to call specific MCP tools (e.g. `call_mcp_tool`, JSON payloads, or server names). Keep agent definitions clean, concise, and purely declarative. 

The mounted `weave-core-agent` skill natively defines all mechanics of how to invoke the MCP status tools (`status_verify`, `status_update`). The agent definition simply declares its high-level tasks and required deliverable—the skill handles tool invocation.

---

## 📦 3. Role Specifics & Deliverables

Every agent definition must explicitly declare its deliverable and any read authorizations under a dedicated `# Role Specifics` section:

```markdown
# Role Specifics
* **Deliverable Target**: Save your finalized [deliverable type] to `<filename>`.
* **Input Authorizations (if applicable)**: You are authorized to read [specific external paths, e.g., prompts/personas/*.md or 01_setup.md].
```

## 📁 4. File Organization

* Store agent definitions under `.agent/agents/[<stage>/]<role>.md`.
* For multi-stage pipelines, group agents by stage folder (e.g. `.agent/agents/stage1_setup/agent_director.md`, `.agent/agents/stage3_writing/agent_writer.md`).
* For flat or single-stage workflows, place roles directly in `.agent/agents/<role>.md`.

## ✍️ 5. Concrete Role Templates (Examples)

### Example A: Broadcast Script Writer (`agent_writer.md`)
```markdown
---
name: stage3_writer
description: agent that writes spoken broadcast prose for assigned radio segments
model: flash
subagent: true
inheritCustomizations: true
inheritMcp: true
skills:
  - weave-core-agent
tools:
  - view_file
  - write_to_file
---

# Writer Agent

You write broadcast-ready radio prose for assigned segments within your dedicated working directory.

Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.

# Role Specifics
* **Deliverable Target**: Save your completed prose to `draft.md`.

# Tasks

## Task: 01_beats
Review the assigned scene context, beat outlines, tone tags, and music transitions provided in your prompt.

## Task: 02_draft
Write continuous spoken broadcast prose adhering strictly to the selected persona's cadence, vocabulary, and WPM rate.

## Task: 03_refine
Check the target segment duration and ensure word count aligns with the target. Save your deliverable to `draft.md`.

# Lifecycle
Tasks are executed sequentially:
1. `01_beats`
2. `02_draft`
3. `03_refine`
```

---

### Example B: Fact Checker / Auditor Agent (`agent_factchecker.md`)
```markdown
---
name: stage3_factchecker
description: agent that audits drafted segment prose against historical records
model: flash
subagent: true
inheritCustomizations: true
inheritMcp: true
skills:
  - weave-core-agent
tools:
  - view_file
  - search_web
  - write_to_file
---

# Fact Checker Agent

You audit drafted segment prose against historical records within your dedicated working directory.

Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.

# Role Specifics
* **Deliverable Target**: Save your audit findings to `audit_report.md`.

# Tasks

## Task: 01_extract
Read the drafted segment and isolate all factual assertions (dates, locations, band lineups, song release years).

## Task: 02_verify
Run targeted factual web searches for each extracted claim. Strictly exclude tonal or stylistic queries.

## Task: 03_report
Compile your findings into `audit_report.md` detailing verified claims, flagged discrepancies, and recommended corrections.

# Lifecycle
Tasks are executed sequentially:
1. `01_extract`
2. `02_verify`
3. `03_report`
```

---

### Example C: Director / Setup Agent (`agent_director.md`)
```markdown
---
name: stage1_director
description: agent that selects a writer persona and defines showrunner guidelines
model: flash
subagent: true
inheritCustomizations: true
inheritMcp: true
skills:
  - weave-core-agent
tools:
  - search_web
  - write_to_file
  - run_command
---

# Director Agent

You provide high-level creative direction and establish the core showrunner guidelines.

Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.

# Role Specifics
* **Deliverable Target**: Save your finalized setup document to `setup.md`.
* **Persona Library Ingestion**: You are authorized to inspect writer persona definitions from `prompts/personas/*.md` in a single batch read.

# Tasks

## Task: 01_personas
Batch inspect all personas in `prompts/personas/*.md` in a single command.

## Task: 02_select_persona
Evaluate tone, genre affinity, and WPM rate against the show topic to select the best persona.

## Task: 03_research
Run 3-5 distinct factual web searches to compile verified historical dates, milestones, and personnel.

## Task: 04_archetype
Select the narrative structure (e.g., Linear, Circular, Thematic, Cold Open, Parallel) supporting the topic.

## Task: 05_guidelines
Synthesize persona selection, structural archetype, and showrunner guidelines into `setup.md`.

# Lifecycle
Tasks are executed sequentially:
1. `01_personas`
2. `02_select_persona`
3. `03_research`
4. `04_archetype`
5. `05_guidelines`
```
