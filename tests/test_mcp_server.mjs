import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { handleMessage, formatBatchReadResult } from '../src/mcp_server.mjs';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'weavemas-mcp-test-'));
}

/**
 * Helper to capture stdout JSON-RPC line from handleMessage
 */
function captureResponse(msg) {
  let captured = null;
  const originalWrite = process.stdout.write;
  try {
    process.stdout.write = (chunk) => {
      captured = JSON.parse(chunk.trim());
      return true;
    };
    handleMessage(msg);
  } finally {
    process.stdout.write = originalWrite;
  }
  return captured;
}

test('MCP Handshake - Happy Path: initialize returns protocolVersion and serverInfo', () => {
  const req = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', clientInfo: { name: 'test-client', version: '1.0' } }
  };
  const res = captureResponse(req);
  assert.equal(res.id, 1);
  assert.equal(res.result.protocolVersion, '2024-11-05');
  assert.equal(res.result.serverInfo.name, 'weave-mcp');
  assert.ok(res.result.capabilities.tools);
});

test('MCP Discovery - Happy Path: tools/list returns Weave status tools', () => {
  const req = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };
  const res = captureResponse(req);
  assert.equal(res.id, 2);
  const toolNames = res.result.tools.map(t => t.name);
  assert.ok(toolNames.includes('weave_init'));
  assert.ok(toolNames.includes('weave_update'));
  assert.ok(toolNames.includes('weave_verify'));
  assert.ok(toolNames.includes('weave_read'));
  assert.ok(toolNames.includes('discover_agents'));
});

test('MCP Tool Call - Happy Path: executes weave_init and weave_update', () => {
  const tmp = createTempDir();
  const agentDir = path.join(tmp, 'agent_showrunner');
  // 1. weave_init
  const initReq = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'weave_init',
      arguments: { dir: agentDir }
    }
  };
  const initRes = captureResponse(initReq);
  assert.equal(initRes.id, 3);
  assert.match(initRes.result.content[0].text, /WEAVE_INIT_OK/);

  // 2. weave_verify
  const verifyReq = {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'weave_verify',
      arguments: { dir: agentDir, expected_role: 'agent_showrunner' }
    }
  };
  const verifyRes = captureResponse(verifyReq);
  assert.equal(verifyRes.id, 4);
  assert.match(verifyRes.result.content[0].text, /WEAVE_VERIFY_OK/);

  // 3. weave_update
  const updateReq = {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'weave_update',
      arguments: { dir: agentDir, status: 'in_progress/outline', progress: 'Outline generated.' }
    }
  };
  const updateRes = captureResponse(updateReq);
  assert.equal(updateRes.id, 5);
  assert.match(updateRes.result.content[0].text, /WEAVE_UPDATE_OK: status -> in_progress\/outline/);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('MCP Failure Path 1: unknown method returns JSON-RPC error -32601', () => {
  const req = { jsonrpc: '2.0', id: 10, method: 'unknown/method', params: {} };
  const res = captureResponse(req);
  assert.equal(res.id, 10);
  assert.equal(res.error.code, -32601);
  assert.match(res.error.message, /Method not found/);
});

test('MCP Failure Path 2: unknown tool returns JSON-RPC error -32601', () => {
  const req = {
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: { name: 'non_existent_tool', arguments: {} }
  };
  const res = captureResponse(req);
  assert.equal(res.id, 11);
  assert.equal(res.error.code, -32601);
  assert.match(res.error.message, /Tool not found/);
});

