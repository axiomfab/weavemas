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
        }
      },
      required: ['dir']
    }
  },
  {
    name: 'weave_update',
    description: 'Update the WeaveMAS weave.md with a new lifecycle state and progress note.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description: 'Absolute path to the target directory containing weave.md.'
        },
        status: {
          type: 'string',
          description: 'Target lifecycle status using the grammar [<stage>/]<state>[/<detail>] where <state> is one of not_started, in_progress, waiting, awaiting_review, blocked, completed. Agents omit <stage> (e.g. in_progress/01_research, completed). Staged orchestrators must prefix an existing stage directory (e.g. stage01_setup/in_progress/iteration_2, stage01_setup/awaiting_review); stageless orchestrators omit it.'
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
        mirror_to: {
          type: 'string',
          description: 'Optional absolute destination file or directory path to mirror verified output file(s) directly in Node.js (zero-token copy). Requires at least one verified output.'
        }
      },
      required: ['dir', 'status']
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
    description: 'Read and verify status metadata from a single WeaveMAS weave.md (dir) or batch-verify multiple agent workspaces in one call (dirs or stage_dir).',
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
    description: 'Discover initialized or matching WeaveMAS subagent workspaces in a stage or context directory.',
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
