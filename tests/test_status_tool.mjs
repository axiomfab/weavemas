import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');

const statusToolPath = path.resolve(__dirname, '..', 'sidecars', 'panel', 'lib', 'status_tool.mjs');
const { executeStatusUpdate, readStageAgents, readDirectAgents, readAllStagesAgents } = await import(`file://${statusToolPath.replace(/\\/g, '/')}`);

const testShow = 'show_test_status_tool';
const testStage = '02_concept';
const testOutputDir = path.join(workspaceRoot, 'output', testShow);

test.before(() => {
  if (fs.existsSync(testOutputDir)) {
    fs.rmSync(testOutputDir, { recursive: true, force: true });
  }
});

test.after(() => {
  if (fs.existsSync(testOutputDir)) {
    fs.rmSync(testOutputDir, { recursive: true, force: true });
  }
});

test('Happy Path 1: Creates new agent file with flat frontmatter and timestamped content entry', () => {
  const result = executeStatusUpdate(
    {
      show: testShow,
      stage: testStage,
      agent: 'youtube_sourcer',
      status: 'in_progress',
      metadata: {
        progress: '4/10',
        verified_count: 4,
      },
      content: 'Verified first 4 tracks successfully.',
      mode: 'append',
    },
    workspaceRoot
  );

  assert.ok(fs.existsSync(result.filePath));
  assert.equal(result.frontmatter.status, 'in_progress');
  assert.equal(result.frontmatter.progress, '4/10');
  assert.equal(result.frontmatter.verified_count, 4);

  const stageData = readStageAgents(testShow, testStage, workspaceRoot);
  assert.ok(stageData.youtube_sourcer);
  assert.equal(stageData.youtube_sourcer.frontmatter.progress, '4/10');
});

test('Failure Path 1: Throws specific error when required show, stage, or agent are missing', () => {
  assert.throws(
    () => executeStatusUpdate({ stage: testStage, agent: 'showrunner' }, workspaceRoot),
    /CRITICAL: show parameter is required/
  );
});

test('Failure Path 2: Throws specific error on invalid mode value', () => {
  assert.throws(
    () => executeStatusUpdate({ show: testShow, stage: testStage, agent: 'test', mode: 'invalid' }, workspaceRoot),
    /CRITICAL: mode must be 'append' or 'overwrite'/
  );
});

test('Happy Path 2: readStageAgents recursively discovers agents in nested act_id/segment_id/role directories', () => {
  const writingStage = 'stage03_writing';
  const archDir = path.join(testOutputDir, writingStage, 'agents', 'act_1', 'A1_01', 'architect');
  fs.mkdirSync(archDir, { recursive: true });
  fs.writeFileSync(
    path.join(archDir, 'status.md'),
    `---
type: agent
role: stage3_writing/agent_architect
act: "act_1"
segment: "A1_01"
status: completed
deliverable: beats.md
---
### 5 Narrative Beats
1. **Hook**: Opening beat.
`,
    'utf-8'
  );

  const stageData = readStageAgents(testShow, writingStage, workspaceRoot);
  assert.ok(stageData.act_1_A1_01_architect, 'Should discover nested architect agent');
  assert.equal(stageData.act_1_A1_01_architect.frontmatter.status, 'completed');
  assert.equal(stageData.act_1_A1_01_architect.frontmatter.deliverable, 'beats.md');
});

test('Happy Path 3: readStageAgents parses status.md containing UTF-8 BOM with not_started status', () => {
  const writingStage = 'stage03_writing';
  const writerDir = path.join(testOutputDir, writingStage, 'agents', 'act_1', 'A1_01', 'writer');
  fs.mkdirSync(writerDir, { recursive: true });
  // Prepend \uFEFF (UTF-8 BOM)
  const bomContent = '\uFEFF---\ntype: agent\nrole: stage3_writing/agent_writer\nstatus: not_started\ndeliverable: null\n---\nWriter ready.';
  fs.writeFileSync(path.join(writerDir, 'status.md'), bomContent, 'utf-8');

  const stageData = readStageAgents(testShow, writingStage, workspaceRoot);
  assert.ok(stageData.act_1_A1_01_writer, 'Should discover writer agent');
  assert.equal(stageData.act_1_A1_01_writer.frontmatter.status, 'not_started');
  assert.equal(stageData.act_1_A1_01_writer.frontmatter.role, 'stage3_writing/agent_writer');
  assert.equal(stageData.act_1_A1_01_writer.body, 'Writer ready.');
});

