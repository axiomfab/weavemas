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
  assert.match(runningHtml, /text-slate-500/);
  assert.doesNotMatch(runningHtml, /animate-pulse/);
  assert.doesNotMatch(runningHtml, /amber/);

  const stoppedBody = `
- 2026-10-15T10:00:00.000Z: \`in_progress/test\` - Work
- 2026-10-15T10:00:20.000Z: \`completed\` - Done
`;
  const stoppedHtml = RuntimeTracker.getRuntimeBadgeHtml(stoppedBody, 'completed');
  assert.doesNotMatch(stoppedHtml, /data-running-timer/);
  assert.match(stoppedHtml, /20s/);
  assert.match(stoppedHtml, /text-slate-500/);
  assert.doesNotMatch(stoppedHtml, /\(running\)/);
});

test('formatRelativeTime - Happy Path: formats relative times across intervals', () => {
  const nowMs = 1760000000000;
  assert.equal(RuntimeTracker.formatRelativeTime(nowMs - 5000, nowMs), 'just now');
  assert.equal(RuntimeTracker.formatRelativeTime(nowMs - 14000, nowMs), 'just now');
  assert.equal(RuntimeTracker.formatRelativeTime(nowMs - 30000, nowMs), 'a few moments ago');
  assert.equal(RuntimeTracker.formatRelativeTime(nowMs - 59000, nowMs), 'a few moments ago');
  assert.equal(RuntimeTracker.formatRelativeTime(nowMs - 65000, nowMs), '1 minute ago');
  assert.equal(RuntimeTracker.formatRelativeTime(nowMs - 150000, nowMs), '2 minutes ago');
  assert.equal(RuntimeTracker.formatRelativeTime(nowMs - 3650000, nowMs), '1 hour ago');
  assert.equal(RuntimeTracker.formatRelativeTime(nowMs - 7500000, nowMs), '2 hours ago');
  assert.equal(RuntimeTracker.formatRelativeTime(nowMs - 86500000, nowMs), '1 day ago');
  assert.equal(RuntimeTracker.formatRelativeTime(nowMs - 260000000, nowMs), '3 days ago');
});

test('formatRelativeTime - Failure Path 1: handles null, undefined, and empty string', () => {
  assert.equal(RuntimeTracker.formatRelativeTime(null), '');
  assert.equal(RuntimeTracker.formatRelativeTime(undefined), '');
  assert.equal(RuntimeTracker.formatRelativeTime(''), '');
});

test('formatRelativeTime - Failure Path 2: handles invalid date string', () => {
  assert.equal(RuntimeTracker.formatRelativeTime('invalid-date-string'), '');
});

test('tickTimers - Happy Path: updates running timer text with millisecond precision without second skipping', () => {
  const el = {
    attrs: {
      'data-running-timer': '',
      'data-prior-ms': '3000',
      'data-start-ms': '1000000'
    },
    textContent: '3s',
    getAttribute(name) { return this.attrs[name]; }
  };
  const mockRoot = {
    querySelectorAll(selector) {
      if (selector === '[data-running-timer]') return [el];
      return [];
    }
  };

  // At 1002500 (2.5s elapsed): total = 3000 + 2500 = 5500ms -> 5s
  RuntimeTracker.tickTimers(mockRoot, 1002500);
  assert.equal(el.textContent, '5s');

  // At 1003100 (3.1s elapsed): total = 3000 + 3100 = 6100ms -> 6s (advances smoothly without skipping)
  RuntimeTracker.tickTimers(mockRoot, 1003100);
  assert.equal(el.textContent, '6s');
});

test('tickTimers - Failure Path 1: handles legacy attributes or missing data-start-ms without error', () => {
  const el = {
    attrs: {
      'data-running-timer': '',
      'data-base-seconds': '10',
      'data-calc-time': '1000000'
    },
    textContent: '10s',
    getAttribute(name) { return this.attrs[name]; }
  };
  const mockRoot = {
    querySelectorAll(selector) {
      if (selector === '[data-running-timer]') return [el];
      return [];
    }
  };

  RuntimeTracker.tickTimers(mockRoot, 1002000);
  assert.equal(el.textContent, '12s');
});

