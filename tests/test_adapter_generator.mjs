import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_TOP_KEYS,
  AGY_EXCLUSIVE_IDENTIFIERS,
  validateHarnessConfig,
  renderTemplate,
  parseAdapterFrontmatter,
  renderHarnessFiles,
  verifyGeneratedAdapter,
  loadHarnessConfigs,
  buildAdapters
} from '../src/adapter_builder.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HARNESSES_DIR = path.join(REPO_ROOT, 'adapters', 'harnesses');
const TEMPLATES_DIR = path.join(REPO_ROOT, 'adapters', 'templates');

test('Adapter Schema & Configs (#24) - Happy Path: schema.json and built-in harness configs are valid and compact', () => {
  const schemaPath = path.join(REPO_ROOT, 'adapters', 'schema.json');
  assert.equal(fs.existsSync(schemaPath), true, 'adapters/schema.json must exist');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(
    Object.keys(schema.properties).sort(),
    Array.from(ALLOWED_TOP_KEYS).sort()
  );

  const configs = loadHarnessConfigs(HARNESSES_DIR);
  const ids = configs.map((c) => c.id);
  assert.deepEqual(ids, ['agy', 'claude-code', 'codex', 'cursor']);

  for (const id of ['claude-code', 'codex', 'cursor']) {
    const raw = fs.readFileSync(path.join(HARNESSES_DIR, `${id}.json`), 'utf8');
    const lineCount = raw.trim().split(/\r?\n/).length;
    assert.ok(
      lineCount <= 35,
      `Expected ${id}.json to stay compact (<= 35 lines), got ${lineCount} lines`
    );
  }
});

test('Antigravity Parity (#24) - Happy Path: agy adapter output is byte-for-byte identical to repository skills and agents', () => {
  const [agyConfig] = loadHarnessConfigs(HARNESSES_DIR, 'agy');
  const sampleExisting = fs.readFileSync(
    path.join(REPO_ROOT, 'skills', 'weave-orchestrator', 'SKILL.md'),
    'utf8'
  );
  const repoEol = sampleExisting.includes('\r\n') ? '\r\n' : '\n';

  const rendered = renderHarnessFiles(agyConfig, { templatesDir: TEMPLATES_DIR, eol: repoEol });
  assert.equal(rendered.length, 9);

  const checkRes = verifyGeneratedAdapter(agyConfig, rendered);
  assert.deepEqual(checkRes, { verified: true, harnessId: 'agy', fileCount: 9 });

  for (const file of rendered) {
    const absPath = path.join(REPO_ROOT, file.relativePath);
    assert.equal(fs.existsSync(absPath), true, `Expected ${file.relativePath} to exist in repository`);
    const diskBytes = fs.readFileSync(absPath);
    const renderedBytes = Buffer.from(file.content, 'utf8');
    assert.equal(
      Buffer.compare(diskBytes, renderedBytes),
      0,
      `Byte-level mismatch between canonical template output and '${file.relativePath}'`
    );
  }

  const driftCheck = buildAdapters({ repoRoot: REPO_ROOT, checkOnly: true });
  assert.equal(driftCheck.harnesses.length, 4);
});

