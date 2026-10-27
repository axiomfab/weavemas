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
          description: 'Initial lifecycle status (default: "not_started").'
        },
        instructions_file: {
          type: 'string',
          description: "Path to the agent's .md instruction file."
        },
        inputs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of input file paths or named entries ("Name: path") with optional wildcards (*), resolved via 3-tier lookup (agent CWD -> runs/<context_slug> -> workspace root).'
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
          description: 'Target lifecycle status (e.g. in_progress/step_name, waiting/reason, completed, blocked/reason).'
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
          description: 'Relative path(s) or wildcard pattern(s) to output file(s) (required if status is completed).'
        }
      },
      required: ['dir', 'status']
    }
  },
  {
    name: 'weave_verify',
    description: 'Verify that the working directory weave.md exists, matches the assigned subagent workspace, and resolves all declared inputs across the 3-tier hierarchy.',
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
    description: 'Read and verify status metadata from a WeaveMAS weave.md without reading full markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description: 'Absolute path to the target directory containing weave.md.'
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
        }
      },
      required: ['dir']
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
