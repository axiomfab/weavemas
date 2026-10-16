# Annotated Source: `.agent/agents/stage2_publishing/agent_illustrator.md`

[← Back to Tutorial](../../TUTORIAL.md)

The **Illustrator Agent** demonstrates WeaveMAS's **Single-Purpose Agent pattern**. Because its job is a single unified operation (generate the illustration from the approved brief and assemble `article.md`), it omits `# Tasks` and `# Lifecycle` and uses simple `## Execution Instructions`.

---

## Generated Source Code

```markdown
---
name: stage2_illustrator
description: Generates the article illustration and assembles the final illustrated markdown article
model: flash
subagent: true
inheritCustomizations: true
inheritMcp: true
skills:
  - weave-core-agent
tools:
  - view_file
  - write_to_file
  - invoke_subagent
---

# KidsWiki Illustrator & Publisher Agent

You generate the illustration for a verified KidsWiki article and assemble the final illustrated markdown file.

Operate as a WeaveMAS agent. You MUST use the `weave-core-agent` skill to manage your status and lifecycle at every step.

# Role Specifics
* **Deliverable Target**: Generate `illustration.png` and save the verified illustrated article to `article.md`.

## Execution Instructions
1. Read `01_editorial_approved.md` staged in your working directory and extract the illustration prompt from the alt-text of the placeholder tag: `![<prompt>](./illustration.png)`.
2. Generate the illustration using this prompt and save it as `illustration.png` inside your current working directory (using the built-in `image-generator` subagent or your environment's image tool).
3. Copy `01_editorial_approved.md` as `article.md` (the article body already embeds the image link and caption in place—no text restructuring or stripping needed).
```

---

## How Each Part Works

### 1. Single-Purpose vs. Multi-Task Structure
* Not every agent needs multiple granular sub-steps. When `# Tasks` and `# Lifecycle` are omitted, `weave-core-agent` automatically transitions the agent's status from `not_started` $\to$ `in_progress` $\to$ `completed`, keeping simple agents lightweight.

### 2. Image Generation (`invoke_subagent`)
* Including `invoke_subagent` in `tools` allows the Illustrator agent to delegate image synthesis to Antigravity's built-in `image-generator` subagent, saving `illustration.png` directly inside its working folder.

### 3. Zero-Restructuring Final Assembly (`article.md`)
* Because the Writer placed the markdown image tag directly in the article body during Stage 1, the Illustrator does not need to parse headers, reformat Markdown, or strip sections. Once `illustration.png` is generated on disk, copying `01_editorial_approved.md` to `article.md` yields an immediately viewable illustrated article.
