import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOOLS,
  COMPACT_TOOL_SIGNATURES,
  NO_SCHEMA_READ_FRAGMENT,
  verifyInlineToolSignatures
} from '../src/tool_schemas.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Extracts `"key"` vs `"key"?` parameter entries from a compact 1-line tool signature.
 * @param {string} signature
 * @returns {{ requiredKeys: string[], optionalKeys: string[], allKeys: string[] }}
 */
function parseSignatureKeys(signature) {
  const requiredKeys = [];
  const optionalKeys = [];
  const allKeys = [];
  const regex = /"([a-z_]+)"(\?)?\s*:/g;
  let match;
  while ((match = regex.exec(signature)) !== null) {
    const [, key, optionalMarker] = match;
    allKeys.push(key);
    if (optionalMarker === '?') {
      optionalKeys.push(key);
    } else {
      requiredKeys.push(key);
    }
  }
  return { requiredKeys, optionalKeys, allKeys };
}

test('COMPACT_TOOL_SIGNATURES - Happy Path: matches TOOLS inputSchema keys and required/optional markers 1-to-1', () => {
  assert.equal(Object.isFrozen(COMPACT_TOOL_SIGNATURES), true);
  const toolNames = TOOLS.map((t) => t.name);
  assert.deepEqual(Object.keys(COMPACT_TOOL_SIGNATURES).sort(), [...toolNames].sort());

  for (const tool of TOOLS) {
    const sig = COMPACT_TOOL_SIGNATURES[tool.name];
    assert.equal(typeof sig, 'string');
    assert.equal(sig.includes('\n'), false, `Signature for ${tool.name} must be a single line`);

    const schemaProps = Object.keys(tool.inputSchema.properties || {});
    const schemaRequired = new Set(tool.inputSchema.required || []);
    const parsed = parseSignatureKeys(sig);

    assert.deepEqual(
      parsed.allKeys,
      schemaProps,
      `Property keys in COMPACT_TOOL_SIGNATURES.${tool.name} must match TOOLS inputSchema.properties`
    );

    for (const prop of schemaProps) {
      if (schemaRequired.has(prop)) {
        assert.ok(
          parsed.requiredKeys.includes(prop),
          `Expected '${prop}' to be marked required ("${prop}":) in COMPACT_TOOL_SIGNATURES.${tool.name}`
        );
      } else {
        assert.ok(
          parsed.optionalKeys.includes(prop),
          `Expected '${prop}' to be marked optional ("${prop}"?:) in COMPACT_TOOL_SIGNATURES.${tool.name}`
        );
      }
    }
  }
});

test('verifyInlineToolSignatures - Happy Path: validates markdown containing required compact signatures and no-schema-read rule', () => {
  const md = [
    '# Sample Skill',
    `Do NOT read ${NO_SCHEMA_READ_FRAGMENT} unless an unexpected schema error occurs.`,
    `- weave_verify: \`${COMPACT_TOOL_SIGNATURES.weave_verify}\``,
    `- weave_update: \`${COMPACT_TOOL_SIGNATURES.weave_update}\``
  ].join('\n');

  const res = verifyInlineToolSignatures(md, ['weave_verify', 'weave_update']);
  assert.deepEqual(res, { verified: true, tools: ['weave_verify', 'weave_update'] });
});

test('verifyInlineToolSignatures - Failure Path 1: throws TypeError on empty/non-string content or invalid requiredTools', () => {
  assert.throws(() => verifyInlineToolSignatures('', ['weave_init']), {
    name: 'TypeError',
    message: /CRITICAL: content must be a non-empty string/
  });
  assert.throws(() => verifyInlineToolSignatures(null, ['weave_init']), {
    name: 'TypeError',
    message: /CRITICAL: content must be a non-empty string/
  });
  assert.throws(() => verifyInlineToolSignatures('# Doc', []), {
    name: 'TypeError',
    message: /CRITICAL: requiredTools must be a non-empty array/
  });
  assert.throws(() => verifyInlineToolSignatures('# Doc', 'weave_init'), {
    name: 'TypeError',
    message: /CRITICAL: requiredTools must be a non-empty array/
  });
});

