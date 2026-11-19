import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  weaveInit,
  weaveUpdate,
  weaveRead,
  weaveReadBatch,
  extractAgentVerdict
} from '../src/status_manager.mjs';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'weavemas-batch-read-test-'));
}

// ---------------------------------------------------------------------------
// extractAgentVerdict ("1-2" Coverage Rule)
// ---------------------------------------------------------------------------

test('extractAgentVerdict - Happy Path: extracts verdict from status detail, latest weave.md log entry, or local .md header without false-positiving on prose', () => {
  const tmp = createTempDir();

  // 1. From status detail
  assert.equal(extractAgentVerdict('completed/pass', '# Status Log\n'), 'PASS');
  assert.equal(extractAgentVerdict('completed/fail', '# Status Log\n'), 'FAIL');
  assert.equal(extractAgentVerdict('completed/revision_required', '# Status Log\n'), 'REVISION_REQUIRED');

  // 2. Latest log entry wins over stale earlier iteration entry
  const multiIterBody = [
    '# factchecker_01 Status',
    '- 2026-11-19T09:00:00.000Z: `completed` - verdict: FAIL — 2 unverified dates',
    '- 2026-11-19T09:05:00.000Z: `in_progress/recheck` - Re-auditing revised draft',
    '- 2026-11-19T09:06:00.000Z: `completed` - verdict: PASS — All dates verified'
  ].join('\n');
  assert.equal(extractAgentVerdict('completed', multiIterBody), 'PASS');

  // 3. Fallback to local .md output header
  const reportPath = path.join(tmp, 'audit_report.md');
  fs.writeFileSync(reportPath, '# Audit Report\n\n**Verdict**: FAIL\n\n- Issue 1: date mismatch.\n', 'utf-8');
  const plainBody = '# factchecker_02 Status\n- 2026-11-19T09:00:00.000Z: `completed` - Completed audit';
  assert.equal(extractAgentVerdict('completed', plainBody, [reportPath]), 'FAIL');

  // 4. Ordinary prose containing "pass" does not false-positive
  const articlePath = path.join(tmp, 'draft.md');
  fs.writeFileSync(articlePath, '# Mountain Pass\n\nTravelers pass through the valley in spring.\n', 'utf-8');
  const writerBody = '# writer Status\n- 2026-11-19T09:00:00.000Z: `completed` - Drafted 500-word article on mountain pass';
  assert.equal(extractAgentVerdict('completed', writerBody, [articlePath]), null);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('extractAgentVerdict - Failure Path 1: non-string status or body throws TypeError', () => {
  assert.throws(() => extractAgentVerdict(null, ''), {
    name: 'TypeError',
    message: /CRITICAL: status must be a string/
  });
  assert.throws(() => extractAgentVerdict('completed', 42), {
    name: 'TypeError',
    message: /CRITICAL: body must be a string/
  });
});

test('extractAgentVerdict - Failure Path 2: non-array localTextFiles throws TypeError', () => {
  assert.throws(() => extractAgentVerdict('completed', '', 'audit.md'), {
    name: 'TypeError',
    message: /CRITICAL: localTextFiles must be an array/
  });
});

// ---------------------------------------------------------------------------
// weaveReadBatch & batch weaveRead ("1-2" Coverage Rule)
// ---------------------------------------------------------------------------

test('weaveReadBatch & weaveRead - Happy Path 1: stage_dir verifies high-fan-out completed agents, extracts verdicts, and promotes outputs', () => {
  const workspaceRoot = createTempDir();
  const runDir = path.join(workspaceRoot, 'runs', 'show_audit');
  const stageDir = path.join(runDir, 'stage03_writing');

  const fc1Dir = path.join(stageDir, 'agents', 'factchecker_01');
  const fc2Dir = path.join(stageDir, 'agents', 'factchecker_02');
  const editorDir = path.join(stageDir, 'agents', 'editor');

  weaveInit(fc1Dir, 'agent', 'initialized', '.agent/agents/fc.md', null, ['audit_report.md']);
  weaveInit(fc2Dir, 'agent', 'initialized', '.agent/agents/fc.md', null, ['audit_report.md']);
  weaveInit(editorDir, 'agent', 'initialized', '.agent/agents/editor.md', null, ['script.md: ${RUN_DIR}/03_script.md']);

  fs.writeFileSync(path.join(fc1Dir, 'audit_report.md'), '# Audit 1\nAll verified.', 'utf-8');
  weaveUpdate(fc1Dir, 'completed', 'verdict: PASS — 10 claims verified', 'audit_report.md', {
    conversationId: '11111111-1111-4111-8111-111111111111'
  });

  fs.writeFileSync(path.join(fc2Dir, 'audit_report.md'), '# Audit 2\n**Verdict:** FAIL\n1 issue.', 'utf-8');
  weaveUpdate(fc2Dir, 'completed', 'Completed shard 2 audit', 'audit_report.md', {
    conversationId: '22222222-2222-4222-8222-222222222222'
  });

  fs.writeFileSync(path.join(editorDir, 'script.md'), '# Master Script', 'utf-8');
  weaveUpdate(editorDir, 'completed', 'Compiled master script', 'script.md');

  const res = weaveRead({ stage_dir: stageDir, expected_status: 'completed' });
  assert.equal(res.all_completed, true);
  assert.equal(res.verified, true);
  assert.equal(res.total_agents, 3);
  assert.equal(res.completed_count, 3);
  assert.equal(res.expected_status, 'completed');
  assert.deepEqual(res.status_mismatches, []);
  assert.deepEqual(res.missing_outputs, []);
  assert.equal(fs.readFileSync(path.join(runDir, '03_script.md'), 'utf-8'), '# Master Script');

  assert.deepEqual(res.agents.map(a => a.agent_id), ['editor', 'factchecker_01', 'factchecker_02']);
  assert.equal(res.agents[0].verdict, null);
  assert.equal(res.agents[0].conversation_id, null);
  assert.equal(res.agents[1].verdict, 'PASS');
  assert.equal(res.agents[1].conversation_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(res.agents[2].verdict, 'FAIL');
  assert.equal(res.agents[2].conversation_id, '22222222-2222-4222-8222-222222222222');

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('weaveReadBatch & weaveRead - Happy Path 2: dirs array reports incomplete agents and missing outputs in one summary without aborting batch', () => {
  const workspaceRoot = createTempDir();
  const runDir = path.join(workspaceRoot, 'runs', 'show_partial');
  const stageDir = path.join(runDir, 'stage07_subtitles');

  const sub1 = path.join(stageDir, 'agents', 'subtitler_01');
  const sub2 = path.join(stageDir, 'agents', 'subtitler_02');
  const sub3 = path.join(stageDir, 'agents', 'subtitler_03');

  weaveInit(sub1, 'agent', 'initialized', null, null, ['seg_01.srt']);
  weaveInit(sub2, 'agent', 'initialized', null, null, ['seg_02.srt']);
  weaveInit(sub3, 'agent', 'initialized', null, null, ['seg_03.srt']);

  // sub1 completed cleanly
  fs.writeFileSync(path.join(sub1, 'seg_01.srt'), '1\n00:00:00,000 --> 00:00:02,000\nHello\n', 'utf-8');
  weaveUpdate(sub1, 'completed', 'Generated SRT 01', 'seg_01.srt');

  // sub2 blocked mid-run without writing seg_02.srt
  weaveUpdate(sub2, 'blocked/Whisper_error', 'Audio file corrupted');

  // sub3 completed, then seg_03.srt was deleted from disk before verification
  fs.writeFileSync(path.join(sub3, 'seg_03.srt'), 'temp', 'utf-8');
  weaveUpdate(sub3, 'completed', 'Generated SRT 03', 'seg_03.srt');
  fs.unlinkSync(path.join(sub3, 'seg_03.srt'));

  const res = weaveRead([sub1, sub2, sub3], undefined, 'completed');
  assert.equal(res.all_completed, false);
  assert.equal(res.verified, false);
  assert.equal(res.total_agents, 3);
  assert.equal(res.completed_count, 1);
  assert.deepEqual(res.status_mismatches, ['subtitler_02 (blocked/Whisper_error)']);
  assert.deepEqual(res.missing_outputs, ['subtitler_02: seg_02.srt', 'subtitler_03: seg_03.srt']);
  assert.deepEqual(res.agents[0].missing_outputs, []);
  assert.deepEqual(res.agents[1].missing_outputs, ['seg_02.srt']);
  assert.deepEqual(res.agents[2].missing_outputs, ['seg_03.srt']);

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('weaveReadBatch - Failure Path 1: rejects missing, empty, relative, or mutually-exclusive target parameters', () => {
  const tmp = createTempDir();

  assert.throws(() => weaveReadBatch(null), {
    name: 'TypeError',
    message: /CRITICAL: batchConfig must be a plain object/
  });
  assert.throws(() => weaveReadBatch({}), {
    name: 'TypeError',
    message: /CRITICAL: Batch weave_read requires either 'dirs'/
  });
  assert.throws(() => weaveReadBatch({ dirs: [] }), {
    name: 'TypeError',
    message: /CRITICAL: 'dirs' must be a non-empty array/
  });
  assert.throws(() => weaveReadBatch({ dirs: ['relative/agent'] }), {
    name: 'Error',
    message: /CRITICAL: Each entry in 'dirs' must be an absolute path/
  });
  assert.throws(() => weaveReadBatch({ stage_dir: 'relative/stage' }), {
    name: 'Error',
    message: /CRITICAL: 'stage_dir' must be an absolute path/
  });
  assert.throws(() => weaveReadBatch({ dirs: [tmp], stage_dir: tmp }), {
    name: 'Error',
    message: /CRITICAL: Provide exactly one of 'dir', 'dirs', or 'stage_dir'/
  });

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('weaveReadBatch - Failure Path 2: rejects non-existent stage_dir, empty stage_dir, missing weave.md in dirs, and mirror_to in batch mode', () => {
  const tmp = createTempDir();
  const emptyStage = path.join(tmp, 'stage01_empty');
  fs.mkdirSync(emptyStage, { recursive: true });

  assert.throws(() => weaveReadBatch({ stage_dir: path.join(tmp, 'does_not_exist') }), {
    name: 'Error',
    message: /CRITICAL: stage_dir does not exist on disk/
  });
  assert.throws(() => weaveReadBatch({ stage_dir: emptyStage }), {
    name: 'Error',
    message: /CRITICAL: No agent weave\.md workspaces found in stage_dir/
  });
  assert.throws(() => weaveReadBatch({ dirs: [emptyStage] }), {
    name: 'Error',
    message: /CRITICAL: weave\.md not found in directory/
  });
  assert.throws(() => weaveReadBatch({ dirs: [emptyStage], mirror_to: path.join(tmp, 'out') }), {
    name: 'Error',
    message: /CRITICAL: 'mirror_to' is only supported for single-directory weave_read/
  });
  assert.throws(() => weaveReadBatch({ dirs: [emptyStage], expected_status: '   ' }), {
    name: 'TypeError',
    message: /CRITICAL: Expected status must be a non-empty string/
  });

  fs.rmSync(tmp, { recursive: true, force: true });
});
