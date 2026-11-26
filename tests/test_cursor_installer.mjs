import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  AGY_EXCLUSIVE_IDENTIFIERS,
  parseAdapterFrontmatter
} from '../src/adapter_builder.mjs';
import {
  CURSOR_MCP_SERVER_NAME,
  buildCursorMcpServerEntry,
  mergeCursorMcpConfig,
  installCursorAdapter
} from '../src/cursor_installer.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALLER_SCRIPT = path.join(REPO_ROOT, 'scripts', 'install-cursor.mjs');

/**
 * Lightweight newline-delimited JSON-RPC client for driving `src/mcp_server.mjs` over stdio.
 */
function startMcpClient(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '';
  let nextId = 1;
  const pending = new Map();

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(`JSON-RPC error ${msg.error.code}: ${msg.error.message}`));
        } else {
          resolve(msg.result);
        }
      }
    }
  });

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  async function callTool(name, toolArgs) {
    const res = await send('tools/call', { name, arguments: toolArgs });
    assert.equal(Boolean(res.isError), false, `MCP tool '${name}' returned error: ${JSON.stringify(res)}`);
    return res.content?.[0]?.text || '';
  }

  function close() {
    if (child.exitCode !== null || child.killed) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      child.once('close', () => resolve());
      child.stdin.end();
      child.kill();
    });
  }

  return { send, callTool, close };
}

test('Cursor Installer (#25) - Happy Path: installs valid .mdc rules, agents, and .cursor/mcp.json with zero agy leaks', () => {
  const tmpTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemas-cursor-fresh-'));
  try {
    const res = installCursorAdapter({ repoRoot: REPO_ROOT, targetDir: tmpTarget });
    assert.equal(res.harnessId, 'cursor');
    assert.equal(res.mcpStatus, 'created');
    assert.equal(res.adapterFiles.length, 7);

    const expectedRules = [
      '.cursor/rules/weave-orchestrator.mdc',
      '.cursor/rules/weave-agent.mdc',
      '.cursor/rules/weave-authoring.mdc',
      '.cursor/rules/orchestrator-agent-instantiation.mdc',
      '.cursor/rules/orchestrator-agent-execution.mdc'
    ];
    for (const rel of expectedRules) {
      const abs = path.join(tmpTarget, rel);
      assert.equal(fs.existsSync(abs), true, `Expected rule '${rel}' to be installed`);
      const content = fs.readFileSync(abs, 'utf8');
      const { frontmatter, body } = parseAdapterFrontmatter(content);
      assert.equal(frontmatter.alwaysApply, false, `${rel} must set alwaysApply: false`);
      assert.ok(frontmatter.description.length > 10, `${rel} must have a non-empty description`);
      assert.ok(body.trim().length > 0);
      assert.doesNotMatch(content, /\{\{[^}]*\}\}/);

      for (const agyToken of AGY_EXCLUSIVE_IDENTIFIERS) {
        const isIdent = /^[A-Za-z_][A-Za-z0-9_]*$/.test(agyToken);
        const leaked = isIdent
          ? new RegExp(`\\b${agyToken}\\b`).test(content)
          : content.includes(agyToken);
        assert.equal(leaked, false, `Antigravity identifier '${agyToken}' leaked into ${rel}`);
      }
    }

    // Verify stateless disk-backed revision fallback and clickable weave.md links in orchestrator rule
    const orchContent = fs.readFileSync(
      path.join(tmpTarget, '.cursor/rules/weave-orchestrator.mdc'),
      'utf8'
    );
    assert.match(orchContent, /stateless disk-backed fallback/);
    assert.match(orchContent, /\[weave\.md\]\(file:\/\/<workspace_root>\/runs\/<context_slug>\/weave\.md\)/);

    // Verify weave-authoring maps worker agents dir to .cursor/agents
    const authoringContent = fs.readFileSync(
      path.join(tmpTarget, '.cursor/rules/weave-authoring.mdc'),
      'utf8'
    );
    assert.match(authoringContent, /\.cursor\/agents\/<agent_name>\.md/);

    // Verify control-plane agents frontmatter and Cursor tools
    const provisionerPath = path.join(tmpTarget, '.cursor/agents/provisioner.md');
    const stageOrchPath = path.join(tmpTarget, '.cursor/agents/stage_orchestrator.md');
    assert.equal(fs.existsSync(provisionerPath), true);
    assert.equal(fs.existsSync(stageOrchPath), true);

    const provFm = parseAdapterFrontmatter(fs.readFileSync(provisionerPath, 'utf8')).frontmatter;
    assert.equal(provFm.name, 'provisioner');
    assert.equal(provFm.subagent, true);
    assert.deepEqual(provFm.tools, ['read_file', 'mcp_weavemx_weave_weave_init']);

    const stageFm = parseAdapterFrontmatter(fs.readFileSync(stageOrchPath, 'utf8')).frontmatter;
    assert.equal(stageFm.name, 'stage_orchestrator');
    assert.equal(stageFm.subagent, true);
    assert.deepEqual(stageFm.tools, [
      'read_file',
      'mcp_task',
      'mcp_weavemx_weave_weave_discover_agents',
      'mcp_weavemx_weave_weave_update',
      'mcp_weavemx_weave_weave_read'
    ]);

    // Verify .cursor/mcp.json structure
    const mcpJsonPath = path.join(tmpTarget, '.cursor', 'mcp.json');
    assert.equal(fs.existsSync(mcpJsonPath), true);
    const mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
    assert.deepEqual(
      mcpConfig.mcpServers[CURSOR_MCP_SERVER_NAME],
      buildCursorMcpServerEntry(path.join(REPO_ROOT, 'src', 'mcp_server.mjs'))
    );
    assert.equal(mcpConfig.mcpServers[CURSOR_MCP_SERVER_NAME].args[0].includes('\\'), false);
  } finally {
    fs.rmSync(tmpTarget, { recursive: true, force: true });
  }
});

