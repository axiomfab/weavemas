# WeaveMAS

**WeaveMAS** is a declarative orchestration framework and Model Context Protocol (MCP) runtime for rapid prototyping of structured multi-agent pipelines in **Google Antigravity (`agy`)** and other MCP-capable agent harnesses.

## Why WeaveMAS?

Prompting a single LLM in one pass works well for short, self-contained tasks, but breaks down on complex, multi-part digital assets as competing constraints dilute context, subtle factual errors slip past self-critique, and monolithic tool/model assignments waste compute. Existing multi-agent approaches pull in two directions:

- **Code-centric state graphs** (e.g., LangGraph, AutoGen, MetaGPT) provide static typing and state checkpointing, but require writing Python or TypeScript glue code, maintaining package environments, and pre-coding skip guards before interactive revisions can avoid full downstream replay.
- **Open-ended agent harnesses and iterative single-agent ("Ralph") loops** avoid orchestration code, yet drift across folder layouts from run to run, lose constraints across conversational summaries, share correlated blind spots when one persona grades its own work, wander across unrestricted workspace directories, and expose poor visibility into intermediate progress.

WeaveMAS brings repeatable pipeline structure to agent harnesses without orchestration code:

- **Declarative Markdown Specifications**: Pipelines are written as readable Markdown agent definitions (`.agent/agents/*.md`) and stage guides (`orchestrator.md`, `orchestrator/*.md`) -- authored by hand or synthesized in one shot from a short natural-language brief via `weave-authoring`.
- **Sandboxed File & Parameter Port Contracts**: Each worker executes inside an isolated Current Working Directory (`runs/<context_slug>/...`) with explicit input and output port bindings. Cyclic generator-verifier specifications unwind at runtime into acyclic file provenance on disk.
- **Two-Tier Checking**: Pairs authoring-time data-flow auditing (port matching, causal input availability across waves, and output promotion) with zero-LLM runtime contract enforcement via a zero-dependency Node.js MCP server (`weavemas_weave`).
- **Interactive Gates & Surgical Asset Edits**: Human review gates pause execution at milestone files before costly downstream synthesis. Persisted worker sessions (`conversation_id`) let an operator request natural-language cross-stage edits in place via `send_message` without re-spawning agents or replaying unaffected steps.
- **Zero-Token Out-of-Band UI Sidecar**: A local Node.js web panel (`sidecars/panel/`) polls `weave.md` manifests directly from disk to render a live stage stepper, agent cards, resolved/pending input badges, elapsed runtimes, and 1-click deliverable previews with zero LLM calls.

## Installation and Setup

### Prerequisites

- **Node.js >= 20** (pure standard library; zero external `npm` dependencies)
- **Google Antigravity (`agy`)** (or another MCP-capable CLI/IDE harness)

### Option 1: Install as an Antigravity Plugin (Recommended)

Clone this repository directly into your Antigravity plugins directory:

```bash
# macOS / Linux
git clone https://github.com/axiomfab/weavemas-agy.git ~/.gemini/config/plugins/weavemas

# Windows (PowerShell)
git clone https://github.com/axiomfab/weavemas-agy.git "$HOME/.gemini/config/plugins/weavemas"
```

When enabled in Antigravity (`customization://weavemas`), the plugin automatically bundles:

- **MCP Server (`weavemas_weave`)**: Registered via `mcp_config.json` (`weave` -> `weavemas_weave`).
- **Core Skills**: `weave-authoring`, `weave-core-orchestrator`, and `weave-core-agent`.
- **Control-Plane Subagents**: `provisioner` (Phase 1 workspace scaffolding) and `stage_orchestrator` (isolated per-stage and cluster coordination).
- **UI Sidecar**: `WeaveMAS UI` (`sidecars/panel/`), accessible via `sidecar://weavemas/panel/`.

### Option 2: Standalone `weavemas_weave` MCP Server

To register the MCP state and contract server directly in an MCP host configuration (`mcp_config.json`):

```json
{
  "mcpServers": {
    "weavemas_weave": {
      "command": "node",
      "args": ["/absolute/path/to/weavemas-agy/src/mcp_server.mjs"]
    }
  }
}
```

### MCP Tools (`weavemas_weave`)

All directory arguments (`dir`, `dirs`, `stage_dir`, `directory`, `mirror_to`) must be absolute paths.