test('Happy Path: readStageAgents loads deliverableContent when deliverable file exists', () => {
  const setupStage = 'stage01_setup';
  const dirDir = path.join(testOutputDir, setupStage, 'agents', 'director');
  fs.mkdirSync(dirDir, { recursive: true });
  fs.writeFileSync(
    path.join(dirDir, 'status.md'),
    '---\ntype: agent\nrole: stage1_setup/agent_director\nstatus: completed\ndeliverable: setup.md\n---\nInit done.',
    'utf-8'
  );
  fs.writeFileSync(path.join(dirDir, 'setup.md'), '# Setup Deliverable Content\nPersona: Jack Turner', 'utf-8');

  const stageData = readStageAgents(testShow, setupStage, workspaceRoot);
  assert.ok(stageData.director);
  assert.equal(stageData.director.frontmatter.deliverable, 'setup.md');
  assert.equal(stageData.director.deliverableContent, '# Setup Deliverable Content\nPersona: Jack Turner');
});

test('Failure Path: readStageAgents sets deliverableContent to null when deliverable file does not exist', () => {
  const setupStage = 'stage01_setup';
  const missingDir = path.join(testOutputDir, setupStage, 'agents', 'director_missing');
  fs.mkdirSync(missingDir, { recursive: true });
  fs.writeFileSync(
    path.join(missingDir, 'status.md'),
    '---\ntype: agent\nstatus: in_progress\ndeliverable: nonexistent.md\n---\nWorking...',
    'utf-8'
  );

  const stageData = readStageAgents(testShow, setupStage, workspaceRoot);
  assert.ok(stageData.director_missing);
  assert.equal(stageData.director_missing.deliverableContent, null);
});

test('Failure Path: readStageAgents sets deliverableContent to null when deliverable is null or undefined in frontmatter', () => {
  const setupStage = 'stage01_setup';
  const noDelivDir = path.join(testOutputDir, setupStage, 'agents', 'director_none');
  fs.mkdirSync(noDelivDir, { recursive: true });
  fs.writeFileSync(
    path.join(noDelivDir, 'status.md'),
    '---\ntype: agent\nstatus: in_progress\ndeliverable: null\n---\nNo deliverable yet.',
    'utf-8'
  );

  const stageData = readStageAgents(testShow, setupStage, workspaceRoot);
  assert.ok(stageData.director_none);
  assert.equal(stageData.director_none.deliverableContent, null);
});

test('Happy Path: readDirectAgents discovers agents in stageless pipeline and loads deliverable', () => {
  const stagelessShow = 'show_stageless_test';
  const stagelessDir = path.join(workspaceRoot, 'output', stagelessShow);
  const factcheckerDir = path.join(stagelessDir, 'agents', 'factchecker');
  fs.mkdirSync(factcheckerDir, { recursive: true });
  fs.writeFileSync(
    path.join(factcheckerDir, 'status.md'),
    '---\ntype: agent\nstatus: completed\ndeliverable: audit_report.md\n---\nAudit verified.',
    'utf-8'
  );
  fs.writeFileSync(path.join(factcheckerDir, 'audit_report.md'), '# Verified Claims', 'utf-8');

  try {
    const agents = readDirectAgents(stagelessShow, workspaceRoot);
    assert.ok(agents.factchecker);
    assert.equal(agents.factchecker.frontmatter.status, 'completed');
    assert.equal(agents.factchecker.frontmatter.deliverable, 'audit_report.md');
    assert.equal(agents.factchecker.deliverableContent, '# Verified Claims');

    const allStages = readAllStagesAgents(stagelessShow, workspaceRoot);
    assert.equal(allStages.length, 1);
    assert.equal(allStages[0].num, null);
    assert.equal(allStages[0].name, 'Agents');
    assert.equal(allStages[0].stageDir, 'agents');
    assert.equal(allStages[0].nodes.length, 1);
    assert.equal(allStages[0].nodes[0].id, 'factchecker');
  } finally {
    fs.rmSync(stagelessDir, { recursive: true, force: true });
  }
});

test('Failure Path 1: readDirectAgents throws TypeError on invalid or missing parameters', () => {
  assert.throws(() => readDirectAgents(null, workspaceRoot), /CRITICAL: showDir and workspaceRoot are required strings/);
  assert.throws(() => readDirectAgents('show', null), /CRITICAL: showDir and workspaceRoot are required strings/);
  assert.throws(() => readDirectAgents('', workspaceRoot), /CRITICAL: showDir and workspaceRoot are required strings/);
});

test('Failure Path 2: readDirectAgents returns empty object when agents directory does not exist', () => {
  const emptyShow = 'show_no_agents_test';
  const emptyDir = path.join(workspaceRoot, 'output', emptyShow);
  fs.mkdirSync(emptyDir, { recursive: true });
  try {
    const agents = readDirectAgents(emptyShow, workspaceRoot);
    assert.deepEqual(agents, {});
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
});

