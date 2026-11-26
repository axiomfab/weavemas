import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isPathWithinRoot, resolveSafeMediaPath } from '../sidecars/panel/lib/input_verifier.mjs';
import { executeStatusUpdate } from '../sidecars/panel/lib/status_tool.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Security Hygiene (#18) - .gitignore excludes secrets, local Solony runtime state, and temp/bytecode files', () => {
  const gitignorePath = path.join(REPO_ROOT, '.gitignore');
  assert.equal(fs.existsSync(gitignorePath), true, '.gitignore must exist at repository root');
  const content = fs.readFileSync(gitignorePath, 'utf8');

  const requiredPatterns = [
    'node_modules/',
    'runs/',
    'output/',
    'tmp/',
    '.solony/',
    '.env',
    '.env.*',
    '*.pem',
    '*.key',
    '*.pfx',
    'id_rsa*',
    '__pycache__/',
    '*.py[cod]'
  ];

  for (const pat of requiredPatterns) {
    assert.equal(
      content.includes(pat),
      true,
      `.gitignore must include exclusion pattern '${pat}'`
    );
  }
});

test('Security Hygiene (#18) - Tracked repository files contain zero secrets, private keys, or hardcoded local user paths', () => {
  const trackedRaw = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' });
  const trackedFiles = trackedRaw.split(/\r?\n/).filter(Boolean);
  assert.ok(trackedFiles.length > 0, 'Repository must have tracked files');

  const forbiddenPathRegex = /(^|\/)\.env(\.|$)|\.(pem|key|pfx|p12|pyc)$|(^|\/)id_(rsa|ed25519)|^\.solony\//i;
  const secretContentRegex = /\b(AIza[0-9A-Za-z\-_]{20,}|gh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}|sk-[A-Za-z0-9\-_]{20,}|lin_api_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b|-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
  const localUserPathRegex = /(?:[A-Za-z]:[/\\]+Users[/\\]+(?![.\s])|\/Users\/[A-Za-z0-9._-]+|\/home\/[A-Za-z0-9._-]+)/;

  for (const rel of trackedFiles) {
    assert.equal(
      forbiddenPathRegex.test(rel),
      false,
      `Forbidden sensitive or runtime file tracked in git: ${rel}`
    );

    if (rel === 'tests/test_security_audit.mjs') continue;

    const abs = path.join(REPO_ROOT, rel);
    const buf = fs.readFileSync(abs);
    if (buf.subarray(0, 4096).includes(0)) continue;

    const text = buf.toString('utf8');
    assert.equal(
      secretContentRegex.test(text),
      false,
      `Potential secret or private key header detected in ${rel}`
    );
    assert.equal(
      localUserPathRegex.test(text),
      false,
      `Hardcoded local user directory path detected in ${rel}`
    );
  }
});

test('Sidecar Security (#18) - RuntimeTracker.formatHumanLogBody escapes HTML in log lines, slugs, and progress notes', () => {
  const trackerPath = path.join(REPO_ROOT, 'sidecars', 'panel', 'trackers', 'runtime_tracker.js');
  const code = fs.readFileSync(trackerPath, 'utf8');
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(code, context);
  const { RuntimeTracker } = context.window;

  const maliciousBody = [
    '<img src=x onerror="alert(1)">',
    '- 2026-10-15T10:00:00.000Z: `in_progress/<script>alert(2)</script>` - Reviewing <svg onload="alert(3)">'
  ].join('\n');

  const html = RuntimeTracker.formatHumanLogBody(maliciousBody, Date.parse('2026-10-15T10:00:05.000Z'));
  assert.doesNotMatch(html, /<img\b/i);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /<svg\b/i);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.match(html, /&lt;svg onload=&quot;alert\(3\)&quot;&gt;/);
});

test('Sidecar Security (#18) - executeStatusUpdate blocks path traversal in show, stage, and agent parameters', () => {
  const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemx-sec-ws-'));
  fs.mkdirSync(path.join(tmpWs, 'runs'), { recursive: true });
  try {
    assert.throws(
      () => executeStatusUpdate({ show: '../escape', stage: 'stage01_init', agent: 'writer', status: 'in_progress' }, tmpWs),
      /CRITICAL: Path traversal detected in show parameter/
    );
    assert.throws(
      () => executeStatusUpdate({ show: 'valid_run', stage: '../../escape', agent: 'writer', status: 'in_progress' }, tmpWs),
      /CRITICAL: Path traversal detected in stage parameter/
    );
    assert.throws(
      () => executeStatusUpdate({ show: 'valid_run', stage: 'stage01_init', agent: '../../../escape', status: 'in_progress' }, tmpWs),
      /CRITICAL: Path traversal detected in agent parameter/
    );

    const ok = executeStatusUpdate(
      { show: 'valid_run', stage: 'stage01_init', agent: 'act_1/writer', status: 'in_progress' },
      tmpWs
    );
    assert.equal(isPathWithinRoot(ok.filePath, tmpWs, false), true);
  } finally {
    fs.rmSync(tmpWs, { recursive: true, force: true });
  }
});

test('Sidecar Security (#18) - resolveSafeMediaPath serves in-workspace media and blocks outside-workspace traversal', () => {
  const tmpParent = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemx-sec-media-'));
  const wsDir = path.join(tmpParent, 'workspace');
  const outsideFile = path.join(tmpParent, 'secret.png');
  const ctxDir = path.join(wsDir, 'runs', 'demo_run');
  const agentDir = path.join(ctxDir, 'stage02_pub', 'agents', 'illustrator');

  fs.mkdirSync(agentDir, { recursive: true });
  const validImg = path.join(agentDir, 'illustration.png');
  fs.writeFileSync(validImg, 'PNG_STUB', 'utf8');
  fs.writeFileSync(outsideFile, 'OUTSIDE_SECRET', 'utf8');

  try {
    // Happy paths: nested lookup inside contextDir and explicit in-workspace absolute path
    assert.equal(resolveSafeMediaPath('illustration.png', wsDir, ctxDir), validImg);
    assert.equal(resolveSafeMediaPath(validImg, wsDir, ctxDir), validImg);
    assert.equal(resolveSafeMediaPath('missing.png', wsDir, ctxDir), null);

    // Guard paths: relative traversal and arbitrary host absolute path outside workspaceRoot
    assert.throws(
      () => resolveSafeMediaPath('../../../secret.png', wsDir, ctxDir),
      (err) => err && err.code === 'FORBIDDEN_PATH'
    );
    assert.throws(
      () => resolveSafeMediaPath(outsideFile, wsDir, ctxDir),
      (err) => err && err.code === 'FORBIDDEN_PATH'
    );
  } finally {
    fs.rmSync(tmpParent, { recursive: true, force: true });
  }
});