test('Cursor Installer (#25) - Idempotency: repeated runs produce byte-for-byte identical files and unchanged MCP status', () => {
  const tmpTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemas-cursor-idem-'));
  try {
    const first = installCursorAdapter({ repoRoot: REPO_ROOT, targetDir: tmpTarget });
    assert.equal(first.mcpStatus, 'created');

    const snapshot = new Map();
    for (const rel of [...first.adapterFiles, '.cursor/mcp.json']) {
      snapshot.set(rel, fs.readFileSync(path.join(tmpTarget, rel)));
    }

    const second = installCursorAdapter({ repoRoot: REPO_ROOT, targetDir: tmpTarget });
    assert.equal(second.mcpStatus, 'unchanged');

    for (const [rel, beforeBytes] of snapshot.entries()) {
      const afterBytes = fs.readFileSync(path.join(tmpTarget, rel));
      assert.equal(Buffer.compare(beforeBytes, afterBytes), 0, `File '${rel}' drifted across idempotent re-install`);
    }
  } finally {
    fs.rmSync(tmpTarget, { recursive: true, force: true });
  }
});

test('Cursor Installer (#25) - MCP Merge: preserves existing servers and sibling top-level keys without clobbering', () => {
  const tmpTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemas-cursor-merge-'));
  try {
    const existingMcp = {
      inputs: [{ id: 'github_token', type: 'promptString' }],
      mcpServers: {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_PERSONAL_ACCESS_TOKEN: '${input:github_token}' }
        },
        postgres: {
          command: 'uvx',
          args: ['mcp-server-postgres', 'postgres://localhost/app']
        }
      }
    };

    const mcpPath = path.join(tmpTarget, '.cursor', 'mcp.json');
    fs.mkdirSync(path.dirname(mcpPath), { recursive: true });
    fs.writeFileSync(mcpPath, JSON.stringify(existingMcp, null, 2), 'utf8');

    const res = installCursorAdapter({ repoRoot: REPO_ROOT, targetDir: tmpTarget });
    assert.equal(res.mcpStatus, 'updated');

    const merged = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    assert.deepEqual(merged.inputs, existingMcp.inputs);
    assert.deepEqual(merged.mcpServers.github, existingMcp.mcpServers.github);
    assert.deepEqual(merged.mcpServers.postgres, existingMcp.mcpServers.postgres);
    assert.equal(merged.mcpServers[CURSOR_MCP_SERVER_NAME].command, 'node');
    assert.match(merged.mcpServers[CURSOR_MCP_SERVER_NAME].args[0], /src\/mcp_server\.mjs$/);

    // Pure mergeCursorMcpConfig helper must not mutate caller object
    const clonedInput = structuredClone(existingMcp);
    const mergedObj = mergeCursorMcpConfig(clonedInput, path.join(REPO_ROOT, 'src', 'mcp_server.mjs'));
    assert.equal(Object.hasOwn(clonedInput.mcpServers, CURSOR_MCP_SERVER_NAME), false);
    assert.equal(Object.hasOwn(mergedObj.mcpServers, CURSOR_MCP_SERVER_NAME), true);
  } finally {
    fs.rmSync(tmpTarget, { recursive: true, force: true });
  }
});

