# Annotated Source: `.agent/rules/orchestrator_trigger.md`

[← Back to Tutorial](../../TUTORIAL.md)

The workspace trigger rule tells the primary Antigravity chat agent when to switch into WeaveMAS Orchestrator mode. *(Side note: Because Antigravity protects `.agent/rules/` from direct agent writes, the authoring agent saves this file in your project root as `orchestrator_trigger.md` and instructs you in chat to move it into `.agent/rules/orchestrator_trigger.md`.)*

---

## Generated Source Code

```markdown
---
trigger: always_on
---

# KidsWiki Pipeline Protocol

**Trigger:** Any request to "write a KidsWiki article", "run KidsWiki", or "create a kids article about".
**Action:** Before invoking any subagents or running commands, you must first read `orchestrator.md` and follow the modular stage guidelines under `orchestrator/`.
```

---

## How Each Part Works

### 1. Frontmatter (`trigger: always_on`)
```yaml
---
trigger: always_on
---
```
* Ensures this lightweight rule is active in every conversation within the workspace without consuming unnecessary tokens—the full `orchestrator.md` file is only loaded when the user's request matches the trigger phrase.

### 2. Trigger & Action Contract
* **`Trigger`**: Defines the natural-language phrases (e.g., *"Write a KidsWiki article about 'Rocket' for a 4yo"*) that activate the pipeline.
* **`Action`**: Directs the primary agent to read `orchestrator.md` **before** taking any action, ensuring it mounts the `weave-core-orchestrator` skill and scaffolds the `output/` directory properly.