test('Multi-Platform Contracts (#24) - Happy Path: Claude Code, Codex, and Cursor adapters have valid frontmatter and zero agy leaks', () => {
  for (const harnessId of ['claude-code', 'codex', 'cursor']) {
    const [config] = loadHarnessConfigs(HARNESSES_DIR, harnessId);
    const rendered = renderHarnessFiles(config, { templatesDir: TEMPLATES_DIR, eol: '\n' });
    assert.equal(rendered.length, 7, `${harnessId} must emit 5 protocol files + 2 control-plane agents`);

    const verification = verifyGeneratedAdapter(config, rendered);
    assert.equal(verification.verified, true);

    for (const file of rendered) {
      assert.doesNotMatch(file.content, /\{\{[^}]*\}\}/, `Unresolved token in ${harnessId}:${file.relativePath}`);
      for (const agyToken of AGY_EXCLUSIVE_IDENTIFIERS) {
        const isIdent = /^[A-Za-z_][A-Za-z0-9_]*$/.test(agyToken);
        if (isIdent) {
          assert.doesNotMatch(
            file.content,
            new RegExp(`\\b${agyToken}\\b`),
            `Antigravity-only identifier '${agyToken}' leaked into ${harnessId}:${file.relativePath}`
          );
        } else {
          assert.equal(
            file.content.includes(agyToken),
            false,
            `Antigravity-only fragment '${agyToken}' leaked into ${harnessId}:${file.relativePath}`
          );
        }
      }
    }

    if (harnessId === 'claude-code') {
      const stageOrch = rendered.find((f) => f.relativePath === '.claude/agents/stage_orchestrator.md');
      assert.ok(stageOrch);
      const { frontmatter, body } = parseAdapterFrontmatter(stageOrch.content);
      assert.deepEqual(frontmatter.tools, [
        'Read',
        'Task',
        'mcp__weavemx_weave__weave_discover_agents',
        'mcp__weavemx_weave__weave_update',
        'mcp__weavemx_weave__weave_read'
      ]);
      assert.match(body, /Surgical Revision Resume \(`Task`\)/);
      assert.match(body, /resume: "<agentId>"/);
    }

    if (harnessId === 'codex') {
      const stageOrch = rendered.find((f) => f.relativePath === '.codex/agents/stage_orchestrator.md');
      assert.ok(stageOrch);
      const { frontmatter, body } = parseAdapterFrontmatter(stageOrch.content);
      assert.equal(frontmatter.model, 'inherit');
      assert.ok(frontmatter.tools.includes('spawn_agent'));
      assert.match(body, /Stateless Disk-Backed Re-Dispatch via `spawn_agent`/);
    }

    if (harnessId === 'cursor') {
      const orchRule = rendered.find((f) => f.relativePath === '.cursor/rules/weave-orchestrator.mdc');
      assert.ok(orchRule);
      const { frontmatter, body } = parseAdapterFrontmatter(orchRule.content);
      assert.equal(frontmatter.alwaysApply, false);
      assert.match(frontmatter.description, /WeaveMX orchestrator protocol/);
      assert.match(body, /stateless disk-backed fallback/);
    }
  }
});

test('Extensibility (#24) - Happy Path: custom ~25-line Windsurf config renders markdown rules and agents without code changes', () => {
  const windsurfConfig = {
    id: 'windsurf',
    displayName: 'Windsurf Cascade',
    targets: {
      protocolsDir: '.windsurf/rules',
      protocolFormat: 'rule',
      agentsDir: '.windsurf/agents'
    },
    models: { fast: 'fast', inherit: 'inherit' },
    tools: {
      read: 'read_file',
      write: 'write_to_file',
      shell: 'run_command',
      subagent: 'spawn_subagent',
      resume: null
    },
    mcp: {
      style: 'direct',
      serverName: 'weavemx_weave'
    },
    revision: { mode: 'stateless' }
  };

  const rendered = renderHarnessFiles(windsurfConfig, { templatesDir: TEMPLATES_DIR, eol: '\n' });
  const verified = verifyGeneratedAdapter(windsurfConfig, rendered);
  assert.equal(verified.verified, true);
  assert.ok(rendered.some((f) => f.relativePath === '.windsurf/rules/weave-orchestrator.md'));
  assert.ok(rendered.some((f) => f.relativePath === '.windsurf/agents/provisioner.md'));

  const ruleDoc = rendered.find((f) => f.relativePath === '.windsurf/rules/weave-agent.md');
  const { frontmatter } = parseAdapterFrontmatter(ruleDoc.content);
  assert.equal(frontmatter.trigger, 'model_decision');
});

