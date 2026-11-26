import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { discoverAgents, readFirst1KB } from '../src/agent_discovery.mjs';
import { weaveInit } from '../src/status_manager.mjs';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'weavemx-discovery-test-'));
}

test('discoverAgents - Happy Path: discovers initialized agents sorted deterministically by agent_id', () => {
  const root = createTempDir();
  const stageDir = path.join(root, 'stage01_setup');
  fs.mkdirSync(stageDir, { recursive: true });

  const agentBDir = path.join(stageDir, 'agents', 'b_writer');
  const agentADir = path.join(stageDir, 'agents', 'a_architect');
  const agentCDir = path.join(stageDir, 'agents', 'c_critic');

  weaveInit(agentBDir, 'agent', 'initialized', '.agent/agents/writer.md', ['../a_architect/beats.md'], ['draft.md: ${RUN_DIR}/02_draft.md']);
  weaveInit(agentADir, 'agent', 'initialized', '.agent/agents/architect.md', ['../../02_concept.md'], ['beats.md']);
  weaveInit(agentCDir, 'agent', 'completed', '.agent/agents/critic.md');

  // Discover with default filter_status = "initialized"
  const res = discoverAgents(stageDir);
  assert.equal(res.total_matching, 2);
  assert.equal(res.returned_count, 2);
  assert.equal(res.remaining_count, 0);
  assert.equal(res.agents.length, 2);

  // Sorted deterministically: a_architect first, then b_writer
  assert.equal(res.agents[0].agent_id, 'a_architect');
  assert.equal(res.agents[0].dir, agentADir);
  assert.equal(res.agents[0].instructions_file, '.agent/agents/architect.md');
  assert.deepEqual(res.agents[0].inputs, ['../../02_concept.md']);
  assert.deepEqual(res.agents[0].outputs, ['beats.md']);
  assert.equal(res.agents[0].conversation_id, null);
  assert.equal(res.agents[0].status, 'initialized');

  assert.equal(res.agents[1].agent_id, 'b_writer');
  assert.equal(res.agents[1].dir, agentBDir);
  assert.equal(res.agents[1].instructions_file, '.agent/agents/writer.md');
  assert.deepEqual(res.agents[1].inputs, ['../a_architect/beats.md']);
  assert.deepEqual(res.agents[1].outputs, ['draft.md: ${RUN_DIR}/02_draft.md']);
  assert.equal(res.agents[1].conversation_id, null);
  assert.equal(res.agents[1].status, 'initialized');

  fs.rmSync(root, { recursive: true, force: true });
});

test('discoverAgents - Happy Path: pagination limits results and sets remaining_count accurately', () => {
  const root = createTempDir();
  const stageDir = path.join(root, 'stage02_writing');
  fs.mkdirSync(stageDir, { recursive: true });

  for (let i = 1; i <= 5; i++) {
    const pad = String(i).padStart(2, '0');
    const agentDir = path.join(stageDir, 'agents', `agent_${pad}`);
    weaveInit(agentDir, 'agent', 'initialized', `.agent/agents/role_${pad}.md`);
  }

  // Slice to limit = 2
  const page1 = discoverAgents(stageDir, 'initialized', 2);
  assert.equal(page1.total_matching, 5);
  assert.equal(page1.returned_count, 2);
  assert.equal(page1.remaining_count, 3);
  assert.equal(page1.agents.length, 2);
  assert.equal(page1.agents[0].agent_id, 'agent_01');
  assert.equal(page1.agents[1].agent_id, 'agent_02');

  fs.rmSync(root, { recursive: true, force: true });
});

test('discoverAgents - Happy Path: custom filter_status finds completed agents', () => {
  const root = createTempDir();
  const stageDir = path.join(root, 'stage03');
  const agentDir = path.join(stageDir, 'agents', 'worker');
  weaveInit(agentDir, 'agent', 'completed', '.agent/agents/worker.md');

  const res = discoverAgents(stageDir, 'completed');
  assert.equal(res.total_matching, 1);
  assert.equal(res.agents[0].agent_id, 'worker');
  assert.equal(res.agents[0].status, 'completed');
  assert.equal(res.agents[0].conversation_id, null);

  fs.rmSync(root, { recursive: true, force: true });
});

