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
  validateConversationId,
  ALLOWED_FRONTMATTER_KEYS
} from '../src/status_manager.mjs';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'weavemx-test-'));
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
    outputs: [],
    updated_at: new Date().toISOString(),
    role: 'forbidden_role'
  };
  assert.throws(() => serializeStatus(invalid, 'body'), {
    name: 'Error',
    message: /CRITICAL: Forbidden frontmatter key 'role'/
  });
});

test('Frontmatter Contract - Integrity Canary: exactly 7 closed keys', () => {
  const EXPECTED_KEYS = ['conversation_id', 'inputs', 'instructions_file', 'outputs', 'status', 'type', 'updated_at'];
  assert.deepEqual(Array.from(ALLOWED_FRONTMATTER_KEYS).sort(), EXPECTED_KEYS);
  assert.equal(ALLOWED_FRONTMATTER_KEYS.size, 7);
});

test('parseFrontmatter & serializeStatus - Happy Path: round-trips multi-line YAML inputs list', () => {
  const fm = {
    type: 'agent',
    status: 'initialized',
    instructions_file: '.agent/agents/factchecker.md',
    inputs: ['../writer/draft.md', '../../prompts/persona.md'],
    outputs: [],
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

test('statusInit - Happy Path: creates directory and weave.md with not_started', () => {
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


test('statusInit - Happy Path 2: initializes orchestrator status with custom stage-first initial status', () => {
  const tmp = createTempDir();
  fs.mkdirSync(path.join(tmp, 'stage01_setup'));
  const res = statusInit(tmp, 'orchestrator', 'stage01_setup/in_progress');
  assert.equal(res.success, true);
  assert.equal(fs.existsSync(res.path), true);
  const fileContent = fs.readFileSync(res.path, 'utf-8');
  assert.match(fileContent, /type: "orchestrator"/);
  assert.doesNotMatch(fileContent, /^role:/m);
  assert.match(fileContent, /status: "stage01_setup\/in_progress"/);
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
  const fileContent = fs.readFileSync(path.join(tmp, 'weave.md'), 'utf-8');
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

test('statusUpdate - Failure Path 2: completed status without outputs throws Error', () => {
  const tmp = createTempDir();
  statusInit(tmp);
  const res = statusUpdate(tmp, 'completed', 'done', null);
  assert.equal(res.success, true);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusUpdate - Failure Path 3: completed status with non-existent output file throws Error', () => {
  const tmp = createTempDir();
  statusInit(tmp);
  assert.throws(() => statusUpdate(tmp, 'completed', 'done', 'missing_output.md'), {
    name: 'Error',
    message: /CRITICAL: Output file does not exist on disk/
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

test('statusVerify - Failure Path 2: missing weave.md throws Error', () => {
  const tmp = createTempDir();
  assert.throws(() => statusVerify(tmp, 'any_role'), {
    name: 'Error',
    message: /CRITICAL: weave.md not found in directory/
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

test('statusRead - Happy Path: reads status and matches expected outputs', () => {
  const tmp = createTempDir();
  statusInit(tmp, 'agent', 'not_started');

  // Verify initial read
  const initial = statusRead(tmp);
  assert.equal(initial.status, 'not_started');
  assert.deepEqual(initial.outputs, []);
  assert.equal(initial.type, 'agent');
  assert.ok(initial.updated_at);

  // Create output and complete status
  fs.writeFileSync(path.join(tmp, 'setup.md'), '# Creative Setup Deliverable', 'utf-8');
  statusUpdate(tmp, 'completed/setup_ready', 'Finished setup', 'setup.md');

  const completed = statusRead(tmp);
  assert.equal(completed.status, 'completed/setup_ready');
  assert.deepEqual(completed.outputs, ['setup.md']);
  assert.equal(completed.type, 'agent');
  assert.ok(completed.updated_at);

  // Verify with expected outputs & status matching
  const matched = statusRead(tmp, 'setup.md', 'completed');
  assert.deepEqual(matched.outputs, ['setup.md']);
  assert.equal(matched.status, 'completed/setup_ready');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusRead - Happy Path 2: reads agent status with empty outputs', () => {
  const tmp = createTempDir();
  statusInit(tmp, 'agent', 'not_started');
  // Update status without outputs (e.g. waiting)
  statusUpdate(tmp, 'waiting/input', 'Waiting for draft', null);
  const readNull = statusRead(tmp, null);
  assert.deepEqual(readNull.outputs, []);
  assert.equal(readNull.status, 'waiting/input');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusRead - Failure Path 1: relative targetDir throws Error', () => {
  assert.throws(() => statusRead('relative/path'), {
    name: 'Error',
    message: /CRITICAL: Target directory must be an absolute path/
  });
});

test('statusRead - Failure Path 2: missing weave.md throws Error', () => {
  const tmp = createTempDir();
  assert.throws(() => statusRead(tmp), {
    name: 'Error',
    message: /CRITICAL: weave.md not found in directory/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusRead - Failure Path 3: non-string targetDir throws TypeError', () => {
  assert.throws(() => statusRead(null), {
    name: 'TypeError',
    message: /CRITICAL: Target directory must be a non-empty string/
  });
});

test('statusRead - Failure Path 4: outputs mismatch throws Error', () => {
  const tmp = createTempDir();
  statusInit(tmp);
  fs.writeFileSync(path.join(tmp, 'setup.md'), 'content', 'utf-8');
  statusUpdate(tmp, 'completed', 'done', 'setup.md');
  assert.throws(() => statusRead(tmp, 'wrong_name.md'), {
    name: 'Error',
    message: /CRITICAL: Outputs mismatch/
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

test('Strict Input Resolution & Named Inputs - Happy Path: resolves local CWD, explicit relative (../), ${RUN_DIR}, ${PROJECT_DIR}, and wildcards', () => {
  const workspaceRoot = createTempDir();
  const contextDir = path.join(workspaceRoot, 'output', 'kidswiki_rocket');
  const stageDir = path.join(contextDir, 'stage02_publishing');
  const writerDir = path.join(stageDir, 'agents', 'writer');
  const illustratorDir = path.join(stageDir, 'agents', 'illustrator');
  const promptsDir = path.join(workspaceRoot, 'prompts');

  fs.mkdirSync(writerDir, { recursive: true });
  fs.mkdirSync(illustratorDir, { recursive: true });
  fs.mkdirSync(promptsDir, { recursive: true });

  const localBrief = path.join(illustratorDir, 'brief.md');
  const peerDraft = path.join(writerDir, 'draft.md');
  const contextApproved = path.join(contextDir, '01_editorial_approved.md');
  const repoPersona = path.join(promptsDir, 'style_guide.md');
  const beat1 = path.join(writerDir, 'beat_01.md');
  const beat2 = path.join(writerDir, 'beat_02.md');

  fs.writeFileSync(localBrief, '# Local Brief', 'utf-8');
  fs.writeFileSync(peerDraft, '# Peer Draft', 'utf-8');
  fs.writeFileSync(contextApproved, '# Approved', 'utf-8');
  fs.writeFileSync(repoPersona, '# Style Guide', 'utf-8');
  fs.writeFileSync(beat1, '# Beat 1', 'utf-8');
  fs.writeFileSync(beat2, '# Beat 2', 'utf-8');

  statusInit(illustratorDir, 'agent', 'initialized', '.agent/agents/illustrator.md', [
    'brief.md',
    'Draft: ../writer/draft.md',
    'Approved Article: ${RUN_DIR}/01_editorial_approved.md',
    '${PROJECT_DIR}/prompts/style_guide.md',
    'Beats: ../writer/beat_*.md'
  ]);

  const verifyRes = statusVerify(illustratorDir, 'illustrator');
  assert.equal(verifyRes.success, true);
  assert.equal(verifyRes.resolved_inputs['brief.md'], localBrief);
  assert.equal(verifyRes.resolved_inputs['Draft'], peerDraft);
  assert.equal(verifyRes.resolved_inputs['Approved Article'], contextApproved);
  assert.equal(verifyRes.resolved_inputs[`${workspaceRoot}/prompts/style_guide.md`], repoPersona);
  assert.deepEqual(verifyRes.resolved_inputs['Beats'], [beat1, beat2]);
  assert.deepEqual(verifyRes.pending_inputs, []);

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('Strict Input Resolution - Fail-Fast Path: bare filenames in runs/<context_slug> or workspaceRoot without ${RUN_DIR}/${PROJECT_DIR} stay in pending_inputs', () => {
  const workspaceRoot = createTempDir();
  const runDir = path.join(workspaceRoot, 'runs', 'show_caledonia');
  const stageDir = path.join(runDir, 'stage02_concept');
  const showrunnerDir = path.join(stageDir, 'agents', 'showrunner');
  const promptsDir = path.join(workspaceRoot, 'prompts');
  fs.mkdirSync(showrunnerDir, { recursive: true });
  fs.mkdirSync(promptsDir, { recursive: true });

  const setupFile = path.join(runDir, '01_setup.md');
  const styleFile = path.join(promptsDir, 'style_guide.md');
  fs.writeFileSync(setupFile, '# Setup in runs/ root', 'utf-8');
  fs.writeFileSync(styleFile, '# Style Guide in workspace root', 'utf-8');

  statusInit(showrunnerDir, 'agent', 'initialized', '.agent/agents/stage2_showrunner.md', [
    '01_setup.md',
    'prompts/style_guide.md',
    'Explicit Setup: ${RUN_DIR}/01_setup.md',
    'Explicit Style: ${PROJECT_DIR}/prompts/style_guide.md'
  ]);

  const verifyRes = statusVerify(showrunnerDir, 'showrunner');
  assert.equal(verifyRes.success, true);
  assert.equal(verifyRes.resolved_inputs['Explicit Setup'], setupFile);
  assert.equal(verifyRes.resolved_inputs['Explicit Style'], styleFile);
  assert.equal(verifyRes.resolved_inputs['01_setup.md'], undefined);
  assert.equal(verifyRes.resolved_inputs['prompts/style_guide.md'], undefined);
  assert.deepEqual(verifyRes.pending_inputs, ['01_setup.md', 'prompts/style_guide.md']);

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('Explicit Path Variables - Happy Path: resolves inputs and outputs using ${PROJECT_DIR} and ${RUN_DIR}', () => {
  const workspaceRoot = createTempDir();
  const runDir = path.join(workspaceRoot, 'runs', 'show_radio');
  const stageDir = path.join(runDir, 'stage01_setup');
  const directorDir = path.join(stageDir, 'agents', 'director');
  const personasDir = path.join(workspaceRoot, 'prompts', 'personas');

  fs.mkdirSync(directorDir, { recursive: true });
  fs.mkdirSync(personasDir, { recursive: true });

  const personaFile1 = path.join(personasDir, 'persona_jack.md');
  const personaFile2 = path.join(personasDir, 'persona_sarah.md');
  fs.writeFileSync(personaFile1, '# Jack Turner', 'utf-8');
  fs.writeFileSync(personaFile2, '# Sarah Chen', 'utf-8');

  const setupFile = path.join(runDir, '01_setup.md');
  fs.writeFileSync(setupFile, '# Show Setup', 'utf-8');

  statusInit(directorDir, 'agent', 'initialized', '.agent/agents/stage1_director.md', [
    'persona_*.md: ${PROJECT_DIR}/prompts/personas/*.md',
    'Setup: ${RUN_DIR}/01_setup.md'
  ]);

  const verifyRes = statusVerify(directorDir, 'director');
  assert.equal(verifyRes.success, true);
  assert.deepEqual(verifyRes.resolved_inputs['persona_*.md'], [personaFile1, personaFile2]);
  assert.equal(verifyRes.resolved_inputs['Setup'], setupFile);

  const deliverable = path.join(directorDir, 'setup.md');
  fs.writeFileSync(deliverable, '# Final Output', 'utf-8');
  const updateRes = statusUpdate(directorDir, 'completed', 'Finished setup', '${RUN_DIR}/01_setup.md');
  assert.equal(updateRes.success, true);

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('Explicit Path Variables - Failure Path: non-existent file with ${RUN_DIR} stays in pending_inputs', () => {
  const workspaceRoot = createTempDir();
  const runDir = path.join(workspaceRoot, 'runs', 'show_radio');
  const stageDir = path.join(runDir, 'stage02_concept');
  const agentDir = path.join(stageDir, 'agents', 'showrunner');
  fs.mkdirSync(agentDir, { recursive: true });

  statusInit(agentDir, 'agent', 'initialized', '.agent/agents/stage2_showrunner.md', [
    '${RUN_DIR}/02_nonexistent.md'
  ]);

  const res = statusVerify(agentDir, 'showrunner');
  assert.equal(res.success, true);
  assert.deepEqual(res.resolved_inputs, {});
  assert.deepEqual(res.pending_inputs, ['${RUN_DIR}/02_nonexistent.md']);

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('statusInit & statusUpdate - Happy Path: initializes mapped outputs in weave.md and promotes local output on completion', () => {
  const workspaceRoot = createTempDir();
  const runDir = path.join(workspaceRoot, 'runs', 'show_test');
  const agentDir = path.join(runDir, 'stage01_setup', 'agents', 'director');

  statusInit(agentDir, 'agent', 'initialized', '.agent/agents/stage1_director.md', null, [
    'setup.md: ${RUN_DIR}/01_setup.md',
    'host.md: ${RUN_DIR}/01_host.md'
  ]);

  fs.writeFileSync(path.join(agentDir, 'setup.md'), '# Setup Content', 'utf-8');
  fs.writeFileSync(path.join(agentDir, 'host.md'), '# Host Persona', 'utf-8');

  const updateRes = statusUpdate(agentDir, 'completed', 'Setup completed', ['setup.md', 'host.md']);
  assert.equal(updateRes.success, true);
  assert.equal(fs.readFileSync(path.join(runDir, '01_setup.md'), 'utf-8'), '# Setup Content');
  assert.equal(fs.readFileSync(path.join(runDir, '01_host.md'), 'utf-8'), '# Host Persona');

  const readRes = statusRead(agentDir, ['setup.md', 'host.md'], 'completed');
  assert.deepEqual(readRes.outputs, ['setup.md: ${RUN_DIR}/01_setup.md', 'host.md: ${RUN_DIR}/01_host.md']);

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('Strict Input Resolution - Boundary Path 1: explicit relative path (../) does not fall through to workspaceRoot and stays in pending_inputs', () => {
  const workspaceRoot = createTempDir();
  const agentDir = path.join(workspaceRoot, 'output', 'ctx', 'stage01', 'agents', 'checker');
  fs.mkdirSync(agentDir, { recursive: true });
  // Create file at workspaceRoot/writer/draft.md, NOT at stage01/agents/writer/draft.md
  fs.mkdirSync(path.join(workspaceRoot, 'writer'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'writer', 'draft.md'), 'wrong root', 'utf-8');

  statusInit(agentDir, 'agent', 'initialized', null, ['../writer/draft.md']);
  const res = statusVerify(agentDir);
  assert.deepEqual(res.resolved_inputs, {});
  assert.deepEqual(res.pending_inputs, ['../writer/draft.md']);

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('Strict Input Resolution - Boundary Path 2: wildcard matching zero files stays in pending_inputs', () => {
  const workspaceRoot = createTempDir();
  const agentDir = path.join(workspaceRoot, 'output', 'ctx', 'agents', 'compiler');
  fs.mkdirSync(agentDir, { recursive: true });

  statusInit(agentDir, 'agent', 'initialized', null, ['Segments: ../writer_*/draft.md']);
  const res = statusVerify(agentDir);
  assert.deepEqual(res.resolved_inputs, {});
  assert.deepEqual(res.pending_inputs, ['Segments: ../writer_*/draft.md']);

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('Outputs List & Wildcards - Happy Path: statusUpdate and statusRead support array of outputs and wildcards', () => {
  const tmp = createTempDir();
  statusInit(tmp, 'agent', 'in_progress');
  fs.writeFileSync(path.join(tmp, 'article.md'), '# Article', 'utf-8');
  fs.writeFileSync(path.join(tmp, 'illustration_1.png'), 'PNG1', 'utf-8');
  fs.writeFileSync(path.join(tmp, 'illustration_2.png'), 'PNG2', 'utf-8');

  const updateRes = statusUpdate(tmp, 'completed', 'Generated article and illustrations', ['article.md', 'illustration_*.png']);
  assert.equal(updateRes.success, true);

  const readRes = statusRead(tmp, ['article.md', 'illustration_*.png'], 'completed');
  assert.deepEqual(readRes.outputs, ['article.md', 'illustration_*.png']);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('Outputs List & Wildcards - Failure Paths: missing file in outputs array or empty array throws Error', () => {
  const tmp = createTempDir();
  statusInit(tmp, 'agent', 'in_progress');
  fs.writeFileSync(path.join(tmp, 'article.md'), '# Article', 'utf-8');

  assert.throws(() => statusUpdate(tmp, 'completed', 'Done', ['   ']), {
    name: 'TypeError',
    message: /CRITICAL: Each entry in outputs array must be a non-empty string/
  });

  assert.throws(() => statusUpdate(tmp, 'completed', 'Done', ['article.md', 'missing_*.png']), {
    name: 'Error',
    message: /CRITICAL: Output file does not exist on disk/
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
    '${RUN_DIR}/01_setup.md',
    '../youtube_sourcers/youtube_sourcer_*/sourced_tracks.md'
  ]);

  // Turn 1: ${RUN_DIR}/01_setup.md exists, sourced_tracks.md does not exist yet
  const turn1Res = statusVerify(showrunnerDir, 'showrunner');
  assert.equal(turn1Res.success, true);
  assert.equal(turn1Res.resolved_inputs[`${contextDir}/01_setup.md`], setupFile);
  assert.deepEqual(turn1Res.pending_inputs, ['../youtube_sourcers/youtube_sourcer_*/sourced_tracks.md']);

  // Mid-stage: youtube_sourcer_01 creates sourced_tracks.md, showrunner wakes up and re-verifies
  const tracksFile = path.join(sourcer1Dir, 'sourced_tracks.md');
  fs.writeFileSync(tracksFile, '# Tracks', 'utf-8');

  const wakeupRes = statusVerify(showrunnerDir, 'showrunner');
  assert.equal(wakeupRes.success, true);
  assert.equal(wakeupRes.resolved_inputs[`${contextDir}/01_setup.md`], setupFile);
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

// ---------------------------------------------------------------------------
// R3: Stage-first status grammar `[<stage>/]<state>[/<detail>]` & orchestrator guard
// ---------------------------------------------------------------------------

/**
 * Creates a run directory with stage folders and an initialized orchestrator weave.md.
 * @param {string[]} stageDirs
 * @param {string} initialStatus
 * @returns {string}
 */
function createStagedRun(stageDirs, initialStatus) {
  const runDir = createTempDir();
  for (const s of stageDirs) fs.mkdirSync(path.join(runDir, s));
  statusInit(runDir, 'orchestrator', initialStatus);
  return runDir;
}

const ORCH = { type: 'orchestrator' };

test('statusUpdate - Happy Path: transitions staged orchestrator through stage-first lifecycle with detail and verifies optional outputs', () => {
  const tmp = createStagedRun(['stage01_setup', 'stage02_concept'], 'stage01_setup/in_progress');

  const reviewRes = statusUpdate(tmp, 'stage01_setup/awaiting_review', 'Stage 1 ready for user review', null, ORCH);
  assert.equal(reviewRes.status, 'stage01_setup/awaiting_review');
  assert.equal(statusRead(tmp, null).status, 'stage01_setup/awaiting_review');

  const reviseRes = statusUpdate(tmp, 'stage01_setup/in_progress/iteration_2', 'Applying requested changes', null, ORCH);
  assert.equal(reviseRes.status, 'stage01_setup/in_progress/iteration_2');

  fs.writeFileSync(path.join(tmp, '01_setup.md'), '# Approved Setup', 'utf-8');
  assert.equal(statusUpdate(tmp, 'stage01_setup/awaiting_review', 'Revised output ready', '01_setup.md', ORCH).success, true);

  statusUpdate(tmp, 'stage02_concept/in_progress', 'Unlocked Stage 2', null, ORCH);
  const doneRes = statusUpdate(tmp, 'stage02_concept/completed', 'Pipeline complete', '01_setup.md', ORCH);
  assert.equal(doneRes.status, 'stage02_concept/completed');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusUpdate - Failure Path 4: stage-first awaiting_review with non-existent output file throws Error', () => {
  const tmp = createStagedRun(['stage01_setup'], 'stage01_setup/in_progress');
  assert.throws(() => statusUpdate(tmp, 'stage01_setup/awaiting_review', 'Ready', 'missing_stage.md', ORCH), {
    name: 'Error',
    message: /CRITICAL: Output file does not exist on disk/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusUpdate - Failure Path 5: unapproved review state after stage throws Invalid status state Error', () => {
  const tmp = createStagedRun(['stage01_setup'], 'stage01_setup/in_progress');
  assert.throws(() => statusUpdate(tmp, 'stage01_setup/review_needed', 'Invalid state', null, ORCH), {
    name: 'Error',
    message: /CRITICAL: Invalid status state 'stage01_setup\/review_needed'/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusUpdate - Issue #8 Repro: agent-style task status against root orchestrator weave.md is rejected and file is untouched', () => {
  const tmp = createStagedRun(['stage01_setup', 'stage02_concept', 'stage03_writing'], 'stage01_setup/in_progress');
  const before = fs.readFileSync(path.join(tmp, 'weave.md'), 'utf-8');

  assert.throws(() => statusUpdate(tmp, 'in_progress/03_research', 'Researching'), {
    name: 'Error',
    message: /CRITICAL: Refusing to update orchestrator weave\.md .* without type: "orchestrator"/
  });
  assert.throws(() => statusUpdate(tmp, 'completed', 'Done'), {
    name: 'Error',
    message: /CRITICAL: Refusing to update orchestrator weave\.md/
  });
  assert.equal(fs.readFileSync(path.join(tmp, 'weave.md'), 'utf-8'), before);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusUpdate - Failure Paths: staged orchestrator rejects missing stage, unknown stage, and legacy <state>/<stage> order', () => {
  const tmp = createStagedRun(['stage01_setup', 'stage02_concept'], 'stage01_setup/in_progress');
  assert.throws(() => statusUpdate(tmp, 'in_progress', null, null, ORCH), {
    message: /CRITICAL: Staged orchestrator status 'in_progress' must use '<stage>\/<state>\[\/<detail>\]' with <stage> one of: stage01_setup, stage02_concept/
  });
  assert.throws(() => statusUpdate(tmp, 'completed', null, null, ORCH), {
    message: /CRITICAL: Staged orchestrator status 'completed' must use/
  });
  assert.throws(() => statusUpdate(tmp, 'stage03_writing/in_progress', null, null, ORCH), {
    message: /CRITICAL: Unknown stage 'stage03_writing'/
  });
  assert.throws(() => statusUpdate(tmp, 'in_progress/stage02_concept', null, null, ORCH), {
    message: /CRITICAL: Orchestrator status 'in_progress\/stage02_concept' uses the legacy '<state>\/<stage>' order\. Use .*'stage02_concept\/in_progress'/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusUpdate - Stageless orchestrator: accepts bare states with detail and rejects stage prefix', () => {
  const tmp = createTempDir();
  statusInit(tmp, 'orchestrator', 'in_progress');
  assert.equal(statusUpdate(tmp, 'awaiting_review', 'Review final article', null, ORCH).success, true);
  assert.equal(statusUpdate(tmp, 'in_progress/iteration_2', 'Revising', null, ORCH).success, true);
  assert.equal(statusUpdate(tmp, 'completed', 'Done', null, ORCH).success, true);
  assert.throws(() => statusUpdate(tmp, 'stage01_setup/in_progress', null, null, ORCH), {
    message: /CRITICAL: Stageless orchestrator status 'stage01_setup\/in_progress' must not carry a stage prefix/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusUpdate - Agent guards: stage prefix rejected, type mismatch rejected, invalid options rejected', () => {
  const tmp = createTempDir();
  const agentDir = path.join(tmp, 'writer');
  statusInit(agentDir, 'agent', 'initialized');

  assert.equal(statusUpdate(agentDir, 'in_progress/01_research', 'Researching', null, { type: 'agent' }).success, true);
  assert.throws(() => statusUpdate(agentDir, 'stage01_setup/in_progress'), {
    message: /CRITICAL: Agent weave\.md status 'stage01_setup\/in_progress' must not carry a stage prefix/
  });
  assert.throws(() => statusUpdate(agentDir, 'in_progress', null, null, ORCH), {
    message: /CRITICAL: Type mismatch\. Expected 'orchestrator' weave\.md/
  });
  assert.throws(() => statusUpdate(agentDir, 'in_progress', null, null, null), {
    name: 'TypeError',
    message: /CRITICAL: options must be a plain object/
  });
  assert.throws(() => statusUpdate(agentDir, 'in_progress', null, null, { type: 'boss' }), {
    name: 'TypeError',
    message: /CRITICAL: options\.type must be one of: agent, orchestrator/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusInit - Orchestrator guard: staged run requires existing stage prefix; stageless run rejects it', () => {
  const staged = createTempDir();
  fs.mkdirSync(path.join(staged, 'stage01_setup'));
  assert.throws(() => statusInit(staged, 'orchestrator', 'in_progress'), {
    message: /CRITICAL: Staged orchestrator status 'in_progress' must use/
  });
  assert.throws(() => statusInit(staged, 'orchestrator', 'in_progress/stage01_setup'), {
    message: /legacy '<state>\/<stage>' order/
  });
  assert.equal(fs.existsSync(path.join(staged, 'weave.md')), false);

  const stageless = createTempDir();
  assert.throws(() => statusInit(stageless, 'orchestrator', 'stage01_setup/in_progress'), {
    message: /CRITICAL: Stageless orchestrator status/
  });
  fs.rmSync(staged, { recursive: true, force: true });
  fs.rmSync(stageless, { recursive: true, force: true });
});

test('statusVerify - Failure Path 4: rejects the orchestrator run directory (subagents must pass their own working directory)', () => {
  const tmp = createStagedRun(['stage01_setup'], 'stage01_setup/in_progress');
  assert.throws(() => statusVerify(tmp), {
    name: 'Error',
    message: /CRITICAL: .* contains the orchestrator weave\.md, not an agent workspace/
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusUpdate & statusRead - Happy Path: mirrorTo copies verified deliverables in Node.js with zero LLM context', () => {
  const tmp = createStagedRun(['stage01_setup'], 'stage01_setup/in_progress');
  const deliverable = path.join(tmp, '01_setup.md');
  fs.writeFileSync(deliverable, '# Stage 1 Setup Deliverable', 'utf-8');

  const mirrorDest1 = path.join(tmp, 'external_review', '01_setup.md');
  const updRes = statusUpdate(
    tmp,
    'stage01_setup/awaiting_review',
    'Awaiting user review of 01_setup.md',
    '01_setup.md',
    { type: 'orchestrator', mirrorTo: mirrorDest1 }
  );
  assert.equal(updRes.success, true);
  assert.deepEqual(updRes.mirrored_files, [path.resolve(mirrorDest1)]);
  assert.equal(fs.readFileSync(mirrorDest1, 'utf-8'), '# Stage 1 Setup Deliverable');
  assert.match(updRes.message, /Mirrored:/);

  const mirrorDest2 = path.join(tmp, 'external_review_2', '01_setup_read.md');
  const readRes = statusRead(tmp, '01_setup.md', 'stage01_setup/awaiting_review', { mirrorTo: mirrorDest2 });
  assert.deepEqual(readRes.mirrored_files, [path.resolve(mirrorDest2)]);
  assert.equal(fs.readFileSync(mirrorDest2, 'utf-8'), '# Stage 1 Setup Deliverable');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusUpdate & statusRead - Failure Paths: mirrorTo rejects relative path, empty outputs, and invalid options', () => {
  const tmp = createStagedRun(['stage01_setup'], 'stage01_setup/in_progress');
  const before = fs.readFileSync(path.join(tmp, 'weave.md'), 'utf-8');

  assert.throws(() => statusUpdate(tmp, 'stage01_setup/awaiting_review', null, null, { type: 'orchestrator', mirrorTo: 'relative/copy.md' }), {
    name: 'Error',
    message: /CRITICAL: mirror_to must be an absolute path/
  });
  assert.throws(() => statusUpdate(tmp, 'stage01_setup/awaiting_review', null, null, { type: 'orchestrator', mirrorTo: path.join(tmp, 'copy.md') }), {
    name: 'Error',
    message: /CRITICAL: mirror_to requires at least one verified output file/
  });
  // weave.md must remain untouched on failed mirrorTo
  assert.equal(fs.readFileSync(path.join(tmp, 'weave.md'), 'utf-8'), before);

  assert.throws(() => statusRead(tmp, undefined, undefined, null), {
    name: 'TypeError',
    message: /CRITICAL: options must be a plain object/
  });
  assert.throws(() => statusRead(tmp, undefined, undefined, { mirrorTo: 'relative/copy.md' }), {
    name: 'Error',
    message: /CRITICAL: mirror_to must be an absolute path/
  });
  assert.throws(() => statusRead(tmp, undefined, undefined, { mirrorTo: path.join(tmp, 'copy.md') }), {
    name: 'Error',
    message: /CRITICAL: mirror_to requires at least one verified output file/
  });

  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// R9: conversation_id validation, persistence & surfacing ("1-2" Coverage)
// ---------------------------------------------------------------------------

test('validateConversationId - Happy Path & Failure Paths: accepts trimmed UUID and rejects invalid inputs', () => {
  assert.equal(
    validateConversationId('  0394d2cc-dbf1-4fd7-892b-d7426b08641f  '),
    '0394d2cc-dbf1-4fd7-892b-d7426b08641f'
  );

  // Failure Path 1: non-string or empty/whitespace
  assert.throws(() => validateConversationId(''), {
    name: 'TypeError',
    message: /CRITICAL: conversation_id must be a non-empty string/
  });
  assert.throws(() => validateConversationId('   '), {
    name: 'TypeError',
    message: /CRITICAL: conversation_id must be a non-empty string/
  });
  assert.throws(() => validateConversationId(null), {
    name: 'TypeError',
    message: /CRITICAL: conversation_id must be a non-empty string/
  });
  assert.throws(() => validateConversationId(12345), {
    name: 'TypeError',
    message: /CRITICAL: conversation_id must be a non-empty string/
  });

  // Failure Path 2: newlines or double quotes that could corrupt YAML frontmatter
  assert.throws(() => validateConversationId('abc\ninjected: true'), {
    name: 'TypeError',
    message: /CRITICAL: conversation_id must not contain newlines or double quotes/
  });
  assert.throws(() => validateConversationId('abc"def'), {
    name: 'TypeError',
    message: /CRITICAL: conversation_id must not contain newlines or double quotes/
  });
});

test('statusInit, statusUpdate & statusRead (R9) - Happy Path: persists conversation_id with or without status and preserves it across worker transitions', () => {
  const tmp = createTempDir();
  const agentA = path.join(tmp, 'agent_a');
  const agentB = path.join(tmp, 'agent_b');
  const uuidA = '11111111-2222-3333-4444-555555555555';
  const uuidB = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  // 1. statusInit with optional conversation_id (options object)
  statusInit(agentA, {
    type: 'agent',
    status: 'initialized',
    instructions_file: '.agent/agents/writer.md',
    conversation_id: uuidA
  });
  const readA1 = statusRead(agentA);
  assert.equal(readA1.conversation_id, uuidA);

  // Subsequent worker statusUpdate without conversation_id must preserve persisted conversation_id
  statusUpdate(agentA, 'in_progress/01_drafting', 'Drafting section 1');
  const readA2 = statusRead(agentA);
  assert.equal(readA2.status, 'in_progress/01_drafting');
  assert.equal(readA2.conversation_id, uuidA);

  // 2. statusInit without conversation_id -> weaveRead returns null
  statusInit(agentB, 'agent', 'initialized', '.agent/agents/critic.md');
  assert.equal(statusRead(agentB).conversation_id, null);

  // Worker starts running first, then orchestrator records conversation_id WITHOUT clobbering status
  statusUpdate(agentB, 'in_progress/01_audit', 'Auditing claims');
  const metaRes = statusUpdate(agentB, null, null, null, { conversationId: uuidB });
  assert.equal(metaRes.success, true);
  assert.equal(metaRes.status, 'in_progress/01_audit');
  assert.equal(metaRes.conversation_id, uuidB);
  assert.match(metaRes.message, /conversation_id -> aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/);

  const readB = statusRead(agentB);
  assert.equal(readB.status, 'in_progress/01_audit');
  assert.equal(readB.conversation_id, uuidB);

  // Updating both status and conversation_id simultaneously
  const uuidB2 = 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee';
  const bothRes = statusUpdate(agentB, 'in_progress/02_recheck', 'Rechecking', null, { conversationId: uuidB2 });
  assert.equal(bothRes.conversation_id, uuidB2);
  assert.equal(statusRead(agentB).conversation_id, uuidB2);
  assert.equal(statusRead(agentB).status, 'in_progress/02_recheck');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('statusInit & statusUpdate (R9) - Failure Paths: rejects invalid conversation_id, missing status+conversation_id, and unguarded orchestrator writes', () => {
  const tmp = createTempDir();
  const agentDir = path.join(tmp, 'agent_bad');
  statusInit(agentDir, 'agent', 'initialized');

  // Failure Path 1: invalid conversation_id in statusInit and statusUpdate
  assert.throws(() => statusInit(path.join(tmp, 'bad_init'), { type: 'agent', conversation_id: '' }), {
    name: 'TypeError',
    message: /CRITICAL: conversation_id must be a non-empty string/
  });
  assert.throws(() => statusUpdate(agentDir, null, null, null, { conversationId: '   ' }), {
    name: 'TypeError',
    message: /CRITICAL: conversation_id must be a non-empty string/
  });
  assert.throws(() => statusUpdate(agentDir, 'in_progress', null, null, { conversationId: 'bad\nid' }), {
    name: 'TypeError',
    message: /CRITICAL: conversation_id must not contain newlines or double quotes/
  });

  // Failure Path 2: omitting both status and conversation_id still fails fast
  assert.throws(() => statusUpdate(agentDir, null, null, null, {}), {
    name: 'TypeError',
    message: /CRITICAL: Status must be a non-empty string/
  });

  // Failure Path 3: orchestrator guard still blocks conversation_id-only update without type: 'orchestrator'
  const runDir = createStagedRun(['stage01_setup'], 'stage01_setup/in_progress');
  assert.throws(() => statusUpdate(runDir, null, null, null, { conversationId: '11111111-2222-3333-4444-555555555555' }), {
    name: 'Error',
    message: /CRITICAL: Refusing to update orchestrator weave\.md/
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(runDir, { recursive: true, force: true });
});
