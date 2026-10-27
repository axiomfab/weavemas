import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { handleMessage } from '../src/mcp_server.mjs';

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
        status: 'in_progress/stage01_setup'
      }
    }
  };
  const initRes = captureResponse(initReq);
  assert.equal(initRes.id, 13);
  assert.match(initRes.result.content[0].text, /WEAVE_INIT_OK/);
  const fileContent = fs.readFileSync(path.join(tmp, 'weave.md'), 'utf-8');
  assert.match(fileContent, /type: "orchestrator"/);
  assert.doesNotMatch(fileContent, /^role:/m);
  assert.match(fileContent, /status: "in_progress\/stage01_setup"/);
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
        inputs: ['../writer/draft.md']
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


