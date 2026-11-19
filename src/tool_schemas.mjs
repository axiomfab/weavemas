import { parseFrontmatter } from './frontmatter.mjs';

/**
 * Tool definitions and schemas for WeaveMAS MCP server.
 */

export const TOOLS = [
  {
    name: 'weave_init',
    description: 'Initialize a WeaveMAS weave.md file in the specified directory.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description: 'Absolute path to target directory to initialize weave.md in.'
        },
        type: {
          type: 'string',
          description: 'Node type: "agent" or "orchestrator" (default: "agent").'
        },
        status: {
          type: 'string',
          description: 'Initial lifecycle status (default: "not_started"). Orchestrators use [<stage>/]<state>[/<detail>]: staged runs must prefix an existing stage directory (e.g. "stage01_setup/in_progress"); stageless runs omit it (e.g. "in_progress").'
        },
        instructions_file: {
          type: 'string',
          description: "Path to the agent's .md instruction file."
        },
        inputs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of input file paths or named entries ("Name: path") with optional wildcards (*), resolved strictly relative to agent CWD after substituting explicit ${PROJECT_DIR}, ${RUN_DIR}, and ${AGENT_DIR} path variables.'
        },
        outputs: {
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } }
          ],
          description: 'Optional expected output filename(s)/pattern(s) or promoted output binding(s) ("<local_file>: <target_path>"). Omit if agent produces no file outputs.'
        },
        conversation_id: {
          type: 'string',
          description: 'Optional worker or stage subagent conversationId UUID to persist in weave.md frontmatter for surgical send_message resumes.'
        }
      },
      required: ['dir']
    }
  },
  {
    name: 'weave_update',
    description: 'Update the WeaveMAS weave.md with a new lifecycle state, progress note, outputs, and/or persisted worker conversation_id.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description: 'Absolute path to the target directory containing weave.md.'
        },
        status: {
          type: 'string',
          description: 'Target lifecycle status using the grammar [<stage>/]<state>[/<detail>] where <state> is one of not_started, in_progress, waiting, awaiting_review, blocked, completed. Agents omit <stage> (e.g. in_progress/01_research, completed). Staged orchestrators must prefix an existing stage directory (e.g. stage01_setup/in_progress/iteration_2, stage01_setup/awaiting_review); stageless orchestrators omit it. Optional only when recording conversation_id without changing status.'
        },
        type: {
          type: 'string',
          description: 'Node type guard: "agent" or "orchestrator". REQUIRED as "orchestrator" when updating an orchestrator weave.md; subagents omit it. A mismatch with the target weave.md type is rejected.'
        },
        progress: {
          type: 'string',
          description: 'Concise summary of progress, decisions, or transition rationale.'
        },
        outputs: {
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } }
          ],
          description: 'Optional relative path(s) or wildcard pattern(s) to local output file(s) in the agent working directory. Verified (and promoted if bound in weave.md) when status is completed.'
        },
        conversation_id: {
          type: 'string',
          description: 'Optional worker or stage subagent conversationId UUID to persist in weave.md frontmatter for surgical send_message resumes across compaction or sub-orchestrators. May be supplied with or without status.'
        },
        mirror_to: {
          type: 'string',
          description: 'Optional absolute destination file or directory path to mirror verified output file(s) directly in Node.js (zero-token copy). Requires at least one verified output.'
        }
      },
      required: ['dir']
    }
  },
  {
    name: 'weave_verify',
    description: 'Verify that the working directory weave.md exists, matches the assigned subagent workspace, and resolves all declared inputs strictly relative to agent CWD (with explicit ${PROJECT_DIR}, ${RUN_DIR}, and ${AGENT_DIR} variable substitution).',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description: 'Absolute path to the target directory containing weave.md.'
        },
        expected_role: {
          type: 'string',
          description: 'Optional expected agent identifier or role slug for pre-flight verification.'
        }
      },
      required: ['dir']
    }
  },
  {
    name: 'weave_read',
    description: 'Read and verify status metadata (including persisted conversation_id) from a single WeaveMAS weave.md (dir) or batch-verify multiple agent workspaces in one call (dirs or stage_dir).',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description: 'Absolute path to a single target directory containing weave.md (mutually exclusive with dirs and stage_dir).'
        },
        dirs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Non-empty array of absolute paths to agent directories containing weave.md for batch verification (mutually exclusive with dir and stage_dir).'
        },
        stage_dir: {
          type: 'string',
          description: 'Absolute path to a stage or context directory whose agents/ workspaces are batch-verified in a single call (mutually exclusive with dir and dirs).'
        },
        expected_outputs: {
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
            { type: 'null' }
          ],
          description: 'Optional expected output filename/pattern, array of filenames/patterns, or null/[] if agent produces no outputs.'
        },
        expected_status: {
          type: 'string',
          description: 'Optional expected status prefix to verify (e.g. "completed").'
        },
        mirror_to: {
          type: 'string',
          description: 'Optional absolute destination file or directory path to mirror verified output file(s) directly in Node.js (zero-token copy; single-directory dir mode only). Requires at least one verified output.'
        }
      }
    }
  },
  {
    name: 'discover_agents',
    description: 'Discover initialized or matching WeaveMAS subagent workspaces (including persisted conversation_id) in a stage or context directory.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Absolute path to the target stage or context directory (e.g. "<workspace_root>/runs/<context_slug>/<stage_slug>").'
        },
        filter_status: {
          type: 'string',
          description: 'Status string to match in weave.md (default: "initialized").'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of matching agent records to return in a single call.'
        }
      },
      required: ['directory']
    }
  }
];

