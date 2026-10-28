import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { substitutePathVariables } from '../src/path_resolver.mjs';

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
