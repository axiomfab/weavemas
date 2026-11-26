# Antigravity Rule: Minimal & Closed YAML Frontmatter

**Context:** Creating, reading, serializing, or modifying YAML frontmatter in any markdown file (e.g., `weave.md`, guidelines, agents, deliverables).
**Goal:** Prevent parameter bloat, token waste, and AI-hallucinated metadata.

## 1. The "Closed Schema" Constraint
- Frontmatter schemas are **strictly closed**.
- You are **strictly forbidden** from adding new frontmatter keys (e.g., `is_completed`, `progress`, `success`, `retry_count`, `flags`) unless the user explicitly requests them in the prompt.
- If you believe a new key is genuinely needed, you must STOP and ask:
  > *"I propose adding `[key_name]` to frontmatter for [reason]. May I add this parameter?"*

## 2. Minimalist Frontmatter Philosophy
Frontmatter is strictly for **identity and routing**, NEVER for derived state or narrative logs:
- **NO Derived Booleans**: Never invent booleans like `is_completed`, `has_outputs`, or `file_exists`. The consuming code or agent must derive state directly from the raw values (`status: "completed"`, `outputs: ["file.md"]`).
- **NO Narrative / Progress Logs**: Never put descriptions, progress notes, or summaries into frontmatter. Narrative logs belong exclusively in the Markdown body.
- **NO Meta Wrappers**: Never add wrapper keys like `success: true` or `error: null`.

## 3. WeaveMX `weave.md` Immutable 7-Key Contract
For any WeaveMX `weave.md` file, the frontmatter contains ONLY these 7 allowed keys and NO others:
1. `type`: (`"agent"` | `"orchestrator"`)
2. `status`: (lifecycle slug)
3. `instructions_file`: (path to agent's `.md` instruction file, or omitted)
4. `inputs`: (multi-line YAML list of input file paths, or omitted)
5. `outputs`: (multi-line YAML list of output file paths, or `[]`)
6. `conversation_id`: (persisted worker or stage subagent UUID string, or omitted)
7. `updated_at`: (ISO 8601 timestamp string)
