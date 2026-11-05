import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');

const inputVerifierPath = path.resolve(__dirname, '..', 'sidecars', 'panel', 'lib', 'input_verifier.mjs');
const { checkAgentInputs, getMediaType, getMediaMimeType, resolveAgentOutputs } = await import(`file://${inputVerifierPath.replace(/\\/g, '/')}`);

const testDir = path.join(workspaceRoot, 'tmp', 'test_input_verifier');
const dummyAgentDir = path.join(testDir, 'runs', 'show_test', 'stage01', 'agents', 'test_agent');
const dummyPromptsDir = path.join(testDir, 'prompts', 'personas');

test.before(() => {
  fs.mkdirSync(dummyAgentDir, { recursive: true });
  fs.mkdirSync(dummyPromptsDir, { recursive: true });
  fs.writeFileSync(path.join(dummyPromptsDir, 'persona_alpha.md'), '# Persona Alpha', 'utf-8');
  fs.writeFileSync(path.join(dummyPromptsDir, 'persona_beta.md'), '# Persona Beta', 'utf-8');
});

test.after(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

test('checkAgentInputs - Happy Path: resolves inputs using ${PROJECT_DIR} wildcard pattern', () => {
  const inputs = ['persona_*.md: ${PROJECT_DIR}/prompts/personas/*.md'];
  const result = checkAgentInputs(dummyAgentDir, inputs, testDir, 'show_test');

  assert.equal(result.length, 1);
  assert.equal(result[0].isWildcard, true);
  assert.equal(result[0].exists, true);
  assert.equal(result[0].count, 2);
});

test('checkAgentInputs - Failure Path 1: throws TypeError when agentDir is invalid or missing', () => {
  assert.throws(
    () => checkAgentInputs('', ['test.md'], testDir, 'show_test'),
    {
      name: 'TypeError',
      message: 'CRITICAL: agentDir must be a non-empty string'
    }
  );

  assert.throws(
    () => checkAgentInputs(null, ['test.md'], testDir, 'show_test'),
    {
      name: 'TypeError',
      message: 'CRITICAL: agentDir must be a non-empty string'
    }
  );
});

test('checkAgentInputs - Failure Path 2: non-existent file returns exists=false and count=0', () => {
  const inputs = ['missing: ${PROJECT_DIR}/prompts/personas/non_existent_*.md'];
  const result = checkAgentInputs(dummyAgentDir, inputs, testDir, 'show_test');

  assert.equal(result.length, 1);
  assert.equal(result[0].isWildcard, true);
  assert.equal(result[0].exists, false);
  assert.equal(result[0].count, 0);
});

test('getMediaType & getMediaMimeType - Happy Path: classifies image, audio, and video files and resolves MIME types', () => {
  assert.equal(getMediaType('cover.png'), 'image');
  assert.equal(getMediaType('photo.JPG'), 'image');
  assert.equal(getMediaType('episode.mp3'), 'audio');
  assert.equal(getMediaType('voice.wav'), 'audio');
  assert.equal(getMediaType('trailer.mp4'), 'video');
  assert.equal(getMediaType('clip.webm'), 'video');
  assert.equal(getMediaType('notes.md'), null);

  assert.equal(getMediaMimeType('cover.png'), 'image/png');
  assert.equal(getMediaMimeType('episode.mp3'), 'audio/mpeg');
  assert.equal(getMediaMimeType('trailer.mp4'), 'video/mp4');
  assert.equal(getMediaMimeType('notes.md'), null);
});

test('getMediaType & getMediaMimeType - Failure Path 1: throws TypeError on empty or non-string filePath', () => {
  assert.throws(() => getMediaType(''), /CRITICAL: filePath must be a non-empty string/);
  assert.throws(() => getMediaType(null), /CRITICAL: filePath must be a non-empty string/);
  assert.throws(() => getMediaMimeType(''), /CRITICAL: filePath must be a non-empty string/);
  assert.throws(() => getMediaMimeType(undefined), /CRITICAL: filePath must be a non-empty string/);
});

test('resolveAgentOutputs - Happy Path: populates mediaType and filePath for image, audio, and video outputs', () => {
  fs.writeFileSync(path.join(dummyAgentDir, 'banner.png'), 'PNG_DATA', 'utf-8');
  fs.writeFileSync(path.join(dummyAgentDir, 'jingle.mp3'), 'MP3_DATA', 'utf-8');
  fs.writeFileSync(path.join(dummyAgentDir, 'intro.mp4'), 'MP4_DATA', 'utf-8');

  const res = resolveAgentOutputs(dummyAgentDir, ['banner.png', 'jingle.mp3', 'intro.mp4'], testDir, 'show_test', 'stage01');
  assert.equal(res.outputItems.length, 3);
  assert.equal(res.outputItems[0].mediaType, 'image');
  assert.ok(res.outputItems[0].filePath.endsWith('/banner.png'));
  assert.equal(res.outputItems[1].mediaType, 'audio');
  assert.ok(res.outputItems[1].filePath.endsWith('/jingle.mp3'));
  assert.equal(res.outputItems[2].mediaType, 'video');
  assert.ok(res.outputItems[2].filePath.endsWith('/intro.mp4'));
});

test('resolveAgentOutputs - Failure Path: throws TypeError on invalid dir and sets filePath=null for missing media', () => {
  assert.throws(() => resolveAgentOutputs('', ['a.png'], testDir, 'show_test', 'stage01'), /CRITICAL: dir must be a non-empty string/);
  const missing = resolveAgentOutputs(dummyAgentDir, ['missing_video.mp4'], testDir, 'show_test', 'stage01');
  assert.equal(missing.outputItems.length, 1);
  assert.equal(missing.outputItems[0].exists, false);
  assert.equal(missing.outputItems[0].mediaType, 'video');
  assert.equal(missing.outputItems[0].filePath, null);
});
