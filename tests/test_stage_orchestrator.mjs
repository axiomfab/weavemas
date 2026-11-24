import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMPACT_TOOL_SIGNATURES,
  NO_SCHEMA_READ_FRAGMENT,
  STAGE_ORCHESTRATOR_TOOLS,
  STAGE_ORCHESTRATOR_MCP_TOOLS,
  verifyStageOrchestratorContract
} from '../src/tool_schemas.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Builds a minimal valid `stage_orchestrator.md` fixture for unit-testing failure mutations.
 * @param {string} [frontmatterOverrides]
 * @param {string} [bodyOverrides]
 * @returns {string}
 */
function buildValidStageOrchestratorMarkdown(frontmatterOverrides = '', bodyOverrides = '') {
  const fm =
    frontmatterOverrides ||
    [
      '---',
      'name: stage_orchestrator',
      'description: Lean per-stage sub-orchestrator.',
      'model: inherit',
      'subagent: true',
      'inheritMcp: true',
      'inheritCustomizations: true',
      'commandExecutionPolicy: auto',
      'tools:',
      '  - view_file',
      '  - invoke_subagent',
      '  - send_message',
      '---'
    ].join('\n');

  const body =
    bodyOverrides ||
    [
      '# Stage Orchestrator',
      `Do NOT read ${NO_SCHEMA_READ_FRAGMENT} unless an unexpected schema error occurs.`,
      `- weave_discover_agents: \`${COMPACT_TOOL_SIGNATURES.weave_discover_agents}\``,
      `- weave_update: \`${COMPACT_TOOL_SIGNATURES.weave_update}\``,
      `- weave_read: \`${COMPACT_TOOL_SIGNATURES.weave_read}\``,
      'Phase 1 delegates to provisioner and waits for PROVISIONING_COMPLETE.',
      'Phase 2 calls weave_discover_agents, dispatches via invoke_subagent, persists conversation_id, routes revisions via send_message, and batch-verifies via weave_read.',
      'NEVER call `manage_subagents` or `kill` any child session.',
      'STAGE_COMPLETED: <stage_slug> | agents: <count> | outputs: []',
      'CLUSTER_COMPLETED: <unit_id> | agents: <count> | outputs: []'
    ].join('\n');

  return `${fm}\n\n${body}\n`;
}

test('STAGE_ORCHESTRATOR constants - Happy Path: frozen minimal tool surface and MCP signature set', () => {
  assert.equal(Object.isFrozen(STAGE_ORCHESTRATOR_TOOLS), true);
  assert.equal(Object.isFrozen(STAGE_ORCHESTRATOR_MCP_TOOLS), true);
  assert.deepEqual(STAGE_ORCHESTRATOR_TOOLS, ['view_file', 'invoke_subagent', 'send_message']);
  assert.deepEqual(STAGE_ORCHESTRATOR_MCP_TOOLS, ['weave_update', 'weave_read', 'weave_discover_agents']);
});

test('verifyStageOrchestratorContract - Happy Path: validates minimal frontmatter, inline signatures, and Two-Phase protocol', () => {
  const md = buildValidStageOrchestratorMarkdown();
  const res = verifyStageOrchestratorContract(md);
  assert.deepEqual(res, {
    verified: true,
    name: 'stage_orchestrator',
    tools: ['view_file', 'invoke_subagent', 'send_message'],
    mcpTools: ['weave_update', 'weave_read', 'weave_discover_agents']
  });
});

test('verifyStageOrchestratorContract - Failure Path 1: rejects invalid input types, missing frontmatter, or wrong agent name', () => {
  for (const badInput of ['', '   ', null, undefined, 42, {}]) {
    assert.throws(() => verifyStageOrchestratorContract(badInput), {
      name: 'TypeError',
      message: /CRITICAL: content must be a non-empty string/
    });
  }

  assert.throws(() => verifyStageOrchestratorContract('# No Frontmatter Here'), {
    name: 'Error',
    message: /CRITICAL: Missing YAML frontmatter/
  });

  const wrongName = buildValidStageOrchestratorMarkdown().replace(
    'name: stage_orchestrator',
    'name: custom_runner'
  );
  assert.throws(() => verifyStageOrchestratorContract(wrongName), {
    name: 'Error',
    message: /CRITICAL: stage_orchestrator frontmatter 'name' must be 'stage_orchestrator'/
  });
});

test('verifyStageOrchestratorContract - Failure Path 2: rejects inheritCustomizations: false, disabled inheritMcp/subagent, or external skills', () => {
  const noInheritCust = buildValidStageOrchestratorMarkdown().replace(
    'inheritCustomizations: true',
    'inheritCustomizations: false'
  );
  assert.throws(() => verifyStageOrchestratorContract(noInheritCust), {
    name: 'Error',
    message: /CRITICAL: stage_orchestrator must set 'inheritCustomizations: true'/
  });

  const noInheritMcp = buildValidStageOrchestratorMarkdown().replace(
    'inheritMcp: true',
    'inheritMcp: false'
  );
  assert.throws(() => verifyStageOrchestratorContract(noInheritMcp), {
    name: 'Error',
    message: /CRITICAL: stage_orchestrator must set 'inheritMcp: true'/
  });

  const notSubagent = buildValidStageOrchestratorMarkdown().replace('subagent: true', 'subagent: false');
  assert.throws(() => verifyStageOrchestratorContract(notSubagent), {
    name: 'Error',
    message: /CRITICAL: stage_orchestrator must set 'subagent: true'/
  });

  const withExternalSkills = buildValidStageOrchestratorMarkdown().replace(
    'commandExecutionPolicy: auto',
    'commandExecutionPolicy: auto\nskills:\n  - weave-orchestrator'
  );
  assert.throws(() => verifyStageOrchestratorContract(withExternalSkills), {
    name: 'Error',
    message: /CRITICAL: stage_orchestrator must inline its execution protocol and omit external startup skills/
  });
});

