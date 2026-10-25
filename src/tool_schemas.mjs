/**
 * Tool definitions and schemas for WeaveMAS MCP server.
 */

export const TOOLS = [
  {
    name: 'status_init',
    description: 'Initialize a WeaveMAS status.md file in the specified directory.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description: 'Absolute path to target directory to initialize status.md in.'
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
          description: 'Optional list of input file paths (relative to agent directory or workspace root) recorded in status.md frontmatter.'
        }
      },
      required: ['dir']
    }
  },
  {
    name: 'status_update',
    description: 'Update the WeaveMAS status.md with a new lifecycle state and progress note.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description: 'Absolute path to the target directory containing status.md.'
        },
        status: {
          type: 'string',
          description: 'Target lifecycle status (e.g. in_progress/step_name, waiting/reason, completed, blocked/reason).'
        },
        progress: {
          type: 'string',
          description: 'Concise summary of progress, decisions, or transition rationale.'
        },
        deliverable: {
          type: 'string',
          description: 'Relative path to output deliverable (required if status is completed).'
        }
      },
      required: ['dir', 'status']
    }
  },
  {
    name: 'status_verify',
    description: 'Verify that the working directory status.md exists, matches the assigned subagent workspace, and all declared inputs exist on disk.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description: 'Absolute path to the target directory containing status.md.'
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
    name: 'status_read',
    description: 'Read and verify status metadata from a WeaveMAS status.md without reading full markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description: 'Absolute path to the target directory containing status.md.'
        },
        expected_deliverable: {
          type: ['string', 'null'],
          description: 'Optional expected deliverable filename (e.g. "setup.md") or null if agent produces no deliverable.'
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
          description: 'Absolute path to the target stage or context directory (e.g. "<workspace_root>/output/<context_slug>/<stage_slug>").'
        },
        filter_status: {
          type: 'string',
          description: 'Status string to match in status.md (default: "initialized").'
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