test('discoverAgents (R9) - Happy Path: surfaces persisted conversation_id for surgical send_message resumes', () => {
  const root = createTempDir();
  const stageDir = path.join(root, 'stage03_writing');
  const writerDir = path.join(stageDir, 'agents', 'writer');
  const editorDir = path.join(stageDir, 'agents', 'editor');
  const writerUuid = '12345678-1234-4321-8765-abcdefabcdef';

  weaveInit(writerDir, 'agent', 'completed', '.agent/agents/writer.md', null, ['draft.md'], writerUuid);
  weaveInit(editorDir, 'agent', 'completed', '.agent/agents/editor.md');

  const res = discoverAgents(stageDir, null);
  assert.equal(res.total_matching, 2);
  assert.equal(res.agents[0].agent_id, 'editor');
  assert.equal(res.agents[0].conversation_id, null);
  assert.equal(res.agents[1].agent_id, 'writer');
  assert.equal(res.agents[1].conversation_id, writerUuid);

  fs.rmSync(root, { recursive: true, force: true });
});

test('readFirst1KB - Happy Path: reads up to 1024 bytes and preserves frontmatter even with large body', () => {
  const root = createTempDir();
  const testFile = path.join(root, 'large_status.md');
  const largeBody = 'A'.repeat(5000);
  const content = `---\ntype: "agent"\nrole: "architect"\nstatus: "initialized"\n---\n\n${largeBody}`;
  fs.writeFileSync(testFile, content, 'utf-8');

  const first1KB = readFirst1KB(testFile);
  assert.equal(Buffer.byteLength(first1KB, 'utf-8'), 1024);
  assert.match(first1KB, /^---\ntype: "agent"/);

  fs.rmSync(root, { recursive: true, force: true });
});

test('discoverAgents - Failure Path 1: relative directory throws Error', () => {
  assert.throws(() => discoverAgents('relative/stage'), {
    name: 'Error',
    message: /CRITICAL: Directory must be an absolute path/
  });
});

test('discoverAgents - Failure Path 2: non-string directory throws TypeError', () => {
  assert.throws(() => discoverAgents(null), {
    name: 'TypeError',
    message: /CRITICAL: Directory must be a non-empty string/
  });
});

test('discoverAgents - Failure Path 3: non-existent directory throws Error', () => {
  const nonExistent = path.join(os.tmpdir(), 'definitely_non_existent_stage_dir_xyz123');
  assert.throws(() => discoverAgents(nonExistent), {
    name: 'Error',
    message: /CRITICAL: Directory does not exist on disk/
  });
});

test('discoverAgents - Failure Path 4: negative limit throws TypeError', () => {
  const root = createTempDir();
  assert.throws(() => discoverAgents(root, 'initialized', -5), {
    name: 'TypeError',
    message: /CRITICAL: limit must be a non-negative integer/
  });
  fs.rmSync(root, { recursive: true, force: true });
});

test('discoverAgents - Failure Path 5: non-integer limit throws TypeError', () => {
  const root = createTempDir();
  assert.throws(() => discoverAgents(root, 'initialized', 2.5), {
    name: 'TypeError',
    message: /CRITICAL: limit must be a non-negative integer/
  });
  fs.rmSync(root, { recursive: true, force: true });
});

test('discoverAgents - Failure Path 6: invalid filter_status throws TypeError', () => {
  const root = createTempDir();
  assert.throws(() => discoverAgents(root, 12345), {
    name: 'TypeError',
    message: /CRITICAL: filter_status must be a string or null/
  });
  fs.rmSync(root, { recursive: true, force: true });
});
