/**
 * Tool definitions and schemas for WeaveMAS MCP server.
 */

export const TOOLS = [
  {
    name: 'status_init',
    description: 'Initialize a new WeaveMAS status.md file in the specified directory.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description: 'Absolute path to the target directory to initialize status.md in.'
        },
        role: {
          type: 'string',
          description: 'The expected role identifier (e.g. stage2_concept/agent_showrunner or orchestrator).'
        },
        type: {
          type: 'string',
          description: 'Node type: "agent" or "orchestrator" (default: "agent").'
        },
        status: {
          type: 'string',
          description: 'Initial lifecycle status (default: "not_started").'
        }
      },
      required: ['dir', 'role']
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
    description: 'Verify that the working directory status.md matches the assigned subagent role.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description: 'Absolute path to the target directory containing status.md.'
        },
        expected_role: {
          type: 'string',
          description: 'The expected role identifier for pre-flight verification.'
        }
      },
      required: ['dir', 'expected_role']
    }
  },
  {
    name: 'status_read',
    description: 'Read and verify status metadata and deliverable existence from a WeaveMAS status.md without reading full markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description: 'Absolute path to the target directory containing status.md.'
        }
      },
      required: ['dir']
    }
  }
];
