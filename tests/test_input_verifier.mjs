import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');

const inputVerifierPath = path.resolve(__dirname, '..', 'sidecars', 'panel', 'lib', 'input_verifier.mjs');
const { checkAgentInputs } = await import(`file://${inputVerifierPath.replace(/\\/g, '/')}`);

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