test('verifyInlineToolSignatures - Failure Path 2: throws Error on unknown tool, drifted signature, or missing schema-read prohibition', () => {
  const validWithNoProhibition = `weave_verify: ${COMPACT_TOOL_SIGNATURES.weave_verify}`;

  assert.throws(() => verifyInlineToolSignatures(validWithNoProhibition, ['unknown_tool']), {
    name: 'Error',
    message: /CRITICAL: Unknown WeaveMAS MCP tool 'unknown_tool'/
  });

  assert.throws(
    () => verifyInlineToolSignatures(`No ${NO_SCHEMA_READ_FRAGMENT} reads.\nweave_verify: {"dir": string}`, ['weave_verify']),
    {
      name: 'Error',
      message: /CRITICAL: Missing or drifted compact signature for 'weave_verify'/
    }
  );

  assert.throws(() => verifyInlineToolSignatures(validWithNoProhibition, ['weave_verify']), {
    name: 'Error',
    message: /CRITICAL: Missing explicit prohibition against reading '<appDataDir>\/mcp\/weavemas_weave\/\*\.json'/
  });
});

test('R7 Skill & Agent Audit - Happy Path: core skills inline exact MCP signatures and consolidate startup reads', () => {
  const allFiveTools = ['weave_init', 'weave_update', 'weave_verify', 'weave_read', 'discover_agents'];

  const coreOrch = fs.readFileSync(
    path.join(REPO_ROOT, 'skills', 'weave-core-orchestrator', 'SKILL.md'),
    'utf-8'
  );
  verifyInlineToolSignatures(coreOrch, allFiveTools);
  assert.match(coreOrch, /Do \*\*NOT\*\* read `orchestrator-agent-instantiation\/SKILL\.md` or `orchestrator-agent-execution\/SKILL\.md` on startup/);
  assert.match(coreOrch, /PROVISIONING_COMPLETE/);
  assert.match(coreOrch, /Protocol A/);
  assert.match(coreOrch, /Protocol B/);

  const instSkill = fs.readFileSync(
    path.join(REPO_ROOT, 'skills', 'orchestrator-agent-instantiation', 'SKILL.md'),
    'utf-8'
  );
  verifyInlineToolSignatures(instSkill, ['weave_init']);
  assert.match(instSkill, /already inlined in weave-core-orchestrator — do NOT[\s\S]*read this file/);

  const execSkill = fs.readFileSync(
    path.join(REPO_ROOT, 'skills', 'orchestrator-agent-execution', 'SKILL.md'),
    'utf-8'
  );
  verifyInlineToolSignatures(execSkill, allFiveTools);
  assert.match(execSkill, /already inlined in weave-core-orchestrator — do NOT[\s\S]*read this file/);

  const coreAgent = fs.readFileSync(
    path.join(REPO_ROOT, 'skills', 'weave-core-agent', 'SKILL.md'),
    'utf-8'
  );
  verifyInlineToolSignatures(coreAgent, ['weave_verify', 'weave_update']);
});

test('R7 Provisioner & Stage Orchestrator Audit - Happy Path: provisioner sets inheritCustomizations: false and stays in sync', () => {
  const pluginProvisioner = fs.readFileSync(path.join(REPO_ROOT, 'agents', 'provisioner.md'), 'utf-8');
  const localProvisioner = fs.readFileSync(path.join(REPO_ROOT, '.agent', 'agents', 'provisioner.md'), 'utf-8');

  assert.equal(
    pluginProvisioner,
    localProvisioner,
    'agents/provisioner.md and .agent/agents/provisioner.md must remain identical'
  );
  assert.match(pluginProvisioner, /^inheritCustomizations:\s*false$/m);
  assert.match(pluginProvisioner, /^inheritMcp:\s*true$/m);
  verifyInlineToolSignatures(pluginProvisioner, ['weave_init']);

  // Stage orchestrator guard (R5): both plugin and local .agent copies must exist, match, and keep inheritCustomizations: true
  const stageOrchPath = path.join(REPO_ROOT, 'agents', 'stage_orchestrator.md');
  const localStageOrchPath = path.join(REPO_ROOT, '.agent', 'agents', 'stage_orchestrator.md');
  assert.equal(fs.existsSync(stageOrchPath), true, 'agents/stage_orchestrator.md must exist');
  assert.equal(fs.existsSync(localStageOrchPath), true, '.agent/agents/stage_orchestrator.md must exist');

  const stageOrch = fs.readFileSync(stageOrchPath, 'utf-8');
  const localStageOrch = fs.readFileSync(localStageOrchPath, 'utf-8');
  assert.equal(
    stageOrch,
    localStageOrch,
    'agents/stage_orchestrator.md and .agent/agents/stage_orchestrator.md must remain identical'
  );
  assert.match(stageOrch, /^inheritCustomizations:\s*true$/m);
  verifyInlineToolSignatures(stageOrch, ['weave_update', 'weave_read', 'discover_agents']);
});