test('MCP Failure Path 3: weave_update validation failure returns isError: true result', () => {
  const tmp = createTempDir();
  const req = {
    jsonrpc: '2.0',
    id: 12,
    method: 'tools/call',
    params: {
      name: 'weave_update',
      arguments: { dir: tmp, status: 'invalid_status' }
    }
  };
  const res = captureResponse(req);
  assert.equal(res.id, 12);
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /CRITICAL: Invalid status state/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('MCP Failure Path 4: invalid request format returns error -32600', () => {
  const res = captureResponse('invalid non-object');
  assert.equal(res.error.code, -32600);
});

test('MCP Tool Call - Happy Path 2: weave_init initializes orchestrator node', () => {
  const tmp = createTempDir();
  fs.mkdirSync(path.join(tmp, 'stage01_setup'));
  const initReq = {
    jsonrpc: '2.0',
    id: 13,
    method: 'tools/call',
    params: {
      name: 'weave_init',
      arguments: {
        dir: tmp,
        role: 'orchestrator',
        type: 'orchestrator',
        status: 'stage01_setup/in_progress'
      }
    }
  };
  const initRes = captureResponse(initReq);
  assert.equal(initRes.id, 13);
  assert.match(initRes.result.content[0].text, /WEAVE_INIT_OK/);
  const fileContent = fs.readFileSync(path.join(tmp, 'weave.md'), 'utf-8');
  assert.match(fileContent, /type: "orchestrator"/);
  assert.doesNotMatch(fileContent, /^role:/m);
  assert.match(fileContent, /status: "stage01_setup\/in_progress"/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('MCP Failure Path 5: weave_init without dir returns isError: true result', () => {
  const req = {
    jsonrpc: '2.0',
    id: 14,
    method: 'tools/call',
    params: {
      name: 'weave_init',
      arguments: { role: 'stage1_setup/agent_director' }
    }
  };
  const res = captureResponse(req);
  assert.equal(res.id, 14);
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /CRITICAL: 'dir' argument is required and must be an absolute path/);
});

test('MCP Failure Path 6: weave_init with relative dir returns isError: true result', () => {
  const req = {
    jsonrpc: '2.0',
    id: 15,
    method: 'tools/call',
    params: {
      name: 'weave_init',
      arguments: { dir: 'relative/dir', role: 'stage1_setup/agent_director' }
    }
  };
  const res = captureResponse(req);
  assert.equal(res.id, 15);
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /CRITICAL: Target directory must be an absolute path/);
});

test('MCP Tool Call - Happy Path 3: weave_read returns parsed metadata and outputs status', () => {
  const tmp = createTempDir();
  handleMessage({
    jsonrpc: '2.0',
    id: 16,
    method: 'tools/call',
    params: {
      name: 'weave_init',
      arguments: { dir: tmp, role: 'stage1_setup/agent_director' }
    }
  });

  fs.writeFileSync(path.join(tmp, 'setup.md'), '# Setup content', 'utf-8');
  handleMessage({
    jsonrpc: '2.0',
    id: 17,
    method: 'tools/call',
    params: {
      name: 'weave_update',
      arguments: { dir: tmp, status: 'completed', outputs: 'setup.md', progress: 'Setup completed' }
    }
  });

  const readReq = {
    jsonrpc: '2.0',
    id: 18,
    method: 'tools/call',
    params: {
      name: 'weave_read',
      arguments: { dir: tmp, expected_outputs: 'setup.md', expected_status: 'completed' }
    }
  };
  const readRes = captureResponse(readReq);
  assert.equal(readRes.id, 18);
  assert.equal(readRes.result.isError, undefined);
  const data = JSON.parse(readRes.result.content[0].text);
  assert.equal(data.status, 'completed');
  assert.deepEqual(data.outputs, ['setup.md']);
  assert.equal(data.type, 'agent');
  assert.ok(data.updated_at);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('MCP Failure Path 7: weave_read without dir returns isError: true result', () => {
  const req = {
    jsonrpc: '2.0',
    id: 19,
    method: 'tools/call',
    params: {
      name: 'weave_read',
      arguments: {}
    }
  };
  const res = captureResponse(req);
  assert.equal(res.id, 19);
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /CRITICAL: 'dir' argument is required and must be an absolute path/);
});

test('MCP Failure Path 8: weave_read with relative dir returns isError: true result', () => {
  const req = {
    jsonrpc: '2.0',
    id: 20,
    method: 'tools/call',
    params: {
      name: 'weave_read',
      arguments: { dir: 'relative/path' }
    }
  };
  const res = captureResponse(req);
  assert.equal(res.id, 20);
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /CRITICAL: Target directory must be an absolute path/);
});

test('MCP Failure Path: weave_init without dir (e.g. passing items) returns isError: true result', () => {
  const req = {
    jsonrpc: '2.0',
    id: 21,
    method: 'tools/call',
    params: {
      name: 'weave_init',
      arguments: {
        items: [
          { dir: 'C:\\test\\dir' }
        ]
      }
    }
  };
  const res = captureResponse(req);
  assert.equal(res.id, 21);
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /CRITICAL: 'dir' argument is required and must be an absolute path/);
});

test('MCP Tool Call - Happy Path: weave_init with instructions_file', () => {
  const tmp = createTempDir();
  const req = {
    jsonrpc: '2.0',
    id: 23,
    method: 'tools/call',
    params: {
      name: 'weave_init',
      arguments: {
        dir: tmp,
        instructions_file: '.agent/agents/architect.md'
      }
    }
  };
  const res = captureResponse(req);
  assert.equal(res.id, 23);
  assert.equal(res.result.isError, undefined);
  assert.match(res.result.content[0].text, /WEAVE_INIT_OK/);
  const fileContent = fs.readFileSync(path.join(tmp, 'weave.md'), 'utf-8');
  assert.match(fileContent, /instructions_file: "\.agent\/agents\/architect\.md"/);
  assert.doesNotMatch(fileContent, /^role:/m);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('MCP Tool Call - Happy Path: discover_agents discovers agents with pagination', () => {
  const tmp = createTempDir();
  const stageDir = path.join(tmp, 'stage01_setup');
  const agent1Dir = path.join(stageDir, 'agents', 'agent_alpha');
  const agent2Dir = path.join(stageDir, 'agents', 'agent_beta');

  // Initialize two agents
  captureResponse({
    jsonrpc: '2.0',
    id: 24,
    method: 'tools/call',
    params: {
      name: 'weave_init',
      arguments: { dir: agent1Dir, status: 'initialized', instructions_file: '.agent/agents/alpha.md' }
    }
  });
  captureResponse({
    jsonrpc: '2.0',
    id: 25,
    method: 'tools/call',
    params: {
      name: 'weave_init',
      arguments: { dir: agent2Dir, status: 'initialized', instructions_file: '.agent/agents/beta.md' }
    }
  });

  const discoverReq = {
    jsonrpc: '2.0',
    id: 26,
    method: 'tools/call',
    params: {
      name: 'discover_agents',
      arguments: {
        directory: stageDir,
        filter_status: 'initialized',
        limit: 1
      }
    }
  };
  const res = captureResponse(discoverReq);
  assert.equal(res.id, 26);
  assert.equal(res.result.isError, undefined);
  const parsed = JSON.parse(res.result.content[0].text);
  assert.equal(parsed.total_matching, 2);
  assert.equal(parsed.returned_count, 1);
  assert.equal(parsed.remaining_count, 1);
  assert.equal(parsed.agents.length, 1);
  assert.equal(parsed.agents[0].agent_id, 'agent_alpha');
  assert.equal(parsed.agents[0].instructions_file, '.agent/agents/alpha.md');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('MCP Failure Path 10: discover_agents without directory returns isError: true', () => {
  const req = {
    jsonrpc: '2.0',
    id: 27,
    method: 'tools/call',
    params: {
      name: 'discover_agents',
      arguments: {}
    }
  };
  const res = captureResponse(req);
  assert.equal(res.id, 27);
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /CRITICAL: 'directory' argument is required/);
});

test('MCP Failure Path 11: discover_agents with relative directory returns isError: true', () => {
  const req = {
    jsonrpc: '2.0',
    id: 28,
    method: 'tools/call',
    params: {
      name: 'discover_agents',
      arguments: {
        directory: 'relative/path/stage'
      }
    }
  };
  const res = captureResponse(req);
  assert.equal(res.id, 28);
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /CRITICAL: Directory must be an absolute path/);
});

test('MCP Tool Call - Happy Path: weave_init with inputs and weave_verify checks input file existence', () => {
  const tmp = createTempDir();
  const writerDir = path.join(tmp, 'writer');
  const checkerDir = path.join(tmp, 'checker');
  fs.mkdirSync(writerDir, { recursive: true });

  const initRes = captureResponse({
    jsonrpc: '2.0',
    id: 29,
    method: 'tools/call',
    params: {
      name: 'weave_init',
      arguments: {
        dir: checkerDir,
        status: 'initialized',
        instructions_file: '.agent/agents/checker.md',
        inputs: ['../writer/draft.md'],
        outputs: ['audit.md: ${RUN_DIR}/01_audit.md']
      }
    }
  });
  assert.equal(initRes.result.isError, undefined);

  // Verify before draft.md is created returns Pending inputs
  const pendingVerify = captureResponse({
    jsonrpc: '2.0',
    id: 30,
    method: 'tools/call',
    params: {
      name: 'weave_verify',
      arguments: { dir: checkerDir }
    }
  });
  assert.equal(pendingVerify.result.isError, undefined);
  assert.match(pendingVerify.result.content[0].text, /Pending inputs.*: \["\.\.\/writer\/draft\.md"\]/);

  // Create draft.md and verify succeeds
  fs.writeFileSync(path.join(writerDir, 'draft.md'), '# Draft', 'utf-8');
  const okVerify = captureResponse({
    jsonrpc: '2.0',
    id: 31,
    method: 'tools/call',
    params: {
      name: 'weave_verify',
      arguments: { dir: checkerDir }
    }
  });
  assert.equal(okVerify.result.isError, undefined);
  assert.match(okVerify.result.content[0].text, /Verified inputs: \["\.\.\/writer\/draft\.md"\]/);

  fs.rmSync(tmp, { recursive: true, force: true });
});


/**
 * Creates a staged run directory with the given stage folders and an initialized orchestrator weave.md.
 * @param {string[]} stageDirs
 * @param {string} initialStatus
 * @returns {string} run directory path
 */
function createStagedRun(stageDirs, initialStatus) {
  const runDir = createTempDir();
  for (const s of stageDirs) fs.mkdirSync(path.join(runDir, s));
  const initRes = captureResponse({
    jsonrpc: '2.0',
    id: 900,
    method: 'tools/call',
    params: { name: 'weave_init', arguments: { dir: runDir, type: 'orchestrator', status: initialStatus } }
  });
  assert.equal(initRes.result.isError, undefined, initRes.result.content[0].text);
  return runDir;
}

/**
 * Calls weave_update via JSON-RPC and returns the response.
 * @param {Record<string, unknown>} args
 * @returns {Record<string, any>}
 */
function callUpdate(args) {
  return captureResponse({ jsonrpc: '2.0', id: 901, method: 'tools/call', params: { name: 'weave_update', arguments: args } });
}

test('MCP Tool Call - Happy Path: weave_update accepts stage-first awaiting_review with type orchestrator and schema advertises grammar + type', () => {
  const listRes = captureResponse({ jsonrpc: '2.0', id: 32, method: 'tools/list', params: {} });
  const updateTool = listRes.result.tools.find(t => t.name === 'weave_update');
  assert.ok(updateTool);
  assert.match(updateTool.inputSchema.properties.status.description, /awaiting_review/);
  assert.match(updateTool.inputSchema.properties.status.description, /\[<stage>\/\]<state>\[\/<detail>\]/);
  assert.ok(updateTool.inputSchema.properties.type);

  const runDir = createStagedRun(['stage01_editorial', 'stage02_publishing'], 'stage01_editorial/in_progress');
  const reviewRes = callUpdate({
    dir: runDir,
    type: 'orchestrator',
    status: 'stage01_editorial/awaiting_review',
    progress: 'Waiting on user review of 01_editorial_approved.md'
  });
  assert.equal(reviewRes.result.isError, undefined);
  assert.match(reviewRes.result.content[0].text, /WEAVE_UPDATE_OK: status -> stage01_editorial\/awaiting_review/);

  const iterRes = callUpdate({ dir: runDir, type: 'orchestrator', status: 'stage01_editorial/in_progress/iteration_2' });
  assert.equal(iterRes.result.isError, undefined);

  const doneRes = callUpdate({ dir: runDir, type: 'orchestrator', status: 'stage02_publishing/completed' });
  assert.equal(doneRes.result.isError, undefined);

  const readRes = captureResponse({
    jsonrpc: '2.0',
    id: 35,
    method: 'tools/call',
    params: { name: 'weave_read', arguments: { dir: runDir } }
  });
  assert.equal(JSON.parse(readRes.result.content[0].text).status, 'stage02_publishing/completed');

  fs.rmSync(runDir, { recursive: true, force: true });
});

test('MCP Failure Path 12: weave_update with stage-first awaiting_review and missing outputs returns isError: true', () => {
  const runDir = createStagedRun(['stage01_editorial'], 'stage01_editorial/in_progress');
  const res = callUpdate({ dir: runDir, type: 'orchestrator', status: 'stage01_editorial/awaiting_review', outputs: 'nonexistent.md' });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /CRITICAL: Output file does not exist on disk/);
  fs.rmSync(runDir, { recursive: true, force: true });
});

test('MCP Failure Path 13: weave_update with unapproved pending_review state returns isError: true', () => {
  const runDir = createStagedRun(['stage01_editorial'], 'stage01_editorial/in_progress');
  const res = callUpdate({ dir: runDir, type: 'orchestrator', status: 'stage01_editorial/pending_review' });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /CRITICAL: Invalid status state/);
  fs.rmSync(runDir, { recursive: true, force: true });
});

test('MCP Failure Path 14 (Issue #8 repro): subagent weave_update with task slug against root orchestrator weave.md is rejected and leaves it untouched', () => {
  const runDir = createStagedRun(['stage01_setup', 'stage02_concept', 'stage03_writing'], 'stage01_setup/in_progress');
  const before = fs.readFileSync(path.join(runDir, 'weave.md'), 'utf-8');

  const res = callUpdate({ dir: runDir, status: 'in_progress/03_research', progress: 'Researching era' });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /CRITICAL: Refusing to update orchestrator weave\.md/);
  assert.match(res.result.content[0].text, /assigned working directory/);

  const bareCompleted = callUpdate({ dir: runDir, status: 'completed' });
  assert.equal(bareCompleted.result.isError, true);

  assert.equal(fs.readFileSync(path.join(runDir, 'weave.md'), 'utf-8'), before);
  fs.rmSync(runDir, { recursive: true, force: true });
});

test('MCP Failure Path 15: weave_update type mismatch and invalid type return isError: true', () => {
  const agentDir = path.join(createTempDir(), 'writer');
  captureResponse({ jsonrpc: '2.0', id: 40, method: 'tools/call', params: { name: 'weave_init', arguments: { dir: agentDir } } });

  const mismatch = callUpdate({ dir: agentDir, type: 'orchestrator', status: 'in_progress' });
  assert.equal(mismatch.result.isError, true);
  assert.match(mismatch.result.content[0].text, /CRITICAL: Type mismatch/);

  const invalid = callUpdate({ dir: agentDir, type: 'supervisor', status: 'in_progress' });
  assert.equal(invalid.result.isError, true);
  assert.match(invalid.result.content[0].text, /CRITICAL: options\.type must be one of/);

  fs.rmSync(path.dirname(agentDir), { recursive: true, force: true });
});

test('MCP Tool Call - Happy Path: weave_update and weave_read support optional mirror_to for zero-token deliverable copy', () => {
  const listRes = captureResponse({ jsonrpc: '2.0', id: 41, method: 'tools/list', params: {} });
  const updateTool = listRes.result.tools.find(t => t.name === 'weave_update');
  const readTool = listRes.result.tools.find(t => t.name === 'weave_read');
  assert.ok(updateTool.inputSchema.properties.mirror_to);
  assert.ok(readTool.inputSchema.properties.mirror_to);

  const runDir = createStagedRun(['stage01_editorial'], 'stage01_editorial/in_progress');
  fs.writeFileSync(path.join(runDir, '01_draft.md'), '# Draft Content', 'utf-8');

  const mirrorPath1 = path.join(runDir, 'review_artifacts', '01_draft.md');
  const updRes = callUpdate({
    dir: runDir,
    type: 'orchestrator',
    status: 'stage01_editorial/awaiting_review',
    outputs: '01_draft.md',
    progress: 'Awaiting review of 01_draft.md',
    mirror_to: mirrorPath1
  });
  assert.equal(updRes.result.isError, undefined, updRes.result.content[0].text);
  assert.match(updRes.result.content[0].text, /Mirrored:/);
  assert.equal(fs.readFileSync(mirrorPath1, 'utf-8'), '# Draft Content');

  const mirrorPath2 = path.join(runDir, 'review_artifacts_2', '01_draft_read.md');
  const readRes = captureResponse({
    jsonrpc: '2.0',
    id: 42,
    method: 'tools/call',
    params: {
      name: 'weave_read',
      arguments: {
        dir: runDir,
        expected_outputs: '01_draft.md',
        expected_status: 'stage01_editorial/awaiting_review',
        mirror_to: mirrorPath2
      }
    }
  });
  assert.equal(readRes.result.isError, undefined, readRes.result.content[0].text);
  const parsed = JSON.parse(readRes.result.content[0].text);
  assert.deepEqual(parsed.mirrored_files, [path.resolve(mirrorPath2)]);
  assert.equal(fs.readFileSync(mirrorPath2, 'utf-8'), '# Draft Content');

  fs.rmSync(runDir, { recursive: true, force: true });
});

test('MCP Failure Path 16: mirror_to rejects relative paths and empty outputs on weave_update and weave_read', () => {
  const runDir = createStagedRun(['stage01_editorial'], 'stage01_editorial/in_progress');

  const relUpd = callUpdate({
    dir: runDir,
    type: 'orchestrator',
    status: 'stage01_editorial/awaiting_review',
    mirror_to: 'relative/copy.md'
  });
  assert.equal(relUpd.result.isError, true);
  assert.match(relUpd.result.content[0].text, /CRITICAL: mirror_to must be an absolute path/);

  const emptyRead = captureResponse({
    jsonrpc: '2.0',
    id: 43,
    method: 'tools/call',
    params: {
      name: 'weave_read',
      arguments: { dir: runDir, mirror_to: path.join(runDir, 'out.md') }
    }
  });
  assert.equal(emptyRead.result.isError, true);
  assert.match(emptyRead.result.content[0].text, /CRITICAL: mirror_to requires at least one verified output file/);

  fs.rmSync(runDir, { recursive: true, force: true });
});

test('MCP Tool Call - Happy Path (R8): weave_read supports batch stage_dir and dirs with compact 1-line-per-agent JSON summary', () => {
  const listRes = captureResponse({ jsonrpc: '2.0', id: 50, method: 'tools/list', params: {} });
  const readTool = listRes.result.tools.find(t => t.name === 'weave_read');
  assert.ok(readTool.inputSchema.properties.dirs);
  assert.ok(readTool.inputSchema.properties.stage_dir);

  const tmp = createTempDir();
  const stageDir = path.join(tmp, 'runs', 'show_r8', 'stage03_writing');
  const fc1 = path.join(stageDir, 'agents', 'factchecker_01');
  const fc2 = path.join(stageDir, 'agents', 'factchecker_02');

  captureResponse({
    jsonrpc: '2.0',
    id: 51,
    method: 'tools/call',
    params: { name: 'weave_init', arguments: { dir: fc1, status: 'initialized', outputs: ['audit.md'] } }
  });
  captureResponse({
    jsonrpc: '2.0',
    id: 52,
    method: 'tools/call',
    params: { name: 'weave_init', arguments: { dir: fc2, status: 'initialized', outputs: ['audit.md'] } }
  });

  fs.writeFileSync(path.join(fc1, 'audit.md'), '# Audit 1\n', 'utf-8');
  fs.writeFileSync(path.join(fc2, 'audit.md'), '# Audit 2\n', 'utf-8');
  callUpdate({ dir: fc1, status: 'completed', outputs: 'audit.md', progress: 'verdict: PASS — clean' });
  callUpdate({ dir: fc2, status: 'completed', outputs: 'audit.md', progress: 'verdict: FAIL — 1 issue' });

  const stageRes = captureResponse({
    jsonrpc: '2.0',
    id: 53,
    method: 'tools/call',
    params: {
      name: 'weave_read',
      arguments: { stage_dir: stageDir, expected_status: 'completed' }
    }
  });
  assert.equal(stageRes.result.isError, undefined, stageRes.result.content[0].text);
  const rawText = stageRes.result.content[0].text;
  // Compact 1-line-per-agent formatting check
  const agentLines = rawText.split('\n').filter(l => l.trim().startsWith('{"agent_id":'));
  assert.equal(agentLines.length, 2);

  const parsedStage = JSON.parse(rawText);
  assert.equal(parsedStage.all_completed, true);
  assert.equal(parsedStage.verified, true);
  assert.equal(parsedStage.total_agents, 2);
  assert.equal(parsedStage.agents[0].verdict, 'PASS');
  assert.equal(parsedStage.agents[1].verdict, 'FAIL');

  const dirsRes = captureResponse({
    jsonrpc: '2.0',
    id: 54,
    method: 'tools/call',
    params: {
      name: 'weave_read',
      arguments: { dirs: [fc2, fc1], expected_status: 'completed', expected_outputs: 'audit.md' }
    }
  });
  assert.equal(dirsRes.result.isError, undefined, dirsRes.result.content[0].text);
  const parsedDirs = JSON.parse(dirsRes.result.content[0].text);
  assert.equal(parsedDirs.all_completed, true);
  assert.equal(parsedDirs.verified, true);
  assert.deepEqual(parsedDirs.agents.map(a => a.agent_id), ['factchecker_02', 'factchecker_01']);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('MCP Failure Paths 17 & 18 (R8): weave_read rejects mutually-exclusive dir/dirs/stage_dir, mirror_to in batch mode, and formatBatchReadResult validates input', () => {
  const tmp = createTempDir();

  const bothRes = captureResponse({
    jsonrpc: '2.0',
    id: 55,
    method: 'tools/call',
    params: {
      name: 'weave_read',
      arguments: { dir: tmp, stage_dir: tmp }
    }
  });
  assert.equal(bothRes.result.isError, true);
  assert.match(bothRes.result.content[0].text, /CRITICAL: Provide exactly one of 'dir', 'dirs', or 'stage_dir'/);

  const mirrorBatchRes = captureResponse({
    jsonrpc: '2.0',
    id: 56,
    method: 'tools/call',
    params: {
      name: 'weave_read',
      arguments: { dirs: [tmp], mirror_to: path.join(tmp, 'copy') }
    }
  });
  assert.equal(mirrorBatchRes.result.isError, true);
  assert.match(mirrorBatchRes.result.content[0].text, /CRITICAL: 'mirror_to' is only supported for single-directory weave_read/);

  assert.throws(() => formatBatchReadResult(null), {
    name: 'TypeError',
    message: /CRITICAL: batchRes must be a valid BatchWeaveReadResult object/
  });
  assert.throws(() => formatBatchReadResult({ all_completed: true }), {
    name: 'TypeError',
    message: /CRITICAL: batchRes must be a valid BatchWeaveReadResult object/
  });

  fs.rmSync(tmp, { recursive: true, force: true });
});