test('tickTimers - Failure Path 2: handles null root or non-element roots gracefully', () => {
  assert.doesNotThrow(() => RuntimeTracker.tickTimers(null));
  assert.doesNotThrow(() => RuntimeTracker.tickTimers({}));
  assert.doesNotThrow(() => RuntimeTracker.tickTimers(undefined));
});

test('formatHumanLogTime - Happy Path: formats ISO timestamp to localized time string', () => {
  const iso = '2026-10-15T14:30:45.000Z';
  const formatted = RuntimeTracker.formatHumanLogTime(iso);
  assert.ok(formatted);
  assert.match(formatted, /\d{1,2}:\d{2}:\d{2}/);
  assert.doesNotMatch(formatted, /2026-10-15T/);
});

test('formatHumanLogTime - Failure Path: handles null, undefined, or invalid string gracefully', () => {
  assert.equal(RuntimeTracker.formatHumanLogTime(null), '');
  assert.equal(RuntimeTracker.formatHumanLogTime(undefined), '');
  assert.equal(RuntimeTracker.formatHumanLogTime('not-a-date'), 'not-a-date');
});

test('calculateStageRuntime - Happy Path: calculates stage duration across multiple agents', () => {
  const nodes = [
    {
      type: 'agent',
      createdAt: 1000000,
      frontmatter: { status: 'completed', updated_at: new Date(1060000).toISOString() },
      body: '- 2026-10-15T10:00:00.000Z: `in_progress/work` - Work\n- 2026-10-15T10:01:00.000Z: `completed` - Done'
    },
    {
      type: 'agent',
      createdAt: 1030000,
      frontmatter: { status: 'completed', updated_at: new Date(1120000).toISOString() },
      body: '- 2026-10-15T10:00:30.000Z: `in_progress/work` - Work\n- 2026-10-15T10:02:00.000Z: `completed` - Done'
    }
  ];

  const res = RuntimeTracker.calculateStageRuntime(nodes, 1200000);
  assert.equal(res.seconds, 120); // 1120000 - 1000000 = 120000ms = 120s
  assert.equal(res.formatted, '2m 0s');
  assert.equal(res.isRunning, false);
});

test('calculateStageRuntime - Failure Path: empty or non-array nodes returns 0s', () => {
  const resEmpty = RuntimeTracker.calculateStageRuntime([]);
  assert.equal(resEmpty.seconds, 0);
  assert.equal(resEmpty.formatted, '0s');

  const resNull = RuntimeTracker.calculateStageRuntime(null);
  assert.equal(resNull.seconds, 0);
  assert.equal(resNull.formatted, '0s');
});

test('calculateStageRuntime - Happy Path: excludes user input review gaps between agent runs/revisions', () => {
  const nodes = [
    {
      type: 'agent',
      frontmatter: { status: 'completed' },
      body: `
- 2026-10-15T10:00:00.000Z: \`in_progress/drafting\` - Initial drafting
- 2026-10-15T10:02:00.000Z: \`completed\` - Ready for user review
- 2026-10-15T10:20:00.000Z: \`in_progress/revising\` - Applying user feedback
- 2026-10-15T10:22:00.000Z: \`completed\` - Final deliverable completed
`
    }
  ];

  const nowMs = Date.parse('2026-10-15T10:30:00.000Z');
  const res = RuntimeTracker.calculateStageRuntime(nodes, nowMs);
  assert.equal(res.seconds, 240);
  assert.equal(res.formatted, '4m 0s');
  assert.equal(res.isRunning, false);
});

