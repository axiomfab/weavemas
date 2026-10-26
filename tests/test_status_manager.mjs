import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseFrontmatter,
  serializeStatus,
  statusInit,
  statusUpdate,
  statusVerify,
  statusRead,
  ALLOWED_FRONTMATTER_KEYS
} from '../src/status_manager.mjs';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'weavemas-test-'));
}

test('parseFrontmatter - Happy Path: parses valid frontmatter and body', () => {
  const content = '---\ntype: "agent"\nrole: "test_role"\nstatus: "not_started"\n---\nBody content here.';
  const { frontmatter, body } = parseFrontmatter(content);
  assert.equal(frontmatter.type, 'agent');
  assert.equal(frontmatter.role, 'test_role');
  assert.equal(frontmatter.status, 'not_started');
  assert.equal(body.trim(), 'Body content here.');
});

test('parseFrontmatter - Failure Path 1: non-string input throws TypeError', () => {
  assert.throws(() => parseFrontmatter(123), {
    name: 'TypeError',
    message: /CRITICAL: Content must be a string/
  });
});

test('parseFrontmatter - Failure Path 2: null input throws TypeError', () => {
  assert.throws(() => parseFrontmatter(null), {
    name: 'TypeError',
    message: /CRITICAL: Content must be a string/
  });
});

test('serializeStatus - Happy Path: serializes frontmatter object and body', () => {
  const fm = { type: 'agent', status: 'not_started' };
  const res = serializeStatus(fm, 'Initial notes');
  assert.match(res, /---\ntype: "agent"\nstatus: "not_started"\n---/);
  assert.match(res, /Initial notes/);
});

test('serializeStatus - Failure Path 1: null frontmatter throws TypeError', () => {
  assert.throws(() => serializeStatus(null, 'body'), {
    name: 'TypeError',
    message: /CRITICAL: Frontmatter must be a non-null object/
  });
});

test('serializeStatus - Failure Path 2: non-object frontmatter throws TypeError', () => {
  assert.throws(() => serializeStatus('invalid', 'body'), {
    name: 'TypeError',
    message: /CRITICAL: Frontmatter must be a non-null object/
  });
});

test('serializeStatus - Failure Path 3: forbidden frontmatter key throws Error', () => {
  const invalid = {
    type: 'agent',
    status: 'not_started',
    deliverable: null,
    updated_at: new Date().toISOString(),
    role: 'forbidden_role'
  };
  assert.throws(() => serializeStatus(invalid, 'body'), {
    name: 'Error',
    message: /CRITICAL: Forbidden frontmatter key 'role'/
  });
});

test('Frontmatter Contract - Integrity Canary: exactly 6 closed keys', () => {
  const EXPECTED_KEYS = ['deliverable', 'inputs', 'instructions_file', 'status', 'type', 'updated_at'];
  assert.deepEqual(Array.from(ALLOWED_FRONTMATTER_KEYS).sort(), EXPECTED_KEYS);
  assert.equal(ALLOWED_FRONTMATTER_KEYS.size, 6);
});

test('parseFrontmatter & serializeStatus - Happy Path: round-trips multi-line YAML inputs list', () => {
  const fm = {
    type: 'agent',
    status: 'initialized',
    instructions_file: '.agent/agents/factchecker.md',
    inputs: ['../writer/draft.md', '../../prompts/persona.md'],
    deliverable: null,
    updated_at: '2026-10-25T01:50:00.000Z'
  };
  const serialized = serializeStatus(fm, 'Initialized.');
  assert.match(serialized, /inputs:\n  - "\.\.\/writer\/draft\.md"\n  - "\.\.\/\.\.\/prompts\/persona\.md"/);
  const parsed = parseFrontmatter(serialized);
  assert.deepEqual(parsed.frontmatter.inputs, ['../writer/draft.md', '../../prompts/persona.md']);
  assert.equal(parsed.frontmatter.instructions_file, '.agent/agents/factchecker.md');
});