| Tool | Role | Summary |
| :--- | :--- | :--- |
| `weave_init` | Orchestrator / Provisioner | Creates `weave.md` (`type`: `"agent"` or `"orchestrator"`, `status`, `instructions_file`, `inputs`, `outputs`, `conversation_id`). |
| `weave_verify` | Worker (Turn 1 & wakeup) | Verifies workspace identity and resolves declared `inputs` into `resolved_inputs` vs. `pending_inputs`. |
| `weave_update` | Orchestrator / Worker | Updates `status`, appends a timestamped log note, records `conversation_id`, and verifies/promotes `outputs` on `completed`. |
| `weave_read` | Orchestrator | Verifies single (`dir`) or batch (`dirs`, `stage_dir`) worker status, `outputs` on disk, and `conversation_id`. |
| `discover_agents` | Orchestrator (Phase 2) | Scans a stage or run directory for provisioned worker `weave.md` manifests matching `filter_status` (default `"initialized"`). |

## The `weave.md` Manifest Contract

Every run root (`runs/<context_slug>/weave.md`) and worker sandbox (`runs/<context_slug>/.../agents/<agent_id>/weave.md`) stores state in an on-disk `weave.md` file managed exclusively via `weavemas_weave`. It pairs a closed 7-key YAML frontmatter header with an append-only Markdown log:

```yaml
---
type: "agent"
status: "in_progress/02_draft"
instructions_file: ".agent/agents/stage1_writer.md"
inputs:
  - "notes.md: ${PROJECT_DIR}/prompts/style_guide.md"
outputs:
  - "draft.md: ${RUN_DIR}/01_draft.md"
conversation_id: "3f8a9c12-4b7e-4d1a-9e2b-8c7d6e5f4a3b"
updated_at: "2026-11-18T10:12:00.000Z"
---

# stage1_writer Status

- 2026-11-18T10:10:00.000Z: `initialized` - Workspace provisioned
- 2026-11-18T10:12:00.000Z: `in_progress/02_draft` - Drafting article prose and alt-text illustration prompt
```

### Frontmatter Keys

- **`type`**: `"agent"` or `"orchestrator"`. Updating an orchestrator manifest requires passing `type: "orchestrator"` to `weave_update`, preventing workers from overwriting the run root.
- **`status`**: Follows `[<stage_slug>/]<state>[/<detail>]` where `<state>` is one of `initialized`, `not_started`, `in_progress`, `waiting`, `awaiting_review`, `blocked`, or `completed`. Workers omit `<stage_slug>` (e.g., `in_progress/02_draft`); staged orchestrators prefix an existing `stageNN_<slug>` folder (e.g., `stage01_editorial/awaiting_review`).
- **`instructions_file`**: Workspace-relative path to the worker's `.agent/agents/<name>.md` file (omitted on orchestrators).
- **`inputs`**: Explicit input file bindings resolved relative to the worker's CWD after expanding `${PROJECT_DIR}` (repo root), `${RUN_DIR}` (`runs/<context_slug>`), and `${AGENT_DIR}` (worker CWD). Supports sibling paths (`../writer/draft.md`), `*` globs, and aliases (`draft.md: ${RUN_DIR}/01_draft.md`) so agent prompts refer only to local filenames. Unprefixed bare filenames resolve strictly inside the worker's CWD with no implicit fallback.
- **`outputs`**: Expected local output file(s)/glob(s) or promoted bindings (`<local_file>: <target_path>`). When transitioning to `completed`, `weave_update` verifies each output exists on disk and auto-copies mapped files to `<target_path>`.
- **`conversation_id`**: Optional persisted subagent session UUID used by orchestrators to resume workers via `send_message` across revision loops, context compaction, and post-run surgical edits.
- **`updated_at`**: ISO 8601 UTC timestamp updated automatically on each transition.

## Tutorial Examples

### Example 1: One-Shot Synthesis of a 2-Stage Pipeline (KidsWiki)

Open an empty workspace in Antigravity with the `weavemas` plugin enabled and prompt `weave-authoring` to synthesize a 2-stage illustrated encyclopedia pipeline:

> Use the `weave-authoring` skill to create a 2-stage KidsWiki pipeline for a `topic` and `target_age` (3-12, default 4). Stage 1 (Editorial): a Writer drafts the article with an `![<illustration prompt>](./illustration.png)` placeholder and italicized caption; a Fact Checker and Age Checker audit accuracy and readability in parallel with an in-place revision loop; then a human review gate approves `01_draft.md`. Stage 2 (Publishing): an Illustrator generates `illustration.png` from the alt-text prompt.

