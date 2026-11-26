import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { substitutePathVariables, resolveInputEntry, mergeOutputDeclarations, verifyOutputFiles, mirrorOutputFiles } from '../src/path_resolver.mjs';

test('substitutePathVariables - Happy Path: substitutes ${PROJECT_DIR}, ${RUN_DIR}, and ${AGENT_DIR}', () => {
  const roots = {
    workspaceRoot: 'C:/repo',
    contextDir: 'C:/repo/runs/show_01',
    agentDir: 'C:/repo/runs/show_01/stage01/agents/director'
  };

  const projectInput = substitutePathVariables('${PROJECT_DIR}/prompts/personas/*.md', roots);
  assert.equal(projectInput, 'C:/repo/prompts/personas/*.md');

  const runInput = substitutePathVariables('${RUN_DIR}/01_host.md', roots);
  assert.equal(runInput, 'C:/repo/runs/show_01/01_host.md');

  const agentInput = substitutePathVariables('${AGENT_DIR}/../architect/beats.md', roots);
  assert.equal(agentInput, 'C:/repo/runs/show_01/stage01/agents/director/../architect/beats.md');
});

test('substitutePathVariables - Happy Path 2: substitutes $VAR$ syntax', () => {
  const roots = {
    workspaceRoot: 'C:/repo',
    contextDir: 'C:/repo/runs/show_01',
    agentDir: 'C:/repo/runs/show_01/stage01/agents/director'
  };

  const runInput = substitutePathVariables('$RUN_DIR$/02_concept.md', roots);
  assert.equal(runInput, 'C:/repo/runs/show_01/02_concept.md');

  const projInput = substitutePathVariables('$PROJECT_DIR$/style.md', roots);
  assert.equal(projInput, 'C:/repo/style.md');
});

test('substitutePathVariables - Failure Path 1: invalid targetPath throws TypeError', () => {
  const roots = { workspaceRoot: 'C:/repo', contextDir: 'C:/repo/runs/show_01', agentDir: 'C:/repo/runs/show_01/agent' };
  assert.throws(() => substitutePathVariables(null, roots), {
    name: 'TypeError',
    message: /CRITICAL: targetPath must be a non-empty string\./
  });
  assert.throws(() => substitutePathVariables('', roots), {
    name: 'TypeError',
    message: /CRITICAL: targetPath must be a non-empty string\./
  });
  assert.throws(() => substitutePathVariables('   ', roots), {
    name: 'TypeError',
    message: /CRITICAL: targetPath must be a non-empty string\./
  });
});

test('substitutePathVariables - Failure Path 2: missing roots object throws TypeError', () => {
  assert.throws(() => substitutePathVariables('${RUN_DIR}/01.md', null), {
    name: 'TypeError',
    message: /CRITICAL: roots must be a non-null object\./
  });
});

test('substitutePathVariables - Failure Path 3: missing workspaceRoot when ${PROJECT_DIR} requested throws Error', () => {
  const roots = { workspaceRoot: null, contextDir: 'C:/repo/runs/show_01', agentDir: 'C:/repo/runs/show_01/agent' };
  assert.throws(() => substitutePathVariables('${PROJECT_DIR}/prompts/personas/*.md', roots), {
    name: 'Error',
    message: /CRITICAL: Unable to resolve \${PROJECT_DIR}; could not infer workspace root\./
  });
});

test('substitutePathVariables - Failure Path 4: missing contextDir when ${RUN_DIR} requested throws Error', () => {
  const roots = { workspaceRoot: 'C:/repo', contextDir: null, agentDir: 'C:/repo/agent' };
  assert.throws(() => substitutePathVariables('${RUN_DIR}/01_setup.md', roots), {
    name: 'Error',
    message: /CRITICAL: Unable to resolve \${RUN_DIR}; could not infer run context directory\./
  });
});

