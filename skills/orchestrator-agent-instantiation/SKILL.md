---
name: orchestrator-agent-instantiation
description: >-
  Phase 1 WeaveMAS microskill. Delegates pre-spawn subagent workspace creation and
  weave.md initialization (with instructions_file, inputs, and outputs) to the isolated Provisioner subagent.
---

# 🛠️ Phase 1: Orchestrator Agent Instantiation

Execute at the start of every stage before evaluating `## Execution` or spawning worker subagents.

1. **Delegate to Provisioner**:
   Invoke the plugin's `provisioner` subagent (`TypeName: "provisioner"` or `"weavemas:provisioner"`, `Model: "flash"`, `Role: "provisioner"`). Never check for `.agent/agents/provisioner.md` locally or scaffold worker directories yourself:
   ```markdown
   Target Manifest / Stage Guide: <absolute_path_to_manifest_or_stage_md>
   Target Directory: <workspace_root>/output/<context_slug>/<stage_slug>
   Context Slug: <context_slug>
   ```
2. **Phase Gate**: Wait reactively for `PROVISIONING_COMPLETE`. Do NOT inspect agent `weave.md` files or evaluate `## Execution` while the Provisioner runs.
3. **Handoff to Phase 2**: Once `PROVISIONING_COMPLETE` arrives, immediately expand and execute `orchestrator-agent-execution`.