test('statusInit & statusVerify - Happy Path: initializes with inputs and verifies existing input files on disk', () => {
  const tmp = createTempDir();
  const writerDir = path.join(tmp, 'writer');
  const checkerDir = path.join(tmp, 'factchecker');
  fs.mkdirSync(writerDir, { recursive: true });

  // Initialize factchecker before writer/draft.md exists
  const initRes = statusInit(checkerDir, 'agent', 'initialized', '.agent/agents/factchecker.md', ['../writer/draft.md']);
  assert.equal(initRes.success, true);

  // Now writer creates draft.md before factchecker runs statusVerify
  fs.writeFileSync(path.join(writerDir, 'draft.md'), '# Draft Content', 'utf-8');
  const verifyRes = statusVerify(checkerDir, 'factchecker');
  assert.equal(verifyRes.success, true);
  assert.deepEqual(verifyRes.inputs, ['../writer/draft.md']);

  const readRes = statusRead(checkerDir);
  assert.deepEqual(readRes.inputs, ['../writer/draft.md']);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusVerify - Deferred Input Path: places missing input into pending_inputs when file does not exist on disk yet', () => {
  const tmp = createTempDir();
  const checkerDir = path.join(tmp, 'factchecker');
  statusInit(checkerDir, 'agent', 'initialized', '.agent/agents/factchecker.md', ['../writer/missing_draft.md']);

  const res = statusVerify(checkerDir);
  assert.equal(res.success, true);
  assert.deepEqual(res.resolved_inputs, {});
  assert.deepEqual(res.pending_inputs, ['../writer/missing_draft.md']);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusInit - Failure Path: invalid inputs (non-array or empty string item) throws TypeError', () => {
  const tmp = createTempDir();
  assert.throws(() => statusInit(tmp, 'agent', 'initialized', null, 'not-an-array'), {
    name: 'TypeError',
    message: /CRITICAL: inputs must be an array/
  });
  assert.throws(() => statusInit(tmp, 'agent', 'initialized', null, ['valid.md', '   ']), {
    name: 'TypeError',
    message: /CRITICAL: Each entry in inputs must be a non-empty string/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusInit - Happy Path: creates directory and status.md with not_started', () => {
  const tmp = createTempDir();
  const res = statusInit(tmp, 'agent', 'not_started');
  assert.equal(res.success, true);
  assert.equal(fs.existsSync(res.path), true);
  const fileContent = fs.readFileSync(res.path, 'utf-8');
  assert.doesNotMatch(fileContent, /^role:/m);
  assert.match(fileContent, /status: "not_started"/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusInit - Failure Path 1: missing directory throws TypeError', () => {
  assert.throws(() => statusInit('', 'agent'), {
    name: 'TypeError',
    message: /CRITICAL: Target directory must be a non-empty string/
  });
});

test('statusInit - Failure Path 2: invalid type throws TypeError', () => {
  const tmp = createTempDir();
  assert.throws(() => statusInit(tmp, 'unsupported_type'), {
    name: 'TypeError',
    message: /CRITICAL: Type must be either "agent" or "orchestrator"/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusInit - Happy Path without role: initializes agent status when role is omitted', () => {
  const tmp = createTempDir();
  const res = statusInit(tmp);
  assert.equal(res.success, true);
  assert.equal(fs.existsSync(res.path), true);
  const fileContent = fs.readFileSync(res.path, 'utf-8');
  assert.match(fileContent, /type: "agent"/);
  assert.match(fileContent, /status: "not_started"/);
  assert.doesNotMatch(fileContent, /^role:/m);
  fs.rmSync(tmp, { recursive: true, force: true });
});


test('statusInit - Happy Path 2: initializes orchestrator status with custom initial status', () => {
  const tmp = createTempDir();
  const res = statusInit(tmp, 'orchestrator', 'in_progress/stage01_setup');
  assert.equal(res.success, true);
  assert.equal(fs.existsSync(res.path), true);
  const fileContent = fs.readFileSync(res.path, 'utf-8');
  assert.match(fileContent, /type: "orchestrator"/);
  assert.doesNotMatch(fileContent, /^role:/m);
  assert.match(fileContent, /status: "in_progress\/stage01_setup"/);
  assert.match(fileContent, /Pipeline execution initialized/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusInit - Failure Path 3: invalid initialStatus throws TypeError', () => {
  const tmp = createTempDir();
  assert.throws(() => statusInit(tmp, 'orchestrator', ''), {
    name: 'TypeError',
    message: /CRITICAL: Initial status must be a non-empty string/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusUpdate - Happy Path: transitions state and appends progress', () => {
  const tmp = createTempDir();
  statusInit(tmp);
  const res = statusUpdate(tmp, 'in_progress/outline', 'Drafting 5-act arc.', null);
  assert.equal(res.success, true);
  assert.equal(res.status, 'in_progress/outline');
  const fileContent = fs.readFileSync(path.join(tmp, 'status.md'), 'utf-8');
  assert.match(fileContent, /status: "in_progress\/outline"/);
  assert.match(fileContent, /Drafting 5-act arc/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusUpdate - Failure Path 1: invalid status state throws Error', () => {
  const tmp = createTempDir();
  statusInit(tmp);
  assert.throws(() => statusUpdate(tmp, 'random_state', 'note', null), {
    name: 'Error',
    message: /CRITICAL: Invalid status state 'random_state'/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusUpdate - Failure Path 2: completed status without deliverable throws Error', () => {
  const tmp = createTempDir();
  statusInit(tmp);
  assert.throws(() => statusUpdate(tmp, 'completed', 'done', null), {
    name: 'Error',
    message: /CRITICAL: Deliverable path is required when setting status to completed/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusUpdate - Failure Path 3: completed status with non-existent deliverable file throws Error', () => {
  const tmp = createTempDir();
  statusInit(tmp);
  assert.throws(() => statusUpdate(tmp, 'completed', 'done', 'missing_output.md'), {
    name: 'Error',
    message: /CRITICAL: Deliverable file does not exist on disk/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusVerify - Happy Path: confirms matching role and returns status', () => {
  const tmp = createTempDir();
  const agentDir = path.join(tmp, 'agent_showrunner');
  statusInit(agentDir);
  const res = statusVerify(agentDir, 'agent_showrunner');
  assert.equal(res.success, true);
  assert.equal(res.agent_id, 'agent_showrunner');
  assert.equal(res.status, 'not_started');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusVerify - Failure Path 1: role mismatch throws Error', () => {
  const tmp = createTempDir();
  const agentDir = path.join(tmp, 'agent_showrunner');
  statusInit(agentDir);
  assert.throws(() => statusVerify(agentDir, 'agent_director'), {
    name: 'Error',
    message: /CRITICAL: Identity mismatch/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusVerify - Failure Path 2: missing status.md throws Error', () => {
  const tmp = createTempDir();
  assert.throws(() => statusVerify(tmp, 'any_role'), {
    name: 'Error',
    message: /CRITICAL: status.md not found in directory/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusInit - Failure Path 5: relative targetDir throws Error', () => {
  assert.throws(() => statusInit('relative/path'), {
    name: 'Error',
    message: /CRITICAL: Target directory must be an absolute path/
  });
});

test('statusInit - Failure Path: non-string targetDir (array or object) throws TypeError', () => {
  assert.throws(() => statusInit([]), {
    name: 'TypeError',
    message: /CRITICAL: Target directory must be a non-empty string/
  });
  assert.throws(() => statusInit({ items: [] }), {
    name: 'TypeError',
    message: /CRITICAL: Target directory must be a non-empty string/
  });
});

test('statusUpdate - Failure Path 4: relative targetDir throws Error', () => {
  assert.throws(() => statusUpdate('relative/path', 'in_progress/step'), {
    name: 'Error',
    message: /CRITICAL: Target directory must be an absolute path/
  });
});

test('statusVerify - Failure Path 3: relative targetDir throws Error', () => {
  assert.throws(() => statusVerify('relative/path'), {
    name: 'Error',
    message: /CRITICAL: Target directory must be an absolute path/
  });
});

test('statusRead - Happy Path: reads status and matches expected deliverable', () => {
  const tmp = createTempDir();
  statusInit(tmp, 'agent', 'not_started');

  // Verify initial read
  const initial = statusRead(tmp);
  assert.equal(initial.status, 'not_started');
  assert.equal(initial.deliverable, null);
  assert.equal(initial.type, 'agent');
  assert.ok(initial.updated_at);

  // Create deliverable and complete status
  fs.writeFileSync(path.join(tmp, 'setup.md'), '# Creative Setup Deliverable', 'utf-8');
  statusUpdate(tmp, 'completed/setup_ready', 'Finished setup', 'setup.md');

  const completed = statusRead(tmp);
  assert.equal(completed.status, 'completed/setup_ready');
  assert.equal(completed.deliverable, 'setup.md');
  assert.equal(completed.type, 'agent');
  assert.ok(completed.updated_at);

  // Verify with expected deliverable & status matching
  const matched = statusRead(tmp, 'setup.md', 'completed');
  assert.equal(matched.deliverable, 'setup.md');
  assert.equal(matched.status, 'completed/setup_ready');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusRead - Happy Path 2: reads agent status with null deliverable', () => {
  const tmp = createTempDir();
  statusInit(tmp, 'agent', 'not_started');
  // Complete status without deliverable (e.g. auditor)
  statusUpdate(tmp, 'waiting/input', 'Waiting for draft', null);
  const readNull = statusRead(tmp, null);
  assert.equal(readNull.deliverable, null);
  assert.equal(readNull.status, 'waiting/input');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusRead - Failure Path 1: relative targetDir throws Error', () => {
  assert.throws(() => statusRead('relative/path'), {
    name: 'Error',
    message: /CRITICAL: Target directory must be an absolute path/
  });
});

test('statusRead - Failure Path 2: missing status.md throws Error', () => {
  const tmp = createTempDir();
  assert.throws(() => statusRead(tmp), {
    name: 'Error',
    message: /CRITICAL: status.md not found in directory/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusRead - Failure Path 3: non-string targetDir throws TypeError', () => {
  assert.throws(() => statusRead(null), {
    name: 'TypeError',
    message: /CRITICAL: Target directory must be a non-empty string/
  });
});

test('statusRead - Failure Path 4: deliverable mismatch throws Error', () => {
  const tmp = createTempDir();
  statusInit(tmp);
  fs.writeFileSync(path.join(tmp, 'setup.md'), 'content', 'utf-8');
  statusUpdate(tmp, 'completed', 'done', 'setup.md');
  assert.throws(() => statusRead(tmp, 'wrong_name.md'), {
    name: 'Error',
    message: /CRITICAL: Deliverable mismatch/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusInit - Happy Path with instructions_file: serializes instructions_file into frontmatter', () => {
  const tmp = createTempDir();
  const res = statusInit(tmp, 'agent', 'initialized', '.agent/agents/architect.md');
  assert.equal(res.success, true);
  const fileContent = fs.readFileSync(res.path, 'utf-8');
  assert.match(fileContent, /instructions_file: "\.agent\/agents\/architect\.md"/);
  assert.doesNotMatch(fileContent, /^role:/m);
  assert.match(fileContent, /status: "initialized"/);
  const { frontmatter } = parseFrontmatter(fileContent);
  assert.equal(frontmatter.instructions_file, '.agent/agents/architect.md');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusInit - Failure Path with invalid instructions_file: non-string throws TypeError', () => {
  const tmp = createTempDir();
  assert.throws(() => statusInit(tmp, 'agent', 'initialized', 12345), {
    name: 'TypeError',
    message: /CRITICAL: instructions_file must be a non-empty string/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusInit - Failure Path with invalid instructions_file: empty string throws TypeError', () => {
  const tmp = createTempDir();
  assert.throws(() => statusInit(tmp, 'agent', 'initialized', '   '), {
    name: 'TypeError',
    message: /CRITICAL: instructions_file must be a non-empty string/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('3-Tier Input Resolution & Named Inputs - Happy Path: resolves CWD, output/<context_slug>, workspaceRoot, and wildcards', () => {
  const workspaceRoot = createTempDir();
  const contextDir = path.join(workspaceRoot, 'output', 'kidswiki_rocket');
  const stageDir = path.join(contextDir, 'stage02_publishing');
  const writerDir = path.join(stageDir, 'agents', 'writer');
  const illustratorDir = path.join(stageDir, 'agents', 'illustrator');
  const promptsDir = path.join(workspaceRoot, 'prompts');

  fs.mkdirSync(writerDir, { recursive: true });
  fs.mkdirSync(illustratorDir, { recursive: true });
  fs.mkdirSync(promptsDir, { recursive: true });

  const peerDraft = path.join(writerDir, 'draft.md');
  const contextApproved = path.join(contextDir, '01_editorial_approved.md');
  const repoPersona = path.join(promptsDir, 'style_guide.md');
  const beat1 = path.join(writerDir, 'beat_01.md');
  const beat2 = path.join(writerDir, 'beat_02.md');

  fs.writeFileSync(peerDraft, '# Peer Draft', 'utf-8');
  fs.writeFileSync(contextApproved, '# Approved', 'utf-8');
  fs.writeFileSync(repoPersona, '# Style Guide', 'utf-8');
  fs.writeFileSync(beat1, '# Beat 1', 'utf-8');
  fs.writeFileSync(beat2, '# Beat 2', 'utf-8');

  statusInit(illustratorDir, 'agent', 'initialized', '.agent/agents/illustrator.md', [
    'Draft: ../writer/draft.md',
    'Approved Article: 01_editorial_approved.md',
    'prompts/style_guide.md',
    'Beats: ../writer/beat_*.md'
  ]);

  const verifyRes = statusVerify(illustratorDir, 'illustrator');
  assert.equal(verifyRes.success, true);
  assert.equal(verifyRes.resolved_inputs['Draft'], peerDraft);
  assert.equal(verifyRes.resolved_inputs['Approved Article'], contextApproved);
  assert.equal(verifyRes.resolved_inputs['prompts/style_guide.md'], repoPersona);
  assert.deepEqual(verifyRes.resolved_inputs['Beats'], [beat1, beat2]);

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('3-Tier Input Resolution - Boundary Path 1: explicit relative path (../) does not fall through to workspaceRoot and stays in pending_inputs', () => {
  const workspaceRoot = createTempDir();
  const agentDir = path.join(workspaceRoot, 'output', 'ctx', 'stage01', 'agents', 'checker');
  fs.mkdirSync(agentDir, { recursive: true });
  // Create file at workspaceRoot/writer/draft.md, NOT at stage01/agents/writer/draft.md
  fs.mkdirSync(path.join(workspaceRoot, 'writer'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'writer', 'draft.md'), 'wrong tier', 'utf-8');

  statusInit(agentDir, 'agent', 'initialized', null, ['../writer/draft.md']);
  const res = statusVerify(agentDir);
  assert.deepEqual(res.resolved_inputs, {});
  assert.deepEqual(res.pending_inputs, ['../writer/draft.md']);

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('3-Tier Input Resolution - Boundary Path 2: wildcard matching zero files stays in pending_inputs', () => {
  const workspaceRoot = createTempDir();
  const agentDir = path.join(workspaceRoot, 'output', 'ctx', 'agents', 'compiler');
  fs.mkdirSync(agentDir, { recursive: true });

  statusInit(agentDir, 'agent', 'initialized', null, ['Segments: ../writer_*/draft.md']);
  const res = statusVerify(agentDir);
  assert.deepEqual(res.resolved_inputs, {});
  assert.deepEqual(res.pending_inputs, ['Segments: ../writer_*/draft.md']);

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('Deliverable List & Wildcards - Happy Path: statusUpdate and statusRead support array of deliverables and wildcards', () => {
  const tmp = createTempDir();
  statusInit(tmp, 'agent', 'in_progress');
  fs.writeFileSync(path.join(tmp, 'article.md'), '# Article', 'utf-8');
  fs.writeFileSync(path.join(tmp, 'illustration_1.png'), 'PNG1', 'utf-8');
  fs.writeFileSync(path.join(tmp, 'illustration_2.png'), 'PNG2', 'utf-8');

  const updateRes = statusUpdate(tmp, 'completed', 'Generated article and illustrations', ['article.md', 'illustration_*.png']);
  assert.equal(updateRes.success, true);

  const readRes = statusRead(tmp, ['article.md', 'illustration_*.png'], 'completed');
  assert.deepEqual(readRes.deliverable, ['article.md', 'illustration_*.png']);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('Deliverable List & Wildcards - Failure Paths: missing file in deliverable array or empty array throws Error', () => {
  const tmp = createTempDir();
  statusInit(tmp, 'agent', 'in_progress');
  fs.writeFileSync(path.join(tmp, 'article.md'), '# Article', 'utf-8');

  assert.throws(() => statusUpdate(tmp, 'completed', 'Done', []), {
    name: 'TypeError',
    message: /CRITICAL: Deliverable array must contain at least one path/
  });

  assert.throws(() => statusUpdate(tmp, 'completed', 'Done', ['article.md', 'missing_*.png']), {
    name: 'Error',
    message: /CRITICAL: Deliverable file does not exist on disk/
  });

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('Deferred Mid-Stage Inputs - Happy Path: statusVerify succeeds when Turn-1 inputs exist and mid-stage inputs are pending, then resolves on wakeup', () => {
  const workspaceRoot = createTempDir();
  const contextDir = path.join(workspaceRoot, 'output', 'show_test');
  const showrunnerDir = path.join(contextDir, 'stage02_concept', 'agents', 'showrunner');
  const sourcer1Dir = path.join(contextDir, 'stage02_concept', 'agents', 'youtube_sourcers', 'youtube_sourcer_01');

  fs.mkdirSync(showrunnerDir, { recursive: true });
  fs.mkdirSync(sourcer1Dir, { recursive: true });

  const setupFile = path.join(contextDir, '01_setup.md');
  fs.writeFileSync(setupFile, '# Setup', 'utf-8');

  statusInit(showrunnerDir, 'agent', 'initialized', '.agent/agents/stage2_showrunner.md', [
    '01_setup.md',
    '../youtube_sourcers/youtube_sourcer_*/sourced_tracks.md'
  ]);

  // Turn 1: 01_setup.md exists, sourced_tracks.md does not exist yet
  const turn1Res = statusVerify(showrunnerDir, 'showrunner');
  assert.equal(turn1Res.success, true);
  assert.equal(turn1Res.resolved_inputs['01_setup.md'], setupFile);
  assert.deepEqual(turn1Res.pending_inputs, ['../youtube_sourcers/youtube_sourcer_*/sourced_tracks.md']);

  // Mid-stage: youtube_sourcer_01 creates sourced_tracks.md, showrunner wakes up and re-verifies
  const tracksFile = path.join(sourcer1Dir, 'sourced_tracks.md');
  fs.writeFileSync(tracksFile, '# Tracks', 'utf-8');

  const wakeupRes = statusVerify(showrunnerDir, 'showrunner');
  assert.equal(wakeupRes.success, true);
  assert.equal(wakeupRes.resolved_inputs['01_setup.md'], setupFile);
  assert.equal(wakeupRes.resolved_inputs['../youtube_sourcers/youtube_sourcer_*/sourced_tracks.md'], tracksFile);
  assert.deepEqual(wakeupRes.pending_inputs, []);

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('Deferred Mid-Stage Inputs - Zero Initial Inputs Path: statusVerify succeeds when zero declared inputs exist on Turn 1 and returns all in pending_inputs', () => {
  const workspaceRoot = createTempDir();
  const showrunnerDir = path.join(workspaceRoot, 'output', 'show_test', 'stage02_concept', 'agents', 'showrunner');
  fs.mkdirSync(showrunnerDir, { recursive: true });

  statusInit(showrunnerDir, 'agent', 'initialized', '.agent/agents/stage2_showrunner.md', [
    '../youtube_sourcers/youtube_sourcer_*/sourced_tracks.md'
  ]);

  const res = statusVerify(showrunnerDir, 'showrunner');
  assert.equal(res.success, true);
  assert.deepEqual(res.resolved_inputs, {});
  assert.deepEqual(res.pending_inputs, ['../youtube_sourcers/youtube_sourcer_*/sourced_tracks.md']);

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});





