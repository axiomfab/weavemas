import readline from 'node:readline';
import path from 'node:path';
import { TOOLS } from './tool_schemas.mjs';
import { weaveInit, weaveUpdate, weaveVerify, weaveRead, weaveReadBatch, discoverAgents } from './status_manager.mjs';

const PROTOCOL_VERSION = '2024-11-05';

/**
 * Formats a batch weave_read result as compact valid JSON with one line per agent row.
 * @param {import('./status_manager.mjs').BatchWeaveReadResult} batchRes
 * @returns {string}
 */
export function formatBatchReadResult(batchRes) {
  if (!batchRes || typeof batchRes !== 'object' || !Array.isArray(batchRes.agents)) {
    throw new TypeError('CRITICAL: batchRes must be a valid BatchWeaveReadResult object.');
  }
  const headerFields = {
    all_completed: batchRes.all_completed,
    verified: batchRes.verified,
    total_agents: batchRes.total_agents,
    completed_count: batchRes.completed_count,
    ...(batchRes.expected_status !== undefined ? { expected_status: batchRes.expected_status } : {}),
    status_mismatches: batchRes.status_mismatches,
    missing_outputs: batchRes.missing_outputs,
    ...(Array.isArray(batchRes.outputs_mismatches) && batchRes.outputs_mismatches.length > 0
      ? { outputs_mismatches: batchRes.outputs_mismatches }
      : {})
  };
  const lines = ['{'];
  for (const [k, v] of Object.entries(headerFields)) {
    lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  }
  if (batchRes.agents.length === 0) {
    lines.push('  "agents": []');
  } else {
    lines.push('  "agents": [');
    batchRes.agents.forEach((agent, idx) => {
      const comma = idx < batchRes.agents.length - 1 ? ',' : '';
      lines.push(`    ${JSON.stringify(agent)}${comma}`);
    });
    lines.push('  ]');
  }
  lines.push('}');
  return lines.join('\n');
}

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
      if (name === 'weave_init' || name === 'status_init') {
        const targetDir = args.dir;
        if (!targetDir || typeof targetDir !== 'string') {
          throw new Error("CRITICAL: 'dir' argument is required and must be an absolute path.");
        }
        const type = args.type || 'agent';
        const status = args.status || 'not_started';
        const instructionsFile = args.instructions_file || null;
        const inputs = args.inputs !== undefined ? args.inputs : null;
        const outputs = args.outputs !== undefined ? args.outputs : null;
        const conversationId = args.conversation_id !== undefined ? args.conversation_id : undefined;
        const res = weaveInit(targetDir, type, status, instructionsFile, inputs, outputs, conversationId);
        resultText = res.message;
      } else if (name === 'weave_update' || name === 'status_update') {
        const targetDir = args.dir;
        if (!targetDir || typeof targetDir !== 'string') {
          throw new Error("CRITICAL: 'dir' argument is required and must be an absolute path.");
        }
        const status = args.status;
        const progress = args.progress || null;
        const outputs = args.outputs !== undefined ? args.outputs : (args.deliverable !== undefined ? args.deliverable : null);
        const hasConversationId = args.conversation_id !== undefined;
        if ((status === undefined || status === null) && !hasConversationId) {
          throw new Error("CRITICAL: 'status' argument is required for weave_update (unless recording 'conversation_id').");
        }
        const options = {
          ...(args.type !== undefined ? { type: args.type } : {}),
          ...(args.mirror_to !== undefined ? { mirrorTo: args.mirror_to } : {}),
          ...(hasConversationId ? { conversationId: args.conversation_id } : {})
        };
        const res = weaveUpdate(targetDir, status ?? null, progress, outputs, options);
        resultText = res.message;
      } else if (name === 'weave_verify' || name === 'status_verify') {
        const targetDir = args.dir;
        if (!targetDir || typeof targetDir !== 'string') {
          throw new Error("CRITICAL: 'dir' argument is required and must be an absolute path.");
        }
        const expectedRole = args.expected_role || args.expected_id || null;
        const res = weaveVerify(targetDir, expectedRole);
        const pendingSummary = res.pending_inputs && res.pending_inputs.length > 0
          ? ` | Pending inputs (not on disk yet — HALT if required for current task): ${JSON.stringify(res.pending_inputs)}`
          : '';
        const inputsSummary = res.inputs && res.inputs.length > 0
          ? ` | Verified inputs: ${JSON.stringify(res.inputs)} | Resolved paths: ${JSON.stringify(res.resolved_inputs)}${pendingSummary}`
          : '';
        resultText = `WEAVE_VERIFY_OK: Agent verified as '${res.agent_id}' (Current status: ${res.status}${inputsSummary})`;
      } else if (name === 'weave_read' || name === 'status_read') {
        const hasDir = args.dir !== undefined;
        const hasDirs = args.dirs !== undefined;
        const hasStageDir = args.stage_dir !== undefined;
        const targetCount = Number(hasDir) + Number(hasDirs) + Number(hasStageDir);
        if (targetCount === 0) {
          throw new Error("CRITICAL: 'dir' argument is required and must be an absolute path (or provide 'dirs' / 'stage_dir' for batch verification).");
        }
        if (targetCount > 1) {
          throw new Error("CRITICAL: Provide exactly one of 'dir', 'dirs', or 'stage_dir' to weave_read.");
        }
        const expectedOutputs = args.expected_outputs !== undefined ? args.expected_outputs : args.expected_deliverable;
        const expectedStatus = args.expected_status !== undefined ? args.expected_status : undefined;
        if (hasDir) {
          if (!args.dir || typeof args.dir !== 'string') {
            throw new Error("CRITICAL: 'dir' argument is required and must be an absolute path.");
          }
          const readOptions = args.mirror_to !== undefined ? { mirrorTo: args.mirror_to } : {};
          const res = weaveRead(args.dir, expectedOutputs, expectedStatus, readOptions);
          resultText = JSON.stringify(res, null, 2);
        } else {
          const batchRes = weaveReadBatch({
            ...(hasDirs ? { dirs: args.dirs } : {}),
            ...(hasStageDir ? { stage_dir: args.stage_dir } : {}),
            ...(expectedOutputs !== undefined ? { expected_outputs: expectedOutputs } : {}),
            ...(expectedStatus !== undefined ? { expected_status: expectedStatus } : {}),
            ...(args.mirror_to !== undefined ? { mirror_to: args.mirror_to } : {})
          });
          resultText = formatBatchReadResult(batchRes);
        }
      } else if (name === 'weave_discover_agents' || name === 'discover_agents') {
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