test('verifyStageOrchestratorContract - Failure Path 3: rejects bloated IDE tools or missing coordination tools', () => {
  const withRunCommand = buildValidStageOrchestratorMarkdown().replace(
    '  - send_message',
    '  - send_message\n  - run_command'
  );
  assert.throws(() => verifyStageOrchestratorContract(withRunCommand), {
    name: 'Error',
    message: /CRITICAL: stage_orchestrator tools must match minimal coordination set/
  });

  const withCallMcpInTools = buildValidStageOrchestratorMarkdown().replace(
    '  - send_message',
    '  - send_message\n  - call_mcp_tool'
  );
  assert.throws(() => verifyStageOrchestratorContract(withCallMcpInTools), {
    name: 'Error',
    message: /CRITICAL: stage_orchestrator tools must match minimal coordination set/
  });

  const missingInvokeSubagent = buildValidStageOrchestratorMarkdown().replace(
    '  - invoke_subagent\n',
    ''
  );
  assert.throws(() => verifyStageOrchestratorContract(missingInvokeSubagent), {
    name: 'Error',
    message: /CRITICAL: stage_orchestrator tools must match minimal coordination set/
  });
});

test('verifyStageOrchestratorContract - Failure Path 4: rejects missing inline MCP signatures or missing Two-Phase / idle markers', () => {
  const missingDiscoverSig = buildValidStageOrchestratorMarkdown().replace(
    COMPACT_TOOL_SIGNATURES.weave_discover_agents,
    '{"directory": string}'
  );
  assert.throws(() => verifyStageOrchestratorContract(missingDiscoverSig), {
    name: 'Error',
    message: /CRITICAL: Missing or drifted compact signature for 'weave_discover_agents'/
  });

  const missingProvisionerGate = buildValidStageOrchestratorMarkdown().replace(
    'PROVISIONING_COMPLETE',
    'READY'
  );
  assert.throws(() => verifyStageOrchestratorContract(missingProvisionerGate), {
    name: 'Error',
    message: /missing required 'PROVISIONING_COMPLETE gate' contract/
  });

  const missingIdleGuard = buildValidStageOrchestratorMarkdown().replace(
    'NEVER call `manage_subagents` or `kill`',
    'Terminate child agents'
  );
  assert.throws(() => verifyStageOrchestratorContract(missingIdleGuard), {
    name: 'Error',
    message: /missing required 'idle child preservation \(no kill\)' contract/
  });
});

test('R5 Repository Audit - Happy Path: agents/stage_orchestrator.md and skills enforce lean per-stage sub-orchestration (#11)', () => {
  const pluginStageOrch = fs.readFileSync(
    path.join(REPO_ROOT, 'agents', 'stage_orchestrator.md'),
    'utf-8'
  );
  const localStageOrch = fs.readFileSync(
    path.join(REPO_ROOT, '.agent', 'agents', 'stage_orchestrator.md'),
    'utf-8'
  );

  assert.equal(pluginStageOrch, localStageOrch);
  const contractResult = verifyStageOrchestratorContract(pluginStageOrch);
  assert.equal(contractResult.verified, true);
  assert.ok(
    pluginStageOrch.split(/\r?\n/).length <= 120,
    'stage_orchestrator.md must stay compact (<= 120 lines) to preserve ~8.5K–9.5K Turn-1 prefill'
  );

  const coreOrch = fs.readFileSync(
    path.join(REPO_ROOT, 'skills', 'weave-orchestrator', 'SKILL.md'),
    'utf-8'
  );
  assert.match(coreOrch, /TypeName:\s*"stage_orchestrator"/);
  assert.match(coreOrch, /stage_orchestrator_<stage_slug>/);
  assert.match(coreOrch, /suborchestrator_<unit_id>/);
  assert.match(coreOrch, /NEVER\*\*\s+call\s+`manage_subagents`/);
  assert.doesNotMatch(coreOrch, /invoke\s+`TypeName:\s*"self"`/i);

  const execSkill = fs.readFileSync(
    path.join(REPO_ROOT, 'skills', 'orchestrator-agent-execution', 'SKILL.md'),
    'utf-8'
  );
  assert.match(execSkill, /TypeName:\s*"stage_orchestrator"/);
  assert.match(execSkill, /stage_orchestrator_<stage_slug>/);
  assert.match(execSkill, /suborchestrator_<unit_id>/);
  assert.doesNotMatch(execSkill, /invoke\s+`TypeName:\s*"self"`/i);

  const authoringOrch = fs.readFileSync(
    path.join(REPO_ROOT, 'skills', 'weave-authoring', 'references', 'authoring_orchestrator.md'),
    'utf-8'
  );
  assert.match(authoringOrch, /stage_orchestrator/);
  assert.match(authoringOrch, /do \*\*NOT\*\* preload modular guides under `orchestrator\/\*\.md`/);

  const authoringParallel = fs.readFileSync(
    path.join(REPO_ROOT, 'skills', 'weave-authoring', 'references', 'authoring_parallelization.md'),
    'utf-8'
  );
  assert.match(authoringParallel, /stage_orchestrator/);
  assert.match(authoringParallel, /Mode: stage/);
  assert.match(authoringParallel, /Mode: cluster/);
});