test('Cursor Installer CLI (#25) - Happy & Failure Paths: --help, --dry-run, positional/--target, and fail-fast guards', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemas-cursor-cli-'));
  try {
    const helpOut = execFileSync(process.execPath, [INSTALLER_SCRIPT, '--help'], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    });
    assert.match(helpOut, /Usage: node scripts\/install-cursor\.mjs/);

    // Dry-run writes nothing
    const dryDir = path.join(tmpRoot, 'dry-project');
    fs.mkdirSync(dryDir);
    const dryOut = execFileSync(process.execPath, [INSTALLER_SCRIPT, '--target', dryDir, '--dry-run'], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    });
    assert.match(dryOut, /\[dry-run\] Installed WeaveMX Cursor adapter/);
    assert.equal(fs.existsSync(path.join(dryDir, '.cursor')), false);

    // Positional target installs cleanly
    const posDir = path.join(tmpRoot, 'pos-project');
    fs.mkdirSync(posDir);
    const posOut = execFileSync(process.execPath, [INSTALLER_SCRIPT, posDir], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    });
    assert.match(posOut, /Rules\s+\(5\)/);
    assert.match(posOut, /Agents\s+\(2\)/);
    assert.equal(fs.existsSync(path.join(posDir, '.cursor', 'mcp.json')), true);

    // Failure: missing target
    assert.throws(
      () => execFileSync(process.execPath, [INSTALLER_SCRIPT], { cwd: REPO_ROOT, stdio: 'pipe' }),
      /CRITICAL: Missing target project directory/
    );

    // Failure: non-existent target dir
    assert.throws(
      () =>
        installCursorAdapter({
          repoRoot: REPO_ROOT,
          targetDir: path.join(tmpRoot, 'does-not-exist')
        }),
      /CRITICAL: Target project directory does not exist/
    );

    // Failure: target is a file
    const fileTarget = path.join(tmpRoot, 'not-a-dir.txt');
    fs.writeFileSync(fileTarget, 'hello', 'utf8');
    assert.throws(
      () => installCursorAdapter({ repoRoot: REPO_ROOT, targetDir: fileTarget }),
      /CRITICAL: Target path is not a directory/
    );

    // Failure: corrupt existing .cursor/mcp.json
    const corruptDir = path.join(tmpRoot, 'corrupt-json');
    fs.mkdirSync(path.join(corruptDir, '.cursor'), { recursive: true });
    fs.writeFileSync(path.join(corruptDir, '.cursor', 'mcp.json'), '{ invalid json', 'utf8');
    assert.throws(
      () => installCursorAdapter({ repoRoot: REPO_ROOT, targetDir: corruptDir }),
      /CRITICAL: Existing .*mcp\.json' contains invalid JSON/
    );

    // Failure: mcpServers is not a plain object
    assert.throws(
      () => mergeCursorMcpConfig({ mcpServers: [] }, path.join(REPO_ROOT, 'src', 'mcp_server.mjs')),
      /CRITICAL: 'mcpServers' must be a non-null plain object/
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('KidsWiki End-to-End Cursor Smoke Test (#25) - drives full 2-stage pipeline + stateless revision loop via .cursor/mcp.json', async () => {
  const tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemas-cursor-kidswiki-'));
  let client;

  try {
    // Copy KidsWiki example and install Cursor adapter into it
    fs.cpSync(path.join(REPO_ROOT, 'examples', 'kidswiki'), tmpWorkspace, { recursive: true });
    const installRes = installCursorAdapter({ repoRoot: REPO_ROOT, targetDir: tmpWorkspace });
    assert.equal(installRes.mcpStatus, 'created');

    // Launch the MCP server using the exact command & args written to .cursor/mcp.json
    const mcpConfig = JSON.parse(
      fs.readFileSync(path.join(tmpWorkspace, '.cursor', 'mcp.json'), 'utf8')
    );
    const serverEntry = mcpConfig.mcpServers[CURSOR_MCP_SERVER_NAME];
    client = startMcpClient(serverEntry.command, serverEntry.args, tmpWorkspace);

    const initRes = await client.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'cursor-smoke-test', version: '1.0.0' }
    });
    assert.equal(initRes.serverInfo.name, 'weave-mcp');

    const toolsRes = await client.send('tools/list');
    const toolNames = toolsRes.tools.map((t) => t.name).sort();
    assert.deepEqual(toolNames, [
      'weave_discover_agents',
      'weave_init',
      'weave_read',
      'weave_update',
      'weave_verify'
    ]);

    // Step 0: Pre-create stage directories & initialize master weave.md
    const runDir = path.join(tmpWorkspace, 'runs', 'kidswiki_rocket_age4');
    const stage1Dir = path.join(runDir, 'stage01_editorial');
    const stage2Dir = path.join(runDir, 'stage02_publishing');
    fs.mkdirSync(stage1Dir, { recursive: true });
    fs.mkdirSync(stage2Dir, { recursive: true });

    await client.callTool('weave_init', {
      dir: runDir,
      type: 'orchestrator',
      status: 'stage01_editorial/in_progress'
    });

    // Stage 1 Phase 1: Provisioner initializes writer, fact_checker, age_checker
    const writerDir = path.join(stage1Dir, 'agents', 'writer');
    const factDir = path.join(stage1Dir, 'agents', 'fact_checker');
    const ageDir = path.join(stage1Dir, 'agents', 'age_checker');

    await client.callTool('weave_init', {
      dir: writerDir,
      type: 'agent',
      status: 'initialized',
      instructions_file: '.agent/agents/stage1_writer.md',
      outputs: ['draft.md: ${RUN_DIR}/01_draft.md']
    });
    await client.callTool('weave_init', {
      dir: factDir,
      type: 'agent',
      status: 'initialized',
      instructions_file: '.agent/agents/stage1_fact_checker.md',
      inputs: ['../writer/draft.md'],
      outputs: ['fact_audit.md']
    });
    await client.callTool('weave_init', {
      dir: ageDir,
      type: 'agent',
      status: 'initialized',
      instructions_file: '.agent/agents/stage1_age_checker.md',
      inputs: ['../writer/draft.md'],
      outputs: ['age_audit.md']
    });

    // Stage 1 Phase 2: Discover agents
    const discovered = await client.callTool('weave_discover_agents', {
      directory: stage1Dir,
      filter_status: 'initialized'
    });
    assert.match(discovered, /writer/);
    assert.match(discovered, /fact_checker/);
    assert.match(discovered, /age_checker/);

    // Writer produces initial draft and promotes to 01_draft.md
    await client.callTool('weave_verify', { dir: writerDir });
    fs.writeFileSync(
      path.join(writerDir, 'draft.md'),
      '# Rocket\n\n![A bright red toy rocket zooming past smiling stars in a dark blue sky.](./02_illustration.png)\n*Zoom goes the rocket!*\n\nRockets use propulsion dynamics to achieve orbital velocity.\n',
      'utf8'
    );
    await client.callTool('weave_update', {
      dir: writerDir,
      status: 'completed',
      outputs: 'draft.md',
      progress: 'Initial draft written'
    });
    assert.equal(fs.existsSync(path.join(runDir, '01_draft.md')), true);

    // Parallel audits: fact_checker passes, age_checker fails (vocabulary too complex for 4yo)
    const factVerify = await client.callTool('weave_verify', { dir: factDir });
    assert.match(factVerify, /draft\.md/);
    fs.writeFileSync(path.join(factDir, 'fact_audit.md'), 'verdict: PASS\nScientifically accurate.\n', 'utf8');
    await client.callTool('weave_update', {
      dir: factDir,
      status: 'completed',
      outputs: 'fact_audit.md',
      progress: 'verdict: PASS — Facts verified'
    });

    await client.callTool('weave_verify', { dir: ageDir });
    fs.writeFileSync(
      path.join(ageDir, 'age_audit.md'),
      'verdict: FAIL\nReplace "propulsion dynamics" and "orbital velocity" with simple words for age 4.\n',
      'utf8'
    );
    await client.callTool('weave_update', {
      dir: ageDir,
      status: 'completed',
      outputs: 'age_audit.md',
      progress: 'verdict: FAIL — Vocabulary too advanced for age 4'
    });

    // Cursor stateless disk-backed revision loop: re-enter writer's existing CWD (no duplicate folder)
    await client.callTool('weave_verify', { dir: writerDir });
    fs.writeFileSync(
      path.join(writerDir, 'draft.md'),
      '# Rocket\n\n![A bright red toy rocket zooming past smiling stars in a dark blue sky.](./02_illustration.png)\n*Zoom goes the rocket!*\n\nA rocket is a big fast ship that pushes fire down to fly high into space!\n',
      'utf8'
    );
    await client.callTool('weave_update', {
      dir: writerDir,
      status: 'completed',
      outputs: 'draft.md',
      progress: 'Revised draft for age 4 readability'
    });

    // Re-run age_checker in its existing CWD -> PASS
    await client.callTool('weave_verify', { dir: ageDir });
    fs.writeFileSync(path.join(ageDir, 'age_audit.md'), 'verdict: PASS\nGreat simple words for age 4.\n', 'utf8');
    await client.callTool('weave_update', {
      dir: ageDir,
      status: 'completed',
      outputs: 'age_audit.md',
      progress: 'verdict: PASS — Revised draft is age-appropriate'
    });

    // Batch verify Stage 1
    const stage1Check = await client.callTool('weave_read', {
      stage_dir: stage1Dir,
      expected_status: 'completed'
    });
    assert.match(stage1Check, /verified.*true/i);

    // Stage 1 User Review Gate -> advance to Stage 2
    await client.callTool('weave_update', {
      dir: runDir,
      type: 'orchestrator',
      status: 'stage01_editorial/awaiting_review',
      progress: 'Awaiting user review of 01_draft.md'
    });
    await client.callTool('weave_update', {
      dir: runDir,
      type: 'orchestrator',
      status: 'stage02_publishing/in_progress',
      progress: '01_draft.md approved; starting illustration'
    });

    // Stage 2: Illustrator reads 01_draft.md via alias and promotes 02_illustration.png
    const illustratorDir = path.join(stage2Dir, 'agents', 'illustrator');
    await client.callTool('weave_init', {
      dir: illustratorDir,
      type: 'agent',
      status: 'initialized',
      instructions_file: '.agent/agents/stage2_illustrator.md',
      inputs: ['draft.md: ${RUN_DIR}/01_draft.md'],
      outputs: ['illustration.png: ${RUN_DIR}/02_illustration.png']
    });

    const illVerify = await client.callTool('weave_verify', { dir: illustratorDir });
    assert.match(illVerify, /01_draft\.md/);

    // Write minimal valid PNG header bytes to illustration.png
    const pngStub = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fs.writeFileSync(path.join(illustratorDir, 'illustration.png'), pngStub);
    await client.callTool('weave_update', {
      dir: illustratorDir,
      status: 'completed',
      outputs: 'illustration.png',
      progress: 'Generated illustration from alt-text prompt'
    });

    const stage2Check = JSON.parse(
      await client.callTool('weave_read', {
        dir: illustratorDir,
        expected_status: 'completed',
        expected_outputs: 'illustration.png'
      })
    );
    assert.equal(stage2Check.status, 'completed');

    await client.callTool('weave_update', {
      dir: runDir,
      type: 'orchestrator',
      status: 'stage02_publishing/completed',
      outputs: path.join(runDir, '02_illustration.png'),
      progress: 'KidsWiki article and illustration complete'
    });

    // Assert final on-disk deliverables & zero duplicate worker folders
    const promotedDraft = fs.readFileSync(path.join(runDir, '01_draft.md'), 'utf8');
    assert.match(promotedDraft, /big fast ship that pushes fire down/);
    assert.equal(fs.existsSync(path.join(runDir, '02_illustration.png')), true);
    assert.deepEqual(fs.readdirSync(path.join(stage1Dir, 'agents')).sort(), [
      'age_checker',
      'fact_checker',
      'writer'
    ]);
    const masterWeave = fs.readFileSync(path.join(runDir, 'weave.md'), 'utf8');
    assert.match(masterWeave, /status:\s*"stage02_publishing\/completed"/);
  } finally {
    if (client) await client.close();
    fs.rmSync(tmpWorkspace, { recursive: true, force: true });
  }
});
