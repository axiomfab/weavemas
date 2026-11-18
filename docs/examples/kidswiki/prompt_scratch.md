# Standalone Authoring Prompts: 2-Stage KidsWiki

[← Back to Tutorial](../../TUTORIAL.md)

If you are starting in a fresh workspace and want to build the full 2-stage **KidsWiki** pipeline directly in one step (without completing Tutorial A first), you can use any of the prompts below.

---

## 1. Standard 2-Stage Pipeline Prompt (Recommended)

Copy and send this prompt to Antigravity with the **WeaveMAS** plugin enabled:

> **"Use the `weave-authoring` skill to create a 2-stage KidsWiki pipeline for a topic and target age (3–12, default 4). Stage 1 (Editorial): a Writer drafts the article with an `![<illustration prompt>](./illustration.png)` placeholder and italicized caption; a Fact Checker and Age Checker audit accuracy and readability in parallel with an in-place revision loop; then a human review gate approves the draft. Stage 2 (Publishing): an Illustrator generates the image from the alt-text prompt."**

---

## 2. Advanced Variation: With Specific Model Tiering

If you want to explicitly pin specific models (e.g., lightweight `flash` for writing/checking and `pro` for the orchestrator):

> **"Use the `weave-authoring` skill to create a 2-stage KidsWiki pipeline for a topic and target age (3–12, default 4). Use model `pro` for the orchestrator with modular stage files under `orchestrator/`. Stage 1 (Editorial): a `writer`, `fact_checker`, and `age_checker` using model `flash`, where the Writer drafts the article with an `![<illustration prompt>](./illustration.png)` placeholder and italicized caption, the Fact Checker and Age Checker audit accuracy and readability in parallel with an in-place revision loop, and a human review gate approves the draft. Stage 2 (Publishing): an `illustrator` generates the image from the alt-text prompt."**
