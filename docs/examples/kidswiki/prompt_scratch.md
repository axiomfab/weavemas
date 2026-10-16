# Standalone Authoring Prompts: 2-Stage KidsWiki

[← Back to Tutorial](../../TUTORIAL.md)

If you are starting in a fresh workspace and want to build the full 2-stage **KidsWiki** pipeline directly in one step (without completing Tutorial A first), you can use any of the prompts below.

---

## 1. Standard 2-Stage Pipeline Prompt (Recommended)

Copy and send this prompt to Antigravity with the **WeaveMAS** plugin enabled:

> **"Use the `weave-authoring` skill to create a 2-stage multi-agent KidsWiki pipeline that writes short illustrated wiki articles for children aged 3 to 12 (defaulting to age 4). In Stage 1 (Editorial), include a Writer (who drafts the age-appropriate article and embeds an in-place markdown image placeholder tag like `![<detailed illustration prompt>](./illustration.png)` followed by an italicized subtext) and a Fact Checker (strictly auditing factual accuracy, with an in-place revision loop if any statement is wrong), followed by a human review gate so the user can inspect the article and approve the illustration prompt before Stage 2. In Stage 2 (Publishing), include an Illustrator that reads the placeholder alt-text prompt, generates `illustration.png`, and outputs the final illustrated article."**

---

## 2. Advanced Variation: With Specific Model Tiering

If you want to explicitly pin specific models (e.g., lightweight `flash` for writing/fact-checking and `pro` for the orchestrator):

> **"Use the `weave-authoring` skill to scaffold a 2-stage KidsWiki pipeline for ages 3 to 12 (default 4). Configure the orchestrator to use model `pro` with modular stage files under `orchestrator/`. In Stage 1 (Editorial), create a `writer` agent and a `fact_checker` agent using model `flash`, with an in-place markdown placeholder image tag `![<prompt>](./illustration.png)`, an in-place revision loop, and a human review gate. In Stage 2 (Publishing), create an `illustrator` agent that generates `illustration.png` from the placeholder alt-text and compiles the final article."**