`weave-authoring` generates flat subagent definitions in `.agent/agents/`, modular guides in `orchestrator.md` and `orchestrator/stage*.md`, plus `orchestrator_trigger.md`, then runs the Tier 1 static data-flow audit to verify port matching and input availability.

1. **Activate the workspace trigger rule** (Antigravity protects `.agent/rules/` from direct agent writes):
   ```bash
   mkdir -p .agent/rules && mv orchestrator_trigger.md .agent/rules/orchestrator_trigger.md
   ```
2. **Run the pipeline**:
   > Write a KidsWiki article about "Rocket" for a 4yo.
3. **Open the WeaveMAS UI sidecar**: Click the `[WeaveMAS UI](sidecar://weavemas/panel/)` link emitted in chat (or toggle the **WeaveMAS UI** side panel in Antigravity) to watch the 2-stage stepper, live agent status cards, port badges, and deliverables under `runs/kidswiki_rocket_age4/`.
4. **Steer at the review gate or apply surgical edits**: At the Stage 1 `awaiting_review` gate, inspect `runs/kidswiki_rocket_age4/01_draft.md` (both verified prose and the alt-text image prompt) and reply `"Approved"` to run Stage 2, or request targeted tweaks in natural language -- the orchestrator wakes the existing worker via its persisted `conversation_id` and updates only affected outputs.

### Example 2: Hand-Authoring a Minimal Stageless Pipeline

For compact workflows without stage review gates, define flat agents in `.agent/agents/` and a single `orchestrator.md` at the workspace root.

**1. Writer Agent (`.agent/agents/agent_writer.md`)**

```markdown
---
name: agent_writer
description: Drafts short, age-calibrated KidsWiki articles
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

You write concise, factual encyclopedia articles calibrated to `target_age`.
Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.

# Role Specifics
* **Output Target**: Save your completed article to `draft.md`.

# Tasks
## Task: 01_outline
Select 3 core facts for `topic` calibrated to `target_age`.

## Task: 02_draft
Write the article to `draft.md`. On revision messages, update `draft.md` in place.

# Lifecycle
1. `01_outline`
2. `02_draft`
```

**2. Fact Checker Agent (`.agent/agents/agent_fact_checker.md`)**

```markdown
---
name: agent_fact_checker
description: Audits KidsWiki drafts for scientific accuracy
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

You audit `draft.md` for factual accuracy against `topic`.
Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.

# Role Specifics
* **Output Target**: Write your audit report starting with `verdict: PASS` or `verdict: FAIL` to `fact_audit.md`.
```

**3. Stageless Orchestrator (`orchestrator.md`)**

```markdown
# KidsWiki Stageless Orchestrator

Operate as a WeaveMAS orchestrator. You MUST use the `weave-core-orchestrator` skill to manage workspace scaffolding, Phase 1 `provisioner` delegation, and pipeline lifecycle tracking.

## Inputs
- `topic`: Article subject (required).
- `target_age`: Reader age from 3 to 12 (default: 4).

## Run Directory Structure
Every run is scoped to `runs/kidswiki_<topic_slug>_age<target_age>/`.

## Agents

### Writer: `writer`
* **Instructions**: [agent_writer.md](.agent/agents/agent_writer.md)
* **Working Directory**: `${RUN_DIR}/agents/writer/`
* **Outputs**:
  - `draft.md: ${RUN_DIR}/article.md`

### Fact Checker: `fact_checker`
* **Instructions**: [agent_fact_checker.md](.agent/agents/agent_fact_checker.md)
* **Working Directory**: `${RUN_DIR}/agents/fact_checker/`
* **Inputs**:
  - `../writer/draft.md`
* **Outputs**:
  - `fact_audit.md`

## Execution
1. **`writer`**:
   - Parameters: `topic`, `target_age`
   - Execution: Draft the article to `draft.md` (promoted automatically to `${RUN_DIR}/article.md`).
2. **`fact_checker`**:
   - Parameters: `topic`
   - Execution: Audit `../writer/draft.md` and write `fact_audit.md`. If `verdict: FAIL` (max 2 cycles), send corrections to `writer` via `send_message` and re-verify.
```

## Testing

Run the Node.js test suite:

```bash
npm test
```

## License

Released under the [MIT License](LICENSE).