/**
 * Canonical 1-line parameter signatures for inlining into WeaveMAS skills and subagents
 * so models call `weavemas_weave` tools directly without reading `<appDataDir>/mcp/weavemas_weave/*.json`.
 * @type {Readonly<Record<string, string>>}
 */
export const COMPACT_TOOL_SIGNATURES = Object.freeze({
  weave_init: '{"dir": string, "type"?: "agent"|"orchestrator", "status"?: string, "instructions_file"?: string, "inputs"?: string[], "outputs"?: string|string[], "conversation_id"?: string}',
  weave_update: '{"dir": string, "status"?: string, "type"?: "agent"|"orchestrator", "progress"?: string, "outputs"?: string|string[], "conversation_id"?: string, "mirror_to"?: string}',
  weave_verify: '{"dir": string, "expected_role"?: string}',
  weave_read: '{"dir"?: string, "dirs"?: string[], "stage_dir"?: string, "expected_outputs"?: string|string[]|null, "expected_status"?: string, "mirror_to"?: string}',
  discover_agents: '{"directory": string, "filter_status"?: string, "limit"?: number}'
});

/**
 * Required path fragment prohibiting unnecessary lazy MCP schema file reads.
 * @type {string}
 */
export const NO_SCHEMA_READ_FRAGMENT = '<appDataDir>/mcp/weavemas_weave/*.json';

/**
 * Validates that a skill or agent Markdown document contains exact compact 1-line
 * `weavemas_weave` MCP parameter signatures for all `requiredTools` plus an explicit
 * rule against reading `<appDataDir>/mcp/weavemas_weave/*.json`.
 *
 * @param {string} content - Markdown file content to validate.
 * @param {string[]} requiredTools - Non-empty list of tool names from `COMPACT_TOOL_SIGNATURES`.
 * @returns {{ verified: true, tools: string[] }}
 */
export function verifyInlineToolSignatures(content, requiredTools) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new TypeError('CRITICAL: content must be a non-empty string.');
  }
  if (!Array.isArray(requiredTools) || requiredTools.length === 0) {
    throw new TypeError('CRITICAL: requiredTools must be a non-empty array of tool names.');
  }

  for (const toolName of requiredTools) {
    if (typeof toolName !== 'string' || !Object.hasOwn(COMPACT_TOOL_SIGNATURES, toolName)) {
      throw new Error(`CRITICAL: Unknown WeaveMAS MCP tool '${String(toolName)}' in requiredTools.`);
    }
    const expectedSig = COMPACT_TOOL_SIGNATURES[toolName];
    if (!content.includes(toolName) || !content.includes(expectedSig)) {
      throw new Error(
        `CRITICAL: Missing or drifted compact signature for '${toolName}'. Expected: ${expectedSig}`
      );
    }
  }

  if (!content.includes(NO_SCHEMA_READ_FRAGMENT)) {
    throw new Error(
      `CRITICAL: Missing explicit prohibition against reading '${NO_SCHEMA_READ_FRAGMENT}'.`
    );
  }

  return { verified: true, tools: [...requiredTools] };
}

/**
 * Exact minimal built-in coordination toolset allowed for `agents/stage_orchestrator.md`
 * so Turn-1 prefill stays around ~8.5K–9.5K tokens instead of inheriting the full IDE harness.
 * (`call_mcp_tool` is granted automatically via `inheritMcp: true`.)
 * @type { readonly string[] }
 */
