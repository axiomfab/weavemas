---
name: orchestrator-agent-instantiation
description: >-
  Standalone Phase 1 reference (already inlined in weave-orchestrator — do NOT
  read this file if weave-orchestrator is already loaded).
---

# 🛠️ Phase 1: Orchestrator Agent Instantiation

> **Note**: Already inlined in `weave-orchestrator`. Skip reading this skill when `weave-orchestrator` is loaded. Do **NOT** read `<appDataDir>/mcp/weavemas_weave/*.json` unless an unexpected schema error occurs (`weave_init`: `{"dir": string, "type"?: "agent"|"orchestrator", "status"?: string, "instructions_file"?: string, "inputs"?: string[], "outputs"?: string|string[], "conversation_id"?: string}`).

1. **Delegate to Provisioner**: Invoke `provisioner` (`TypeName: "provisioner"` or `"weavemas:provisioner"`, `Model: "flash"`, `Role: "provisioner"`):
   ```markdown
   Target Manifest / Stage Guide: <absolute_path_to_manifest_or_stage_md>
   Target Directory: <workspace_root>/runs/<context_slug>/<stage_slug>
   Context Slug: <context_slug>
   ```
   *(Omit `/<stage_slug>` in stageless pipelines.)* Never scaffold worker directories directly.
2. **Phase Gate**: Wait reactively for `PROVISIONING_COMPLETE`, then proceed immediately to Phase 2 (`weave_discover_agents` + dispatch).
