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
  assert.ok(toolNames.includes('status_init'));
  assert.ok(toolNames.includes('status_update'));
  assert.ok(toolNames.includes('status_verify'));
  assert.ok(toolNames.includes('status_read'));
});

test('MCP Tool Call - Happy Path: executes status_init and status_update', () => {
  const tmp = createTempDir();
  // 1. status_init
  const initReq = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'status_init',
      arguments: { dir: tmp, role: 'stage2_concept/agent_showrunner' }
    }
  };
  const initRes = captureResponse(initReq);
  assert.equal(initRes.id, 3);
  assert.match(initRes.result.content[0].text, /STATUS_INIT_OK/);

  // 2. status_verify
  const verifyReq = {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'status_verify',
      arguments: { dir: tmp, expected_role: 'stage2_concept/agent_showrunner' }
    }
  };
  const verifyRes = captureResponse(verifyReq);
  assert.equal(verifyRes.id, 4);
  assert.match(verifyRes.result.content[0].text, /STATUS_VERIFY_OK/);

  // 3. status_update
  const updateReq = {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'status_update',
      arguments: { dir: tmp, status: 'in_progress/outline', progress: 'Outline generated.' }
    }
  };
  const updateRes = captureResponse(updateReq);
  assert.equal(updateRes.id, 5);
  assert.match(updateRes.result.content[0].text, /STATUS_UPDATE_OK: status -> in_progress\/outline/);

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

test('MCP Failure Path 3: status_update validation failure returns isError: true result', () => {
  const tmp = createTempDir();
  const req = {
    jsonrpc: '2.0',
    id: 12,
    method: 'tools/call',
    params: {
      name: 'status_update',
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

test('MCP Tool Call - Happy Path 2: status_init initializes orchestrator node', () => {
  const tmp = createTempDir();
  const initReq = {
    jsonrpc: '2.0',
    id: 13,
    method: 'tools/call',
    params: {
      name: 'status_init',
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
  assert.match(initRes.result.content[0].text, /STATUS_INIT_OK/);
  const fileContent = fs.readFileSync(path.join(tmp, 'status.md'), 'utf-8');
  assert.match(fileContent, /type: "orchestrator"/);
  assert.match(fileContent, /role: "orchestrator"/);
  assert.match(fileContent, /status: "in_progress\/stage01_setup"/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('MCP Failure Path 5: status_init without dir returns isError: true result', () => {
  const req = {
    jsonrpc: '2.0',
    id: 14,
    method: 'tools/call',
    params: {
      name: 'status_init',
      arguments: { role: 'stage1_setup/agent_director' }
    }
  };
  const res = captureResponse(req);
  assert.equal(res.id, 14);
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /CRITICAL: 'dir' argument is required and must be an absolute path/);
});

test('MCP Failure Path 6: status_init with relative dir returns isError: true result', () => {
  const req = {
    jsonrpc: '2.0',
    id: 15,
    method: 'tools/call',
    params: {
      name: 'status_init',
      arguments: { dir: 'relative/dir', role: 'stage1_setup/agent_director' }
    }
  };
  const res = captureResponse(req);
  assert.equal(res.id, 15);
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /CRITICAL: Target directory must be an absolute path/);
});

test('MCP Tool Call - Happy Path 3: status_read returns parsed metadata and deliverable status', () => {
  const tmp = createTempDir();
  handleMessage({
    jsonrpc: '2.0',
    id: 16,
    method: 'tools/call',
    params: {
      name: 'status_init',
      arguments: { dir: tmp, role: 'stage1_setup/agent_director' }
    }
  });

  fs.writeFileSync(path.join(tmp, 'setup.md'), '# Setup content', 'utf-8');
  handleMessage({
    jsonrpc: '2.0',
    id: 17,
    method: 'tools/call',
    params: {
      name: 'status_update',
      arguments: { dir: tmp, status: 'completed', deliverable: 'setup.md', progress: 'Setup completed' }
    }
  });

  const readReq = {
    jsonrpc: '2.0',
    id: 18,
    method: 'tools/call',
    params: {
      name: 'status_read',
      arguments: { dir: tmp, expected_deliverable: 'setup.md', expected_status: 'completed' }
    }
  };
  const readRes = captureResponse(readReq);
  assert.equal(readRes.id, 18);
  assert.equal(readRes.result.isError, undefined);
  const data = JSON.parse(readRes.result.content[0].text);
  assert.equal(data.role, 'stage1_setup/agent_director');
  assert.equal(data.status, 'completed');
  assert.equal(data.deliverable, 'setup.md');
  assert.equal(data.type, 'agent');
  assert.ok(data.updated_at);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('MCP Failure Path 7: status_read without dir returns isError: true result', () => {
  const req = {
    jsonrpc: '2.0',
    id: 19,
    method: 'tools/call',
    params: {
      name: 'status_read',
      arguments: {}
    }
  };
  const res = captureResponse(req);
  assert.equal(res.id, 19);
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /CRITICAL: 'dir' argument is required and must be an absolute path/);
});

test('MCP Failure Path 8: status_read with relative dir returns isError: true result', () => {
  const req = {
    jsonrpc: '2.0',
    id: 20,
    method: 'tools/call',
    params: {
      name: 'status_read',
      arguments: { dir: 'relative/path' }
    }
  };
  const res = captureResponse(req);
  assert.equal(res.id, 20);
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /CRITICAL: Target directory must be an absolute path/);
});