test('calculateStageRuntime - Failure Path 1: does not advance runtime while agent is currently in waiting/user_input', () => {
  const nodes = [
    {
      type: 'agent',
      frontmatter: { status: 'waiting/user_input' },
      body: `
- 2026-10-15T10:00:00.000Z: \`in_progress/outline\` - Drafting outline
- 2026-10-15T10:03:00.000Z: \`waiting/user_input\` - Waiting for user approval
`
    }
  ];

  const nowMs = Date.parse('2026-10-15T10:33:00.000Z');
  const res = RuntimeTracker.calculateStageRuntime(nodes, nowMs);
  assert.equal(res.seconds, 180);
  assert.equal(res.formatted, '3m 0s');
  assert.equal(res.isRunning, false);
});

test('calculateStageRuntime - Failure Path 2: excludes internal waiting intervals during multi-step execution', () => {
  const nodes = [
    {
      type: 'agent',
      frontmatter: { status: 'completed' },
      body: `
- 2026-10-15T10:00:00.000Z: \`in_progress/step1\` - Step 1
- 2026-10-15T10:01:00.000Z: \`waiting/clarification\` - Awaiting user input
- 2026-10-15T10:15:00.000Z: \`in_progress/step2\` - Resuming after input
- 2026-10-15T10:16:00.000Z: \`completed\` - All done
`
    }
  ];

  const nowMs = Date.parse('2026-10-15T10:20:00.000Z');
  const res = RuntimeTracker.calculateStageRuntime(nodes, nowMs);
  assert.equal(res.seconds, 120);
  assert.equal(res.formatted, '2m 0s');
  assert.equal(res.isRunning, false);
});

test('formatHumanLogBody - Happy Path: formats in_progress intervals with exact duration and no duration on other states', () => {
  const body = `
# Status Log

- 2026-10-15T10:00:00.000Z: \`not_started\` - Status initialized
- 2026-10-15T10:00:10.000Z: \`in_progress/outline\` - Drafting outline
- 2026-10-15T10:02:02.000Z: \`waiting/sourcer\` - Awaiting sourcer
- 2026-10-15T10:05:00.000Z: \`completed\` - Finished concept
`;

  const formatted = RuntimeTracker.formatHumanLogBody(body);
  // in_progress/outline from 10:00:10 to 10:02:02 is 112s = 1m 52s
  // Verify bold time, duration, and yellow text color class for in_progress (no boxes)
  assert.match(formatted, /<strong class="text-slate-200 font-bold font-mono">\d{1,2}:\d{2}:\d{2}\s+(?:AM|PM)?<\/strong>\s*<span class="text-slate-400 font-normal">\(1m 52s\)<\/span>/i);
  assert.match(formatted, /text-amber-400 font-bold.*\[in_progress\/outline\]/i);

  // not_started should be slate text and not have duration or boxes
  assert.match(formatted, /text-slate-400 font-medium.*\[not_started\]/i);

  // waiting should be amber text and not have duration or boxes
  assert.match(formatted, /text-amber-300 font-medium.*\[waiting\/sourcer\]/i);

  // completed should be emerald text and not have duration or boxes
  assert.match(formatted, /text-emerald-400 font-semibold.*\[completed\]/i);
  assert.doesNotMatch(formatted, /border/);
  assert.doesNotMatch(formatted, /ago\)/);
});

test('formatHumanLogBody - Happy Path 2: computes live duration for currently active in_progress state', () => {
  const body = `- 2026-10-15T10:00:00.000Z: \`in_progress/task\` - In progress`;
  const nowMs = Date.parse('2026-10-15T10:01:15.000Z'); // 75 seconds later = 1m 15s
  const formatted = RuntimeTracker.formatHumanLogBody(body, nowMs);
  assert.match(formatted, /\(1m 15s\)<\/span>.*\[in_progress\/task\]/);
});

test('formatHumanLogBody - Failure Path: handles null, undefined, or empty string gracefully', () => {
  assert.equal(RuntimeTracker.formatHumanLogBody(null), '');
  assert.equal(RuntimeTracker.formatHumanLogBody(undefined), '');
  assert.equal(RuntimeTracker.formatHumanLogBody(''), '');
});
