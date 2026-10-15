import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const trackerPath = path.resolve(__dirname, '..', 'sidecars', 'panel', 'trackers', 'runtime_tracker.js');
const code = fs.readFileSync(trackerPath, 'utf-8');
const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(code, context);
const RuntimeTracker = context.window.RuntimeTracker;

assert.ok(RuntimeTracker, 'RuntimeTracker should be attached to window');

test('calculateActiveRuntime - Happy Path: correctly accumulates only in_progress intervals across pauses', () => {
  const body = `
# Status Log

- 2026-10-15T10:00:00.000Z: \`not_started\` - Initialized status
- 2026-10-15T10:00:10.000Z: \`in_progress/outline\` - Drafting outline
- 2026-10-15T10:01:10.000Z: \`waiting/sourcer\` - Awaiting sourcer (PAUSED)
- 2026-10-15T10:05:00.000Z: \`in_progress/pacing\` - Resumed pacing
- 2026-10-15T10:06:00.000Z: \`completed\` - Finished concept
`;

  const res = RuntimeTracker.calculateActiveRuntime(body, 'completed');
  // First in_progress: 10:00:10 to 10:01:10 = 60s
  // Waiting: 10:01:10 to 10:05:00 = ignored
  // Second in_progress: 10:05:00 to 10:06:00 = 60s
  // Total active seconds = 120s (2m 0s)
  assert.equal(res.seconds, 120);
  assert.equal(res.isRunning, false);
  assert.equal(res.formatted, '2m 0s');
});

test('calculateActiveRuntime - Happy Path 2: computes live running seconds when currently in_progress', () => {
  const body = `
# Status Log

- 2026-10-15T10:00:00.000Z: \`in_progress/writing\` - Started writing
`;
  // Simulate nowMs being 45 seconds later (10:00:45)
  const nowMs = Date.parse('2026-10-15T10:00:45.000Z');
  const res = RuntimeTracker.calculateActiveRuntime(body, 'in_progress/writing', nowMs);

  assert.equal(res.seconds, 45);
  assert.equal(res.isRunning, true);
  assert.equal(res.formatted, '45s');
});

test('calculateActiveRuntime - Happy Path 3: handles legacy parenthesis slug formatting', () => {
  const body = `
- 2026-10-15T10:00:00.000Z: Pipeline execution initialized (\`in_progress/stage01\`).
- 2026-10-15T10:00:30.000Z: \`completed\` - Done
`;
  const res = RuntimeTracker.calculateActiveRuntime(body, 'completed');
  assert.equal(res.seconds, 30);
  assert.equal(res.isRunning, false);
});

test('calculateActiveRuntime - Failure Path 1: null, undefined, or empty body returns 0s and isRunning=false', () => {
  for (const emptyVal of [null, undefined, '']) {
    const res = RuntimeTracker.calculateActiveRuntime(emptyVal, 'in_progress/test');
    assert.equal(res.seconds, 0);
    assert.equal(res.isRunning, false);
    assert.equal(res.formatted, '0s');
  }
});

test('calculateActiveRuntime - Failure Path 2: non-string body returns 0s and isRunning=false', () => {
  for (const nonStringVal of [12345, {}, []]) {
    const res = RuntimeTracker.calculateActiveRuntime(nonStringVal, 'in_progress/test');
    assert.equal(res.seconds, 0);
    assert.equal(res.isRunning, false);
    assert.equal(res.formatted, '0s');
  }
});

test('calculateActiveRuntime - Failure Path 3: status without any in_progress states returns 0s', () => {
  const body = `
# Status Log

- 2026-10-15T10:00:00.000Z: \`not_started\` - Initialized status
- 2026-10-15T10:05:00.000Z: \`waiting/approval\` - Awaiting user approval
`;
  const res = RuntimeTracker.calculateActiveRuntime(body, 'waiting/approval');
  assert.equal(res.seconds, 0);
  assert.equal(res.isRunning, false);
  assert.equal(res.formatted, '0s');
});

test('formatRuntime - Formats durations correctly across ranges', () => {
  assert.equal(RuntimeTracker.formatRuntime(0), '0s');
  assert.equal(RuntimeTracker.formatRuntime(45), '45s');
  assert.equal(RuntimeTracker.formatRuntime(60), '1m 0s');
  assert.equal(RuntimeTracker.formatRuntime(125), '2m 5s');
  assert.equal(RuntimeTracker.formatRuntime(3665), '1h 1m 5s');
  assert.equal(RuntimeTracker.formatRuntime(-10), '0s');
});

test('getRuntimeBadgeHtml - Generates proper badge HTML for running and stopped states', () => {
  const runningBody = `- 2026-10-15T10:00:00.000Z: \`in_progress/test\` - Work`;
  const nowMs = Date.parse('2026-10-15T10:00:15.000Z');
  const runningHtml = RuntimeTracker.getRuntimeBadgeHtml(runningBody, 'in_progress/test', nowMs);
  assert.match(runningHtml, /data-running-timer/);
  assert.match(runningHtml, /15s/);
  assert.match(runningHtml, /\(running\)/);

  const stoppedBody = `
- 2026-10-15T10:00:00.000Z: \`in_progress/test\` - Work
- 2026-10-15T10:00:20.000Z: \`completed\` - Done
`;
  const stoppedHtml = RuntimeTracker.getRuntimeBadgeHtml(stoppedBody, 'completed');
  assert.doesNotMatch(stoppedHtml, /data-running-timer/);
  assert.match(stoppedHtml, /20s/);
  assert.doesNotMatch(stoppedHtml, /\(running\)/);
});