export const STAGE_ORCHESTRATOR_TOOLS = Object.freeze([
  'view_file',
  'invoke_subagent',
  'send_message'
]);

/**
 * Required inline `weavemas_weave` MCP tool signatures for `agents/stage_orchestrator.md`.
 * @type { readonly string[] }
 */
export const STAGE_ORCHESTRATOR_MCP_TOOLS = Object.freeze([
  'weave_update',
  'weave_read',
  'discover_agents'
]);

/**
 * Validates the frontmatter configuration, minimal tool surface, inline MCP signatures,
 * and inlined Two-Phase execution protocol of `agents/stage_orchestrator.md` (R5 / #11).
 *
 * @param {string} content - Raw Markdown content of `stage_orchestrator.md`.
 * @returns {{ verified: true, name: string, tools: string[], mcpTools: string[] }}
 */
export function verifyStageOrchestratorContract(content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new TypeError('CRITICAL: content must be a non-empty string.');
  }

  const { frontmatter, body } = parseFrontmatter(content);
  if (!frontmatter || Object.keys(frontmatter).length === 0) {
    throw new Error('CRITICAL: Missing YAML frontmatter in stage_orchestrator definition.');
  }
  if (frontmatter.name !== 'stage_orchestrator') {
    throw new Error(
      `CRITICAL: stage_orchestrator frontmatter 'name' must be 'stage_orchestrator', got '${String(frontmatter.name)}'.`
    );
  }
  if (frontmatter.subagent !== true) {
    throw new Error("CRITICAL: stage_orchestrator must set 'subagent: true'.");
  }
  if (frontmatter.inheritMcp !== true) {
    throw new Error("CRITICAL: stage_orchestrator must set 'inheritMcp: true'.");
  }
  if (frontmatter.inheritCustomizations !== true) {
    throw new Error(
      "CRITICAL: stage_orchestrator must set 'inheritCustomizations: true' so workspace .agent/agents/*.md and child skills remain discoverable."
    );
  }
  if (frontmatter.skills !== undefined && (!Array.isArray(frontmatter.skills) || frontmatter.skills.length > 0)) {
    throw new Error(
      'CRITICAL: stage_orchestrator must inline its execution protocol and omit external startup skills.'
    );
  }
  if (!Array.isArray(frontmatter.tools) || frontmatter.tools.length === 0) {
    throw new Error('CRITICAL: stage_orchestrator must declare an explicit non-empty tools list.');
  }

  const actualTools = frontmatter.tools.map(String);
  if (
    actualTools.length !== STAGE_ORCHESTRATOR_TOOLS.length ||
    !STAGE_ORCHESTRATOR_TOOLS.every((t) => actualTools.includes(t))
  ) {
    throw new Error(
      `CRITICAL: stage_orchestrator tools must match minimal coordination set [${STAGE_ORCHESTRATOR_TOOLS.join(', ')}], got [${actualTools.join(', ')}].`
    );
  }

  verifyInlineToolSignatures(content, [...STAGE_ORCHESTRATOR_MCP_TOOLS]);

  const requiredBodyMarkers = [
    { pattern: /\bprovisioner\b/, label: 'Phase 1 provisioner delegation' },
    { pattern: /\bPROVISIONING_COMPLETE\b/, label: 'PROVISIONING_COMPLETE gate' },
    { pattern: /\bdiscover_agents\b/, label: 'Phase 2 discover_agents' },
    { pattern: /\binvoke_subagent\b/, label: 'Phase 2 invoke_subagent dispatch' },
    { pattern: /\bsend_message\b/, label: 'send_message revision routing' },
    { pattern: /\bconversation_id\b/, label: 'immediate conversation_id persistence' },
    { pattern: /\bweave_read\b/, label: 'batch weave_read verification' },
    { pattern: /NEVER call `manage_subagents` or `kill`/i, label: 'idle child preservation (no kill)' },
    { pattern: /\bSTAGE_COMPLETED:/, label: '1-line STAGE_COMPLETED acknowledgment' },
    { pattern: /\bCLUSTER_COMPLETED:/, label: '1-line CLUSTER_COMPLETED acknowledgment' }
  ];

  for (const { pattern, label } of requiredBodyMarkers) {
    if (!pattern.test(body)) {
      throw new Error(`CRITICAL: stage_orchestrator prompt body is missing required '${label}' contract.`);
    }
  }

  return {
    verified: true,
    name: 'stage_orchestrator',
    tools: [...STAGE_ORCHESTRATOR_TOOLS],
    mcpTools: [...STAGE_ORCHESTRATOR_MCP_TOOLS]
  };
}