test('mergeOutputDeclarations & verifyOutputFiles - Happy Path: preserves <local>: <target> bindings and promotes 1-to-1, wildcard-to-dir, and wildcard-to-wildcard outputs', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemx-path-test-'));
  const runDir = path.join(workspaceRoot, 'runs', 'show_01');
  const agentDir = path.join(runDir, 'stage05_audio', 'agents', 'audio');
  const audioSubDir = path.join(agentDir, 'audio');
  fs.mkdirSync(audioSubDir, { recursive: true });

  fs.writeFileSync(path.join(agentDir, 'audio_manifest.md'), '# Manifest', 'utf-8');
  fs.writeFileSync(path.join(audioSubDir, 'segment_01_spoken.mp3'), 'MP3_1', 'utf-8');
  fs.writeFileSync(path.join(audioSubDir, 'segment_02_spoken.mp3'), 'MP3_2', 'utf-8');
  fs.writeFileSync(path.join(agentDir, 'segment_01.srt'), 'SRT_1', 'utf-8');

  const existing = [
    'audio_manifest.md: ${RUN_DIR}/05_audio_manifest.md',
    'audio/segment_*_spoken.mp3: ${RUN_DIR}/05_audio/',
    'segment_*.srt: ${RUN_DIR}/07_subtitles/sub_*.srt'
  ];
  const merged = mergeOutputDeclarations(existing, ['audio_manifest.md', 'audio/segment_*_spoken.mp3', 'segment_*.srt']);
  assert.deepEqual(merged, existing);

  const promoted = verifyOutputFiles(agentDir, merged);
  assert.equal(promoted.length, 4);
  assert.equal(fs.readFileSync(path.join(runDir, '05_audio_manifest.md'), 'utf-8'), '# Manifest');
  assert.equal(fs.readFileSync(path.join(runDir, '05_audio', 'segment_01_spoken.mp3'), 'utf-8'), 'MP3_1');
  assert.equal(fs.readFileSync(path.join(runDir, '05_audio', 'segment_02_spoken.mp3'), 'utf-8'), 'MP3_2');
  assert.equal(fs.readFileSync(path.join(runDir, '07_subtitles', 'sub_01.srt'), 'utf-8'), 'SRT_1');

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('verifyOutputFiles - Failure Paths: throws on missing local file or invalid wildcard-to-single-file target', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemx-path-fail-'));
  const runDir = path.join(workspaceRoot, 'runs', 'show_01');
  const agentDir = path.join(runDir, 'stage01', 'agents', 'writer');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, 'seg_01.md'), '# Seg 1', 'utf-8');

  assert.throws(() => verifyOutputFiles(agentDir, ['missing.md: ${RUN_DIR}/01_missing.md']), {
    name: 'Error',
    message: /CRITICAL: Output file does not exist on disk/
  });

  assert.throws(() => verifyOutputFiles(agentDir, ['seg_*.md: ${RUN_DIR}/01_single_target.md']), {
    name: 'Error',
    message: /CRITICAL: Wildcard output 'seg_\*\.md' cannot map to a single file target/
  });

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('mirrorOutputFiles - Happy Path: mirrors single file to exact file path and multiple files to directory', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemx-mirror-test-'));
  const srcA = path.join(tmp, '01_setup.md');
  const srcB = path.join(tmp, '01_host.md');
  fs.writeFileSync(srcA, '# Setup Deliverable', 'utf-8');
  fs.writeFileSync(srcB, '# Host Deliverable', 'utf-8');

  // 1. Single file -> exact destination file path
  const exactDest = path.join(tmp, 'review', '01_setup_copy.md');
  const mirroredSingle = mirrorOutputFiles([srcA], exactDest);
  assert.deepEqual(mirroredSingle, [path.resolve(exactDest)]);
  assert.equal(fs.readFileSync(exactDest, 'utf-8'), '# Setup Deliverable');

  // 2. Multiple files -> target directory with trailing slash
  const dirDest = path.join(tmp, 'review_dir') + path.sep;
  const mirroredMulti = mirrorOutputFiles([srcA, srcB], dirDest);
  assert.equal(mirroredMulti.length, 2);
  assert.equal(fs.readFileSync(path.join(tmp, 'review_dir', '01_setup.md'), 'utf-8'), '# Setup Deliverable');
  assert.equal(fs.readFileSync(path.join(tmp, 'review_dir', '01_host.md'), 'utf-8'), '# Host Deliverable');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('mirrorOutputFiles - Failure Paths: rejects invalid mirror_to, empty sources, missing source, and multi-to-file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemx-mirror-fail-'));
  const srcA = path.join(tmp, 'a.md');
  const srcB = path.join(tmp, 'b.md');
  fs.writeFileSync(srcA, 'A', 'utf-8');
  fs.writeFileSync(srcB, 'B', 'utf-8');

  assert.throws(() => mirrorOutputFiles([srcA], ''), {
    name: 'TypeError',
    message: /CRITICAL: mirror_to must be a non-empty string/
  });
  assert.throws(() => mirrorOutputFiles([srcA], 'relative/out.md'), {
    name: 'Error',
    message: /CRITICAL: mirror_to must be an absolute path/
  });
  assert.throws(() => mirrorOutputFiles([], path.join(tmp, 'out.md')), {
    name: 'Error',
    message: /CRITICAL: mirror_to requires at least one verified output file/
  });
  assert.throws(() => mirrorOutputFiles([path.join(tmp, 'missing.md')], path.join(tmp, 'out.md')), {
    name: 'Error',
    message: /CRITICAL: Source output file does not exist on disk/
  });
  assert.throws(() => mirrorOutputFiles([srcA, srcB], path.join(tmp, 'single_file.md')), {
    name: 'Error',
    message: /CRITICAL: mirror_to target .* must be a directory/
  });

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('resolveInputEntry - Happy Path: resolves local agentDir, explicit ${RUN_DIR}, ${PROJECT_DIR}, ${AGENT_DIR}, and relative paths', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemx-resolve-ok-'));
  const runDir = path.join(workspaceRoot, 'runs', 'show_01');
  const stageDir = path.join(runDir, 'stage01_setup');
  const writerDir = path.join(stageDir, 'agents', 'writer');
  const editorDir = path.join(stageDir, 'agents', 'editor');
  const promptsDir = path.join(workspaceRoot, 'prompts');

  fs.mkdirSync(writerDir, { recursive: true });
  fs.mkdirSync(editorDir, { recursive: true });
  fs.mkdirSync(promptsDir, { recursive: true });

  const localNotes = path.join(editorDir, 'notes.md');
  const siblingDraft = path.join(writerDir, 'draft.md');
  const runSetup = path.join(runDir, '01_setup.md');
  const projGuide = path.join(promptsDir, 'guide.md');

  fs.writeFileSync(localNotes, '# Notes', 'utf-8');
  fs.writeFileSync(siblingDraft, '# Draft', 'utf-8');
  fs.writeFileSync(runSetup, '# Setup', 'utf-8');
  fs.writeFileSync(projGuide, '# Guide', 'utf-8');

  assert.deepEqual(resolveInputEntry(editorDir, 'notes.md').matches, [localNotes]);
  assert.deepEqual(resolveInputEntry(editorDir, 'Draft: ../writer/draft.md').matches, [siblingDraft]);
  assert.deepEqual(resolveInputEntry(editorDir, 'Setup: ${RUN_DIR}/01_setup.md').matches, [runSetup]);
  assert.deepEqual(resolveInputEntry(editorDir, 'Guide: ${PROJECT_DIR}/prompts/guide.md').matches, [projGuide]);
  assert.deepEqual(resolveInputEntry(editorDir, '${AGENT_DIR}/notes.md').matches, [localNotes]);

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('resolveInputEntry - Failure Path 1: bare filename in runDir without ${RUN_DIR} throws CRITICAL Error', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemx-resolve-fail1-'));
  const runDir = path.join(workspaceRoot, 'runs', 'show_01');
  const agentDir = path.join(runDir, 'stage01', 'agents', 'editor');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, '01_setup.md'), '# Setup', 'utf-8');

  assert.throws(() => resolveInputEntry(agentDir, '01_setup.md'), {
    name: 'Error',
    message: /CRITICAL: Input file does not exist on disk/
  });

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test('resolveInputEntry - Failure Path 2: bare relative path in workspaceRoot without ${PROJECT_DIR} throws CRITICAL Error', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemx-resolve-fail2-'));
  const agentDir = path.join(workspaceRoot, 'runs', 'show_01', 'stage01', 'agents', 'editor');
  const promptsDir = path.join(workspaceRoot, 'prompts');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.writeFileSync(path.join(promptsDir, 'guide.md'), '# Guide', 'utf-8');

  assert.throws(() => resolveInputEntry(agentDir, 'prompts/guide.md'), {
    name: 'Error',
    message: /CRITICAL: Input file does not exist on disk/
  });

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});
