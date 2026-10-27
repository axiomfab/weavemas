# Authoring Guide: WeaveMAS Agents

Store all agent definitions **flat** at `.agent/agents/<agent_name>.md` (never in nested stage subdirectories, as Antigravity only discovers native custom subagents directly inside `.agent/agents/*.md`). For multi-stage pipelines, prefix `<agent_name>` with the stage identifier (e.g. `.agent/agents/stage1_director.md` with `name: stage1_director`). The filename stem MUST match the `name:` field in YAML frontmatter.

---

## 🎯 1. Standard Frontmatter & Binding Contract

```yaml
---
name: <agent_name>
description: <agent_description>
model: <flash | pro | inherit> # NEVER use flash_lite
subagent: true
inheritCustomizations: true
inheritMcp: true
skills:
  - weave-core-agent
tools:
  - view_file
  - <builtin_tool> # Built-in tools ONLY: view_file, write_to_file, search_web, run_command
---
```

* **`tools:` Constraint**: Always include `view_file` (required to load the `weave-core-agent` skill and read declared `inputs`), plus only the additional built-in tools required by the role (omit `run_command` unless shell execution is needed). **NEVER** list `call_mcp_tool` or `weave__*` in `tools:` (`inheritMcp: true` grants MCP access automatically).
* **Mandatory Prompt Binding Statement**: Place this exact line near the top of the prompt body (right after the agent title and 1-sentence role summary):
  ```markdown
  Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.
  ```
* **Zero Tool Boilerplate**: Never write `call_mcp_tool` instructions or JSON schemas in agent definitions; `weave-core-agent` handles all status tool calls automatically.

---

## 🪜 2. Role Specifics, Inputs, Tasks & Lifecycle Structure

1. **`# Role Specifics`**:
   - Always declare `* **Deliverable Target**: Save your finalized <type> to <filename_or_list>.` (supports a single filename, a list of files such as `article.md` and `illustration.png`, or wildcard patterns like `segment_*.md`).
   - **Flexible Input References**: Agents do not require a rigid `# Inputs` section. They may refer to inputs naturally by logical name (e.g. "the **Approved Article**", when bound as `- Approved Article: 01_editorial_approved.md` in the orchestrator) or by filename/description (`weave-core-agent`'s `weave_verify` returns the resolved absolute paths for all declared `inputs` on Turn 1).
   - Never mention `weave.md`, `weave_verify`, or "staged copies" in `# Role Specifics`.
2. **Multi-Task Agents (`# Tasks` & `# Lifecycle`)**:
   - Declare each step as `## Task: <NN>_<short_slug>` (lowercase snake_case, zero-padded `01_`, `02_`, 1–2 words max so UI badges do not truncate).
   - List the execution sequence or branching rules under `# Lifecycle`.
3. **Single-Purpose Agents**: Omit `# Tasks` and `# Lifecycle` when the role performs a single atomic action.

---

## ✍️ 3. Templates

### Example A: Multi-Task Agent (`.agent/agents/stage1_writer.md`)
```markdown
---
name: stage1_writer
description: Writes age-calibrated articles for assigned topics
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

You write age-calibrated articles within your dedicated working directory.

Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.

# Role Specifics
* **Deliverable Target**: Save your completed prose to `draft.md`.

# Tasks

## Task: 01_concepts
Identify core concepts and calibrate vocabulary for the target age provided in your prompt.

## Task: 02_draft
Write the article adhering to the target word count and save to `draft.md`.

# Lifecycle
Tasks are executed sequentially:
1. `01_concepts`
2. `02_draft`
```

### Example B: Single-Purpose Agent Reading `inputs` (`.agent/agents/stage2_illustrator.md`)
```markdown
---
name: stage2_illustrator
description: Generates an illustration from the markdown image placeholder
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

# Illustrator Agent

You extract the illustration prompt from the **Approved Article** input, generate `illustration.png`, and save the final article to `article.md`.

Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.

# Role Specifics
* **Deliverable Target**: Save `article.md` and `illustration.png` (outputs: `["article.md", "illustration.png"]`).
```