test('CLI Execution (#24) - Happy & Failure Paths: scripts/build-adapters.mjs supports --check, --harness, and --out-dir', () => {
  const scriptPath = path.join(REPO_ROOT, 'scripts', 'build-adapters.mjs');
  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemas-adapters-cli-'));

  try {
    const checkOut = execFileSync(process.execPath, [scriptPath, '--check'], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    });
    assert.match(checkOut, /Verified \[agy\]/);
    assert.match(checkOut, /Verified \[claude-code\]/);

    const singleOutDir = path.join(tmpOut, 'claude-workspace');
    execFileSync(
      process.execPath,
      [scriptPath, '--harness', 'claude-code', '--out-dir', singleOutDir],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    assert.equal(
      fs.existsSync(path.join(singleOutDir, '.claude', 'skills', 'weave-orchestrator', 'SKILL.md')),
      true
    );
    assert.equal(
      fs.existsSync(path.join(singleOutDir, '.claude', 'agents', 'stage_orchestrator.md')),
      true
    );

    const multiOutDir = path.join(tmpOut, 'all-harnesses');
    execFileSync(process.execPath, [scriptPath, '--out-dir', multiOutDir], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    });
    assert.equal(
      fs.existsSync(path.join(multiOutDir, 'cursor', '.cursor', 'rules', 'weave-agent.mdc')),
      true
    );
    assert.equal(
      fs.existsSync(path.join(multiOutDir, 'codex', '.codex', 'skills', 'weave-agent', 'SKILL.md')),
      true
    );

    assert.throws(
      () =>
        execFileSync(process.execPath, [scriptPath, '--harness', 'nonexistent'], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          stdio: 'pipe'
        }),
      /CRITICAL: Unknown harness 'nonexistent'/
    );
  } finally {
    fs.rmSync(tmpOut, { recursive: true, force: true });
  }
});

test('Guard & Failure Paths (#24) - Schema validation, unresolved tokens, agy leaks, and drift detection fail fast', () => {
  const [validClaude] = loadHarnessConfigs(HARNESSES_DIR, 'claude-code');

  // Unknown key in closed schema
  assert.throws(
    () => validateHarnessConfig({ ...validClaude, extraKey: true }),
    /CRITICAL: Unknown key 'extraKey'/
  );

  // Path traversal in target directories
  assert.throws(
    () =>
      validateHarnessConfig({
        ...validClaude,
        targets: { ...validClaude.targets, agentsDir: '../escape' }
      }),
    /CRITICAL: 'targets\.agentsDir' contains invalid path segments/
  );

  // Resume mode missing resume tool or handleKey
  assert.throws(
    () =>
      validateHarnessConfig({
        ...validClaude,
        tools: { ...validClaude.tools, resume: null }
      }),
    /CRITICAL: 'tools\.resume \(required when revision\.mode is "resume"\)' must be a non-empty string/
  );

  // Wrapper style missing wrapperTool
  assert.throws(
    () =>
      validateHarnessConfig({
        ...validClaude,
        mcp: { style: 'wrapper', serverName: 'weavemx_weave' }
      }),
    /CRITICAL: 'mcp\.wrapperTool' must be a non-empty string/
  );

  // Unresolved or unknown template token
  assert.throws(
    () => renderTemplate('Hello {{MISSING_VAR}}', {}),
    /CRITICAL: Unknown template token '\{\{MISSING_VAR\}\}'/
  );
  assert.throws(
    () => renderTemplate('Broken {{bad-token}}', {}),
    /CRITICAL: Unresolved template token '\{\{bad-token\}\}'/
  );

  // Antigravity leak detection on non-agy output
  const cleanRendered = renderHarnessFiles(validClaude, { templatesDir: TEMPLATES_DIR, eol: '\n' });
  const leakedFiles = cleanRendered.map((f, idx) =>
    idx === 0 ? { ...f, content: `${f.content}\nLeaked tool call: invoke_subagent\n` } : f
  );
  assert.throws(
    () => verifyGeneratedAdapter(validClaude, leakedFiles),
    /CRITICAL: Antigravity-only identifier 'invoke_subagent' leaked/
  );

  // Drift detection when an in-repo agy file diverges from canonical template
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemas-drift-check-'));
  try {
    fs.cpSync(path.join(REPO_ROOT, 'adapters'), path.join(tmpRepo, 'adapters'), { recursive: true });
    buildAdapters({ repoRoot: tmpRepo, harnessId: 'agy' });
    const driftedTarget = path.join(tmpRepo, 'agents', 'provisioner.md');
    fs.appendFileSync(driftedTarget, '\n<!-- drifted -->\n', 'utf8');
    assert.throws(
      () => buildAdapters({ repoRoot: tmpRepo, harnessId: 'agy', checkOnly: true }),
      /CRITICAL: Adapter drift detected in 'agents\/provisioner\.md'/
    );
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});
