import readline from 'node:readline';
import path from 'node:path';
import { statusInit, statusUpdate, statusVerify } from './status_manager.mjs';

const PROTOCOL_VERSION = '2024-11-05';

const TOOLS = [
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
  }
];

/**
 * Sends a single JSON-RPC response or notification line to stdout.
 * @param {Record<string, unknown>} payload 
 */
function sendLine(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

/**
 * Handles incoming JSON-RPC 2.0 messages.
 * @param {Record<string, unknown>} msg 
 */
export function handleMessage(msg) {
  if (!msg || typeof msg !== 'object') {
    return sendLine({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid Request: payload must be a JSON object' }
    });
  }

  const { id, method, params } = msg;

  // Notifications (no response needed)
  if (method === 'notifications/initialized') {
    return;
  }

  if (method === 'ping') {
    return sendLine({ jsonrpc: '2.0', id, result: {} });
  }

  if (method === 'initialize') {
    return sendLine({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'weave-mcp', version: '1.0.0' }
      }
    });
  }

  if (method === 'tools/list') {
    return sendLine({
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS }
    });
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params || {};
    try {
      let resultText = '';
      if (name === 'status_init') {
        const targetDir = args.dir;
        if (!targetDir || typeof targetDir !== 'string') {
          throw new Error("CRITICAL: 'dir' argument is required and must be an absolute path.");
        }
        const role = args.role;
        if (!role) throw new Error("CRITICAL: 'role' argument is required for status_init.");
        const type = args.type || 'agent';
        const initialStatus = args.status || 'not_started';
        const res = statusInit(targetDir, role, type, initialStatus);
        resultText = res.message;
      } else if (name === 'status_update') {
        const targetDir = args.dir;
        if (!targetDir || typeof targetDir !== 'string') {
          throw new Error("CRITICAL: 'dir' argument is required and must be an absolute path.");
        }
        const status = args.status;
        const progress = args.progress || null;
        const deliverable = args.deliverable || null;
        if (!status) throw new Error("CRITICAL: 'status' argument is required for status_update.");
        const res = statusUpdate(targetDir, status, progress, deliverable);
        resultText = res.message;
      } else if (name === 'status_verify') {
        const targetDir = args.dir;
        if (!targetDir || typeof targetDir !== 'string') {
          throw new Error("CRITICAL: 'dir' argument is required and must be an absolute path.");
        }
        const expectedRole = args.expected_role;
        if (!expectedRole) throw new Error("CRITICAL: 'expected_role' argument is required for status_verify.");
        const res = statusVerify(targetDir, expectedRole);
        resultText = `STATUS_VERIFY_OK: Role verified as '${res.role}' (Current status: ${res.status})`;
      } else {
        return sendLine({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Tool not found: ${name}` }
        });
      }

      return sendLine({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: resultText }]
        }
      });
    } catch (err) {
      return sendLine({
        jsonrpc: '2.0',
        id,
        result: {
          isError: true,
          content: [{ type: 'text', text: err.message }]
        }
      });
    }
  }

  return sendLine({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` }
  });
}

// Start stdio interface if run directly
if (process.argv[1] && path.basename(process.argv[1]) === 'mcp_server.mjs') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed);
      handleMessage(parsed);
    } catch (err) {
      sendLine({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: `Parse error: ${err.message}` }
      });
    }
  });
}
