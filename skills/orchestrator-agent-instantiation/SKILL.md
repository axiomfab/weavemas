---
name: orchestrator-agent-instantiation
description: >-
  Phase 1 WeaveMAS microskill. Delegates pre-spawn subagent scaffolding, directory
  creation, status.md initialization, and Tier 2 input file slicing to the isolated
  Provisioner subagent.
---

# 🛠️ Phase 1: Orchestrator Agent Instantiation

Execute this microskill at the start of every stage (before evaluating `## Execution` or spawning worker subagents).

## Procedure

1. **Delegate Scaffolding to the Plugin's Provisioner Subagent**:
   - **STRICT PROHIBITION**: Do NOT check for `.agent/agents/provisioner.md` in the local project workspace, and NEVER fall back to scaffolding agent directories or calling `status_init` for stage agents directly in the root orchestrator.
   - Call `invoke_subagent` using the auto-discovered plugin agent (`TypeName: "provisioner"` or `"weavemas:provisioner"`, `Model: "flash"`, `Role: "provisioner"`):
   ```markdown
   Target Manifest / Stage Guide: <absolute_path_to_manifest_or_stage_md>
   Target Directory: <workspace_root>/output/<context_slug>/<stage_slug>

   Parse ONLY the `## Agents` section of the guide, initialize all declared agent workspaces via `weavemas_weave/status_init` (including each agent's `instructions_file`), and stage all declared Tier 2 input files into each agent's working directory.
   ```

2. **Phase Gate (Wait for Receipt)**:
   - Wait reactively for the Provisioner subagent to return `PROVISIONING_COMPLETE`.
   - Do NOT read or inspect the created agent `status.md` files or staged inputs yourself.
   - Do NOT evaluate `## Execution` while the Provisioner is running.

3. **Autonomous Handoff to Phase 2**:
   Once `PROVISIONING_COMPLETE` is received, immediately expand and execute the `orchestrator-agent-execution` skill.
