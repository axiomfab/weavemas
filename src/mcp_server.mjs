import readline from 'node:readline';
import path from 'node:path';
import { TOOLS } from './tool_schemas.mjs';
import { statusInit, statusInitBatch, statusUpdate, statusVerify, statusRead, discoverAgents } from './status_manager.mjs';

const PROTOCOL_VERSION = '2024-11-05';

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
        capabilities: {
          tools: { listChanged: false }
        },
        serverInfo: {
          name: 'weave-mcp',
          version: '0.1.0'
        }
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
        if (args.items !== undefined) {
          if (!Array.isArray(args.items) || args.items.length === 0) {
            throw new Error("CRITICAL: 'items' argument must be a non-empty array of objects.");
          }
          const res = statusInitBatch(args.items);
          resultText = res.message;
        } else {
          const targetDir = args.dir;
          if (!targetDir || typeof targetDir !== 'string') {
            throw new Error("CRITICAL: 'dir' argument is required and must be an absolute path.");
          }
          const type = args.type || 'agent';
          const status = args.status || 'not_started';
          const instructionsFile = args.instructions_file || null;
          const res = statusInit(targetDir, type, status, instructionsFile);
          resultText = res.message;
        }
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
        const expectedRole = args.expected_role || args.expected_id || null;
        const res = statusVerify(targetDir, expectedRole);
        resultText = `STATUS_VERIFY_OK: Agent verified as '${res.agent_id}' (Current status: ${res.status})`;
      } else if (name === 'status_read') {
        const targetDir = args.dir;
        if (!targetDir || typeof targetDir !== 'string') {
          throw new Error("CRITICAL: 'dir' argument is required and must be an absolute path.");
        }
        const expectedDeliverable = args.expected_deliverable !== undefined ? args.expected_deliverable : undefined;
        const expectedStatus = args.expected_status !== undefined ? args.expected_status : undefined;
        const res = statusRead(targetDir, expectedDeliverable, expectedStatus);
        resultText = JSON.stringify(res, null, 2);
      } else if (name === 'discover_agents') {
        const directory = args.directory;
        if (!directory || typeof directory !== 'string') {
          throw new Error("CRITICAL: 'directory' argument is required and must be an absolute path.");
        }
        const filterStatus = args.filter_status !== undefined ? args.filter_status : 'initialized';
        const limit = args.limit !== undefined ? args.limit : undefined;
        const res = discoverAgents(directory, filterStatus, limit);
        resultText = JSON.stringify(res, null, 2);
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
