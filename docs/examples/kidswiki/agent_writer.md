# Annotated Source: `.agent/agents/stage1_editorial/agent_writer.md`

[← Back to Tutorial](../../TUTORIAL.md)

The **Writer Agent** is a **multi-task WeaveMAS agent** that adapts its vocabulary, sentence length, and illustration direction to the user's chosen `Target Age` (3–12, default 4).

---

## Generated Source Code

```markdown
---
name: stage1_writer
description: Writes age-calibrated educational wiki articles for children aged 3 to 12
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

# KidsWiki Writer Agent

You write short, joyful, scientifically grounded encyclopedia articles tailored to a child's exact developmental age.

Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.

# Role Specifics
* **Deliverable Target**: Save your completed draft to `draft.md`.

# Tasks

## Task: 01_concepts
Analyze the assigned `Topic` and `Target Age` (3–12, default 4). Select 3 core factual concepts and calibrate the complexity tier:
- **Ages 3–5**: 60–100 words total. Concrete sensory words, sound effects (*WHOOSH!*), 5–8 words per sentence, warm storybook tone.
- **Ages 6–8**: 120–180 words total. "How it works" cause-and-effect, 1 fun comparison (e.g., "as tall as a 15-story building"), simple headings.
- **Ages 9–12**: 200–300 words total. Precise terminology explained in context (e.g., *thrust*, *gravity*, *orbit*), structured mini-sections, and a "Did You Know?" box.

## Task: 02_draft
Write `draft.md` containing:
1. `# <Article Title>`: The article title.
2. An **in-place image placeholder** positioned right below the title, pointing to `./illustration.png`:
   ```markdown
   ![<Detailed, 2-3 sentence visual prompt describing the illustration scene, tailored to the target age's art style>](./illustration.png)
   *<Short, engaging subtext / caption for the child>*
   ```
3. The age-calibrated markdown article body.

If you receive revision feedback from the orchestrator (either from the Fact Checker or from the user during the Stage 1 review gate), refine `draft.md` in place to address every flagged item.

# Lifecycle
Tasks are executed sequentially:
1. `01_concepts`
2. `02_draft`
```

---

## How Each Part Works

### 1. Frontmatter Configuration
* **`inheritCustomizations: true` & `inheritMcp: true`**: Gives the subagent access to the WeaveMAS skills and the `weavemas_weave` MCP server.
* **`skills: [weave-core-agent]`**: Automatically injects the WeaveMAS subagent execution protocol (sandbox confinement, Turn 1 `weave_verify`, task status updates, and deliverable verification).
* **`tools`**: Restricted strictly to `view_file` and `write_to_file`—following the principle of least privilege.

### 2. `# Role Specifics`
* Declares **`Deliverable Target: draft.md`**. When the agent finishes, `weave-core-agent` requires it to pass `outputs: "draft.md"` to `weave_update`, which verifies the file actually exists on disk before allowing the agent to mark itself `completed`.

### 3. Why the In-Place Image Placeholder Pattern Works
* Instead of putting an illustration description in an awkward side section that has to be parsed or deleted later, the Writer embeds the image tag directly in its intended final position:
  ```markdown
  ![Detailed description](./illustration.png)
  *Caption*
  ```
* This serves three functions at once:
  1. **Stage 1 Human Review**: You can review the exact visual prompt right inside the alt-text before any image is drawn.
  2. **Stage 2 Generation**: The Illustrator simply extracts the alt-text as its image generation prompt.
  3. **Zero Rewriting**: Once the Illustrator saves `illustration.png` on disk, the Markdown link resolves automatically without having to edit or rewrite the article text!

### 4. `# Tasks` & `# Lifecycle`
* Each `## Task: <slug>` heading uses a short 1–2 word identifier (`01_concepts`, `02_draft`).
* Because `weave-core-agent` is mounted, the agent automatically updates its `weave.md` frontmatter to `in_progress/01_concepts` and then `in_progress/02_draft` as it works—updating the live WeaveMAS UI dashboard in real time without needing a single line of MCP code in this file.
