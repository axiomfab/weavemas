import fs from 'node:fs';
import path from 'node:path';
import {
  COMPACT_TOOL_SIGNATURES,
  verifyInlineToolSignatures,
  verifyStageOrchestratorContract
} from './tool_schemas.mjs';

/**
 * Closed top-level and nested key sets for per-harness adapter configuration files.
 */
export const ALLOWED_TOP_KEYS = Object.freeze(
  new Set([
    '$schema',
    'id',
    'displayName',
    'outputRoot',
    'targets',
    'models',
    'tools',
    'mcp',
    'revision',
    'agentFrontmatter',
    'uiTrackerLink'
  ])
);

const ALLOWED_TARGET_KEYS = new Set([
  'protocolsDir',
  'protocolFormat',
  'agentsDir',
  'mirrorAgentsDirs',
  'workerAgentsDir'
]);

const ALLOWED_MODEL_KEYS = new Set(['fast', 'inherit']);

const ALLOWED_TOOL_KEYS = new Set([
  'read',
  'readAlt',
  'write',
  'writeAlt',
  'shell',
  'shellNote',
  'subagent',
  'resume',
  'manageSubagents'
]);

const ALLOWED_MCP_KEYS = new Set([
  'style',
  'serverName',
  'wrapperTool',
  'toolPrefix',
  'schemaGlob'
]);

const ALLOWED_REVISION_KEYS = new Set(['mode', 'handleKey']);
const ALLOWED_AGENT_FM_KEYS = new Set(['agyFlags']);

export const SUPPORTED_PROTOCOL_FORMATS = Object.freeze(['skill', 'mdc', 'rule']);
export const SUPPORTED_MCP_STYLES = Object.freeze(['wrapper', 'prefixed', 'direct']);
export const SUPPORTED_REVISION_MODES = Object.freeze(['resume', 'stateless']);

/**
 * Identifiers exclusive to Antigravity (`agy`) that must never leak into other harness outputs
 * unless explicitly configured by that harness.
 */
export const AGY_EXCLUSIVE_IDENTIFIERS = Object.freeze([
  'view_file',
  'write_to_file',
  'invoke_subagent',
  'send_message',
  'manage_subagents',
  'call_mcp_tool',
  '<appDataDir>',
  'inheritCustomizations',
  'inheritMcp',
  'commandExecutionPolicy',
  'sidecar://weavemx/panel/',
  'weavemx:provisioner',
  'weavemx:stage_orchestrator'
]);

/**
 * Canonical protocol metadata and required inline MCP tool signatures per template.
 */
export const PROTOCOL_SPECS = Object.freeze([
  {
    name: 'weave-orchestrator',
    templateFile: 'protocols/weave-orchestrator.md.tmpl',
    frontmatterToken: 'PROTOCOL_WEAVE_ORCHESTRATOR_FRONTMATTER',
    foldedDescription: [
      'Self-contained WeaveMX orchestrator protocol. Includes inline weavemx_weave MCP',
      'tool signatures, Step 0 stage directory scaffolding, per-stage stage_orchestrator',
      'delegation, Phase 1 provisioner delegation, Phase 2 agent discovery/dispatch',
      '(Protocols A & B), and batch weave_read verification.'
    ],
    requiredMcpTools: ['weave_init', 'weave_update', 'weave_verify', 'weave_read', 'weave_discover_agents']
  },
  {
    name: 'weave-agent',
    templateFile: 'protocols/weave-agent.md.tmpl',
    frontmatterToken: 'PROTOCOL_WEAVE_AGENT_FRONTMATTER',
    foldedDescription: [
      'Standard WeaveMX subagent execution protocol with inline weavemx_weave MCP',
      'signatures, CWD sandboxing, Turn-1 pre-flight verification, and 1-line chat acks.'
    ],
    requiredMcpTools: ['weave_verify', 'weave_update']
  },
  {
    name: 'weave-authoring',
    templateFile: 'protocols/weave-authoring.md.tmpl',
    frontmatterToken: 'PROTOCOL_WEAVE_AUTHORING_FRONTMATTER',
    foldedDescription: [
      'Authoring guide for WeaveMX: designing decoupled multi-agent pipelines, weaving concrete status contracts into agent instructions, building observable UI dashboards, and revising outcomes and pipeline definitions from user feedback.'
    ],
    requiredMcpTools: []
  },
  {
    name: 'orchestrator-agent-instantiation',
    templateFile: 'protocols/orchestrator-agent-instantiation.md.tmpl',
    frontmatterToken: 'PROTOCOL_INSTANTIATION_FRONTMATTER',
    foldedDescription: [
      'Standalone Phase 1 reference (already inlined in weave-orchestrator — do NOT',
      'read this file if weave-orchestrator is already loaded).'
    ],
    requiredMcpTools: ['weave_init']
  },
  {
    name: 'orchestrator-agent-execution',
    templateFile: 'protocols/orchestrator-agent-execution.md.tmpl',
    frontmatterToken: 'PROTOCOL_EXECUTION_FRONTMATTER',
    foldedDescription: [
      'Standalone Phase 2 reference (already inlined in weave-orchestrator — do NOT',
      'read this file if weave-orchestrator is already loaded).'
    ],
    requiredMcpTools: ['weave_init', 'weave_update', 'weave_verify', 'weave_read', 'weave_discover_agents']
  }
]);

export const AGENT_SPECS = Object.freeze([
  {
    name: 'provisioner',
    templateFile: 'agents/provisioner.md.tmpl',
    requiredMcpTools: ['weave_init']
  },
  {
    name: 'stage_orchestrator',
    templateFile: 'agents/stage_orchestrator.md.tmpl',
    requiredMcpTools: ['weave_update', 'weave_read', 'weave_discover_agents']
  }
]);

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`CRITICAL: '${label}' must be a non-null plain object.`);
  }
}

function assertClosedKeys(obj, allowedSet, label) {
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key)) {
      throw new Error(
        `CRITICAL: Unknown key '${key}' in ${label}. Allowed keys: ${Array.from(allowedSet).join(', ')}.`
      );
    }
  }
}

function assertNonEmptyString(val, label) {
  if (typeof val !== 'string' || !val.trim()) {
    throw new TypeError(`CRITICAL: '${label}' must be a non-empty string.`);
  }
}

function assertSafeRelDir(val, label, allowDot = false) {
  assertNonEmptyString(val, label);
  const normalized = val.replace(/\\/g, '/');
  if (path.isAbsolute(val) || normalized.startsWith('/')) {
    throw new Error(`CRITICAL: '${label}' must be a relative path, got '${val}'.`);
  }
  if (normalized === '.' && allowDot) return;
  const segments = normalized.split('/');
  if (segments.some((s) => !s || s === '.' || s === '..')) {
    throw new Error(`CRITICAL: '${label}' contains invalid path segments: '${val}'.`);
  }
}

/**
 * Validates a harness adapter configuration object against the closed schema.
 * @param {Record<string, any>} config
 * @returns {Record<string, any>} The validated config reference.
 */
export function validateHarnessConfig(config) {
  assertPlainObject(config, 'config');
  assertClosedKeys(config, ALLOWED_TOP_KEYS, 'config');

  assertNonEmptyString(config.id, 'id');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(config.id)) {
    throw new Error(`CRITICAL: 'id' must be lowercase kebab-case, got '${config.id}'.`);
  }
  assertNonEmptyString(config.displayName, 'displayName');

  if (config.outputRoot !== undefined) {
    assertSafeRelDir(config.outputRoot, 'outputRoot', true);
  }

  // targets
  assertPlainObject(config.targets, 'targets');
  assertClosedKeys(config.targets, ALLOWED_TARGET_KEYS, 'targets');
  assertSafeRelDir(config.targets.protocolsDir, 'targets.protocolsDir');
  assertSafeRelDir(config.targets.agentsDir, 'targets.agentsDir');
  if (!SUPPORTED_PROTOCOL_FORMATS.includes(config.targets.protocolFormat)) {
    throw new Error(
      `CRITICAL: 'targets.protocolFormat' must be one of [${SUPPORTED_PROTOCOL_FORMATS.join(', ')}], got '${String(config.targets.protocolFormat)}'.`
    );
  }
  if (config.targets.mirrorAgentsDirs !== undefined) {
    if (!Array.isArray(config.targets.mirrorAgentsDirs)) {
      throw new TypeError("CRITICAL: 'targets.mirrorAgentsDirs' must be an array of relative directory strings.");
    }
    for (const dir of config.targets.mirrorAgentsDirs) {
      assertSafeRelDir(dir, 'targets.mirrorAgentsDirs[]');
    }
  }
  if (config.targets.workerAgentsDir !== undefined) {
    assertSafeRelDir(config.targets.workerAgentsDir, 'targets.workerAgentsDir');
  }

  // models
  assertPlainObject(config.models, 'models');
  assertClosedKeys(config.models, ALLOWED_MODEL_KEYS, 'models');
  assertNonEmptyString(config.models.fast, 'models.fast');
  assertNonEmptyString(config.models.inherit, 'models.inherit');

  // tools
  assertPlainObject(config.tools, 'tools');
  assertClosedKeys(config.tools, ALLOWED_TOOL_KEYS, 'tools');
  for (const reqTool of ['read', 'write', 'shell', 'subagent']) {
    assertNonEmptyString(config.tools[reqTool], `tools.${reqTool}`);
  }
  for (const optStr of ['readAlt', 'writeAlt']) {
    if (config.tools[optStr] !== undefined) {
      assertNonEmptyString(config.tools[optStr], `tools.${optStr}`);
    }
  }
  if (config.tools.shellNote !== undefined && typeof config.tools.shellNote !== 'string') {
    throw new TypeError("CRITICAL: 'tools.shellNote' must be a string.");
  }
  for (const nullableTool of ['resume', 'manageSubagents']) {
    if (config.tools[nullableTool] !== undefined && config.tools[nullableTool] !== null) {
      assertNonEmptyString(config.tools[nullableTool], `tools.${nullableTool}`);
    }
  }

  // mcp
  assertPlainObject(config.mcp, 'mcp');
  assertClosedKeys(config.mcp, ALLOWED_MCP_KEYS, 'mcp');
  if (!SUPPORTED_MCP_STYLES.includes(config.mcp.style)) {
    throw new Error(
      `CRITICAL: 'mcp.style' must be one of [${SUPPORTED_MCP_STYLES.join(', ')}], got '${String(config.mcp.style)}'.`
    );
  }
  assertNonEmptyString(config.mcp.serverName, 'mcp.serverName');
  if (config.mcp.style === 'wrapper') {
    assertNonEmptyString(config.mcp.wrapperTool, 'mcp.wrapperTool');
  } else if (config.mcp.style === 'prefixed') {
    assertNonEmptyString(config.mcp.toolPrefix, 'mcp.toolPrefix');
  } else if (config.mcp.toolPrefix !== undefined && typeof config.mcp.toolPrefix !== 'string') {
    throw new TypeError("CRITICAL: 'mcp.toolPrefix' must be a string when provided.");
  }
  if (config.mcp.schemaGlob !== undefined && config.mcp.schemaGlob !== null) {
    assertNonEmptyString(config.mcp.schemaGlob, 'mcp.schemaGlob');
  }

  // revision
  assertPlainObject(config.revision, 'revision');
  assertClosedKeys(config.revision, ALLOWED_REVISION_KEYS, 'revision');
  if (!SUPPORTED_REVISION_MODES.includes(config.revision.mode)) {
    throw new Error(
      `CRITICAL: 'revision.mode' must be one of [${SUPPORTED_REVISION_MODES.join(', ')}], got '${String(config.revision.mode)}'.`
    );
  }
  if (config.revision.mode === 'resume') {
    assertNonEmptyString(config.tools.resume, 'tools.resume (required when revision.mode is "resume")');
    assertNonEmptyString(config.revision.handleKey, 'revision.handleKey (required when revision.mode is "resume")');
  }

  // agentFrontmatter
  if (config.agentFrontmatter !== undefined) {
    assertPlainObject(config.agentFrontmatter, 'agentFrontmatter');
    assertClosedKeys(config.agentFrontmatter, ALLOWED_AGENT_FM_KEYS, 'agentFrontmatter');
    if (config.agentFrontmatter.agyFlags !== undefined && typeof config.agentFrontmatter.agyFlags !== 'boolean') {
      throw new TypeError("CRITICAL: 'agentFrontmatter.agyFlags' must be a boolean.");
    }
  }

  if (config.uiTrackerLink !== undefined && config.uiTrackerLink !== null) {
    assertNonEmptyString(config.uiTrackerLink, 'uiTrackerLink');
  }

  return config;
}

/**
 * Formats YAML frontmatter for a protocol file (`skill`, `mdc`, or `rule`).
 * @param {string} format
 * @param {string} name
 * @param {string[]} foldedLines
 * @returns {string}
 */
function buildProtocolFrontmatter(format, name, foldedLines) {
  if (format === 'skill') {
    return [
      '---',
      `name: ${name}`,
      'description: >-',
      ...foldedLines.map((line) => `  ${line}`),
      '---'
    ].join('\n');
  }

  const singleLineDesc = foldedLines.join(' ');
  if (format === 'mdc') {
    return [
      '---',
      `description: ${singleLineDesc}`,
      'alwaysApply: false',
      '---'
    ].join('\n');
  }

  // 'rule' (e.g. Windsurf .windsurf/rules/<name>.md)
  return [
    '---',
    'trigger: model_decision',
    `description: ${singleLineDesc}`,
    '---'
  ].join('\n');
}

/**
 * Formats YAML frontmatter for `provisioner.md` or `stage_orchestrator.md`.
 * @param {'provisioner'|'stage_orchestrator'} agentName
 * @param {Record<string, any>} config
 * @param {(toolName: string) => string} mcpToolRef
 * @returns {string}
 */
function buildAgentFrontmatter(agentName, config, mcpToolRef) {
  const isAgy = Boolean(config.agentFrontmatter?.agyFlags);

  if (agentName === 'provisioner') {
    const tools = [config.tools.read];
    if (config.mcp.style !== 'wrapper') {
      tools.push(mcpToolRef('weave_init'));
    }
    const lines = [
      '---',
      'name: provisioner',
      'description: Ephemeral workspace provisioner that scaffolds agent directories and initializes weave.md (including instructions_file, inputs, and outputs) via MCP weave_init.',
      `model: ${config.models.fast}`,
      'subagent: true'
    ];
    if (isAgy) {
      lines.push('inheritMcp: true');
      lines.push('inheritCustomizations: false');
      lines.push('commandExecutionPolicy: auto');
    }
    lines.push('tools:');
    for (const t of tools) lines.push(`  - ${t}`);
    lines.push('---');
    return lines.join('\n');
  }

  const coordLabel = config.revision.mode === 'resume' ? 'dispatch/messaging' : 'dispatch/revisions';
  const tools = [config.tools.read, config.tools.subagent];
  if (
    config.revision.mode === 'resume' &&
    config.tools.resume &&
    !tools.includes(config.tools.resume)
  ) {
    tools.push(config.tools.resume);
  }
  if (config.mcp.style !== 'wrapper') {
    for (const mcpName of ['weave_discover_agents', 'weave_update', 'weave_read']) {
      tools.push(mcpToolRef(mcpName));
    }
  }

  const lines = [
    '---',
    'name: stage_orchestrator',
    `description: Lean per-stage and cluster sub-orchestrator that runs Two-Phase execution (provisioner, agent discovery, subagent ${coordLabel}, and batch weave_read verification) in an isolated context window.`,
    `model: ${config.models.inherit}`,
    'subagent: true'
  ];
  if (isAgy) {
    lines.push('inheritMcp: true');
    lines.push('inheritCustomizations: true');
    lines.push('commandExecutionPolicy: auto');
  }
  lines.push('tools:');
  for (const t of tools) lines.push(`  - ${t}`);
  lines.push('---');
  return lines.join('\n');
}

/**
 * Builds the complete deterministic template token dictionary for a validated harness config.
 * @param {Record<string, any>} config
 * @returns {Record<string, string>}
 */
export function buildTemplateContext(config) {
  validateHarnessConfig(config);

  const isAgy = Boolean(config.agentFrontmatter?.agyFlags);
  const { targets, models, tools, mcp, revision } = config;
  const workerAgentsDir = targets.workerAgentsDir || targets.agentsDir;
  const prefix = mcp.style === 'prefixed' ? mcp.toolPrefix : mcp.toolPrefix || '';
  const mcpToolRef = (toolName) =>
    mcp.style === 'wrapper' ? toolName : `${prefix}${toolName}`;

  const readSlash = tools.readAlt ? `\`${tools.read}\` / \`${tools.readAlt}\`` : `\`${tools.read}\``;
  const altReadSlash = tools.readAlt ? `\`${tools.readAlt}\` / \`${tools.read}\`` : `\`${tools.read}\``;
  const writeSlash = tools.writeAlt ? `\`${tools.write}\` / \`${tools.writeAlt}\`` : `\`${tools.write}\``;
  const primaryAltRead = tools.readAlt || tools.read;
  const primaryAltWrite = tools.writeAlt || tools.write;

  const mcpSignatureContext =
    mcp.style === 'wrapper'
      ? `\`ServerName: "${mcp.serverName}"\``
      : prefix
        ? `\`Server: "${mcp.serverName}", Prefix: "${prefix}"\``
        : `\`Server: "${mcp.serverName}"\``;

  const mcpSchemaRef = mcp.schemaGlob ? `\`${mcp.schemaGlob}\`` : 'MCP server schema files';
  const mcpCallWeaveInit =
    mcp.style === 'wrapper'
      ? `\`${mcp.wrapperTool}\` (\`ServerName: "${mcp.serverName}"\`, \`ToolName: "weave_init"\`)`
      : `\`${mcpToolRef('weave_init')}\``;
  const mcpDirectContainer =
    mcp.style === 'wrapper' ? `\`${mcp.wrapperTool}\`` : `the \`${mcp.serverName}\` MCP tool call`;
  const mcpBatchTool =
    mcp.style === 'wrapper' ? mcp.wrapperTool : mcpToolRef('weave_update');

  const protocolNoun = targets.protocolFormat === 'skill' ? 'skill' : 'rule';
  const protocolFileRef =
    targets.protocolFormat === 'skill'
      ? '`SKILL.md`'
      : targets.protocolFormat === 'mdc'
        ? '`.mdc` rule'
        : 'rule `.md`';

  const instantiationRefPath =
    targets.protocolFormat === 'skill'
      ? 'orchestrator-agent-instantiation/SKILL.md'
      : targets.protocolFormat === 'mdc'
        ? 'orchestrator-agent-instantiation.mdc'
        : 'orchestrator-agent-instantiation.md';
  const executionRefPath =
    targets.protocolFormat === 'skill'
      ? 'orchestrator-agent-execution/SKILL.md'
      : targets.protocolFormat === 'mdc'
        ? 'orchestrator-agent-execution.mdc'
        : 'orchestrator-agent-execution.md';

  const weaveMdLink = '[weave.md](file://<workspace_root>/runs/<context_slug>/weave.md)';
  const uiTrackerSurface = config.uiTrackerLink
    ? `\`${config.uiTrackerLink}\``
    : `\`${weaveMdLink}\``;
  const uiTrackerGateSurface = config.uiTrackerLink
    ? `\`${config.uiTrackerLink}\`, \`${weaveMdLink}\`,`
    : `\`${weaveMdLink}\``;
  const uiTrackerNextStageSurface = config.uiTrackerLink
    ? `\`${config.uiTrackerLink}\` and \`${weaveMdLink}\``
    : `\`${weaveMdLink}\``;
  const uiTrackerExecSurface = config.uiTrackerLink
    ? `\`${config.uiTrackerLink}\` + \`${weaveMdLink}\``
    : `\`${weaveMdLink}\``;
  const orchAnnounceTracker = config.uiTrackerLink
    ? `Output \`${config.uiTrackerLink}\` and \`${weaveMdLink}\` (using forward slashes in the \`file://\` URI) at pipeline start and at the start of every stage.`
    : `Output \`${weaveMdLink}\` (using forward slashes in the \`file://\` URI) at pipeline start and at the start of every stage.`;
  const authoringModelGuidance = isAgy
    ? 'Configure subagents with `flash` (recommended default), `pro`, or `inherit`. **NEVER use `flash_lite`** (fails to invoke `call_mcp_tool` reliably).'
    : `Configure subagents with \`${models.fast}\` (recommended default for lightweight roles) or \`${models.inherit}\` so every worker reliably invokes \`${mcp.serverName}\` MCP tools.`;

  // Provisioner & Stage Orchestrator invocation strings
  const provisionerInvokeCall = isAgy
    ? `Invoke \`provisioner\` (\`TypeName: "provisioner"\` or \`"weavemx:provisioner"\`, \`Model: "${models.fast}"\`, \`Role: "provisioner"\`)`
    : `Invoke \`provisioner\` via \`${tools.subagent}\` (agent \`"provisioner"\`, model \`"${models.fast}"\`, role \`"provisioner"\`)`;

  const orchDispatchProvisionerHead = isAgy
    ? `Invoke \`TypeName: "provisioner"\` (or \`"weavemx:provisioner"\`), \`Model: "${models.fast}"\`, \`Role: "provisioner"\``
    : `Invoke \`provisioner\` via \`${tools.subagent}\` (model \`"${models.fast}"\`, role \`"provisioner"\`)`;

  const orchDispatchStageHead = isAgy
    ? `Invoke \`TypeName: "stage_orchestrator"\` (or \`"weavemx:stage_orchestrator"\`), \`Model: "${models.inherit}"\`, \`Role: "stage_orchestrator_<stage_slug>"\``
    : `Invoke \`stage_orchestrator\` via \`${tools.subagent}\` (model \`"${models.inherit}"\`, role \`"stage_orchestrator_<stage_slug>"\`)`;

  const stageOrchProtocolBCall = isAgy
    ? `invoke \`stage_orchestrator\` (\`TypeName: "stage_orchestrator"\` or \`"weavemx:stage_orchestrator"\`, \`Model: "${models.inherit}"\`, \`Role: "suborchestrator_<unit_id>"\`, concurrently only if \`execute in parallel\` is declared)`
    : `invoke \`stage_orchestrator\` via \`${tools.subagent}\` (model \`"${models.inherit}"\`, role \`"suborchestrator_<unit_id>"\`, concurrently only if \`execute in parallel\` is declared)`;

  const orchProtocolBHead = isAgy
    ? `Invoke \`TypeName: "stage_orchestrator"\` (or \`"weavemx:stage_orchestrator"\`), \`Model: "${models.inherit}"\`, \`Role: "suborchestrator_<unit_id>"\` (**never** \`TypeName: "self"\`, avoiding \`18K–27K\` main-harness prefill bloat; dispatch concurrently only if \`execute in parallel\` is declared)`
    : `Invoke \`stage_orchestrator\` via \`${tools.subagent}\` (model \`"${models.inherit}"\`, role \`"suborchestrator_<unit_id>"\`, avoiding main-harness context bloat; dispatch concurrently only if \`execute in parallel\` is declared)`;

  const clusterChildTypeLabel = isAgy ? 'TypeName' : 'Agent';

  // Stateful resume vs stateless disk-backed fallback clauses
  const isSameResumeTool = revision.mode === 'resume' && tools.resume === tools.subagent;
  const resumeActionVerb =
    revision.mode === 'resume'
      ? isSameResumeTool
        ? `resuming via \`${tools.resume}\` (\`resume\`)`
        : `\`${tools.resume}\``
      : `stateless re-dispatch via \`${tools.subagent}\``;

  const stageOrchProtocolADispatch = isAgy
    ? `Invoke each worker via \`${tools.subagent}\` using \`TypeName: "<filename_stem_of_instructions_file>"\` and \`Role: "<agent_id>"\` (omit \`Model\`; never tell a worker to read its own \`instructions_file\`)`
    : `Invoke each worker via \`${tools.subagent}\` using agent \`"<filename_stem_of_instructions_file>"\` and role \`"<agent_id>"\` (never tell a worker to read its own \`instructions_file\`)`;

  let stageOrchProtocolAPost;
  let stageOrchIdlePreservation;
  let stageOrchModeBDispatch;
  let stageOrchModeBIdle;
  let stageOrchSection3;
  let orchKeepStageIdle;
  let orchProtocolABody;
  let orchProtocolBTail;
  let orchGateRevisionRouting;
  let weaveAgentWakeupTrigger;
  let execRefMultistageItem;
  let execRefProtocolAItems;
  let execRefProtocolBItem1;
  let execRefProtocolBItem2;
  let execRefGateRevision;

  if (revision.mode === 'resume') {
    const handle = revision.handleKey;
    const viaResume = isSameResumeTool
      ? `by resuming via \`${tools.resume}\` (\`resume: "<${handle}>"\`)`
      : `via \`${tools.resume}\``;

    stageOrchProtocolAPost = isAgy
      ? `Immediately persist \`${handle}\` via \`weave_update\` (\`{"dir": "<dir>", "conversation_id": "<${handle}>"}\`). Route intra-stage audit/handoff loops via \`${tools.resume}\` (max declared cycles, default 2).`
      : `Immediately persist \`${handle}\` (when UUID-formatted) via \`weave_update\` (\`{"dir": "<dir>", "conversation_id": "<${handle}>"}\`). Route intra-stage audit/handoff loops ${viaResume} (max declared cycles, default 2).`;

    stageOrchIdlePreservation = tools.manageSubagents
      ? `Leave all child subagents **idle** (NEVER call \`${tools.manageSubagents}\` or \`kill\` any child session, preserving worker conversations for downstream surgical edits).`
      : 'Leave all child subagents **idle** (NEVER terminate or discard child session IDs, preserving worker sessions for downstream surgical edits).';

    stageOrchModeBDispatch = isAgy
      ? `Dispatch each child via \`${tools.subagent}\` (\`TypeName: "<child_type>"\`, \`Role: "<child_id>"\`, omit \`Model\`, pass \`Assigned Working Directory: <child_wd>/\`, \`Runtime Parameters:\` with \`context_slug\` + unit params, and local \`Required Output:\` if non-empty), immediately persist \`${handle}\` via \`weave_update\` (\`{"dir": "<child_wd>", "conversation_id": "<${handle}>"}\`), and route audit revisions via \`${tools.resume}\` (max 2 cycles).`
      : `Dispatch each child via \`${tools.subagent}\` (agent \`"<child_type>"\`, role \`"<child_id>"\`, pass \`Assigned Working Directory: <child_wd>/\`, \`Runtime Parameters:\` with \`context_slug\` + unit params, and local \`Required Output:\` if non-empty), persist \`${handle}\` (when UUID-formatted) via \`weave_update\` (\`{"dir": "<child_wd>", "conversation_id": "<${handle}>"}\`), and route audit revisions ${viaResume} (max 2 cycles).`;

    stageOrchModeBIdle = tools.manageSubagents
      ? 'leave all children idle (never `kill`)'
      : 'leave all children idle';

    stageOrchSection3 = isAgy
      ? [
          `## 3. Surgical Revision Resume (\`${tools.resume}\`)`,
          '',
          `When resumed via \`${tools.resume}\` with revision feedback (e.g. from a Root Orchestrator User Review Gate), retrieve the target worker's \`conversation_id\` (from session memory or \`weave_read\` / \`weave_discover_agents\`), forward feedback via \`${tools.resume}\` (never spawn duplicate workers), run any required peer re-audit loop, re-verify via \`weave_read\`, and return the 1-line \`STAGE_COMPLETED\` or \`CLUSTER_COMPLETED\` ack.`
        ].join('\n')
      : [
          `## 3. Surgical Revision Resume (\`${tools.resume}\`)`,
          '',
          `When resumed via \`${tools.resume}\` with revision feedback (e.g. from a Root Orchestrator User Review Gate), retrieve the target worker's session handle (\`${handle}\` / \`conversation_id\` from session memory or \`weave_read\` / \`weave_discover_agents\`), forward feedback ${viaResume} (never spawn duplicate workers), run any required peer re-audit loop, re-verify via \`weave_read\`, and return the 1-line \`STAGE_COMPLETED\` or \`CLUSTER_COMPLETED\` ack.`
        ].join('\n');

    orchKeepStageIdle = tools.manageSubagents
      ? `**Keep \`stage_orchestrator\` Idle (Never \`kill\`)**: Once a stage finishes, leave its \`stage_orchestrator\` session **idle** (zero token cost). **NEVER** call \`${tools.manageSubagents}\` (\`kill\` or \`kill_all\`)—killing a \`stage_orchestrator\` also kills its descendant worker conversations, breaking downstream surgical \`${tools.resume}\` revisions.`
      : `**Keep \`stage_orchestrator\` Idle**: Once a stage finishes, leave its \`stage_orchestrator\` session **idle** (zero token cost). **NEVER** discard its session handle—preserving descendant worker sessions for downstream surgical ${resumeActionVerb} revisions.`;

    orchProtocolABody = isAgy
      ? `Dispatch via \`${tools.subagent}\` using \`TypeName: "<filename_stem_of_instructions_file>"\` and \`Role: "<agent_id>"\` (omit \`Model\`; never tell the worker to read its own \`instructions_file\`), passing \`Assigned Working Directory: <dir>/\`, \`Runtime Parameters:\` (including \`context_slug\`), and local-only \`Required Output:\` (omit if \`outputs\` is empty). Immediately persist \`${handle}\` via \`weave_update\`: \`{"dir": "<dir>", "conversation_id": "<${handle}>"}\` (omit \`status\`).`
      : `Dispatch via \`${tools.subagent}\` using agent \`"<filename_stem_of_instructions_file>"\` and role \`"<agent_id>"\` (never tell the worker to read its own \`instructions_file\`), passing \`Assigned Working Directory: <dir>/\`, \`Runtime Parameters:\` (including \`context_slug\`), and local-only \`Required Output:\` (omit if \`outputs\` is empty). Persist \`${handle}\` (when UUID-formatted) via \`weave_update\`: \`{"dir": "<dir>", "conversation_id": "<${handle}>"}\` (omit \`status\`).`;

    orchProtocolBTail = tools.manageSubagents
      ? 'Wait for `CLUSTER_COMPLETED` and keep the cluster `stage_orchestrator` session idle (never `kill`).'
      : 'Wait for `CLUSTER_COMPLETED` and keep the cluster `stage_orchestrator` session idle.';

    orchGateRevisionRouting = isAgy
      ? `route feedback via \`${tools.resume}\` to the idle \`stage_orchestrator\` for \`<stage_slug>\` (or directly to the worker's persisted \`conversation_id\` via \`weave_read\` / \`weave_discover_agents\` in stageless mode—never spawn duplicates)`
      : `route feedback ${viaResume} to the idle \`stage_orchestrator\` for \`<stage_slug>\` (or directly to the worker's persisted \`conversation_id\` / \`${handle}\` via \`weave_read\` / \`weave_discover_agents\` in stageless mode—never spawn duplicates)`;

    weaveAgentWakeupTrigger = isSameResumeTool
      ? `\`${tools.resume}\` (\`resume\`)`
      : `\`${tools.resume}\` resume`;

    execRefMultistageItem = isAgy
      ? `The Root Orchestrator stays thin by delegating each stage (\`S1..SN\`) via \`${tools.subagent}\` to \`TypeName: "stage_orchestrator"\` (or \`"weavemx:stage_orchestrator"\`), \`Model: "${models.inherit}"\`, \`Role: "stage_orchestrator_<stage_slug>"\` (\`Mode: stage\`, passing \`Stage Guide\`, \`Stage Directory\`, \`Context Slug\`, and \`Runtime Parameters\`). Keep every completed \`stage_orchestrator\` session **idle** (never \`kill\` via \`${tools.manageSubagents}\`, preserving child worker conversations for surgical \`${tools.resume}\` edits).`
      : `The Root Orchestrator stays thin by delegating each stage (\`S1..SN\`) via \`${tools.subagent}\` to \`stage_orchestrator\` (model \`"${models.inherit}"\`, role \`"stage_orchestrator_<stage_slug>"\`, \`Mode: stage\`, passing \`Stage Guide\`, \`Stage Directory\`, \`Context Slug\`, and \`Runtime Parameters\`). Keep every completed \`stage_orchestrator\` session **idle** (preserving child worker sessions for surgical ${resumeActionVerb} edits).`;

    execRefProtocolAItems = isAgy
      ? [
          `1. Dispatch via \`${tools.subagent}\` (\`TypeName: "<stem_of_instructions_file>"\`, \`Role: "<agent_id>"\`, omit \`Model\`, pass \`Assigned Working Directory: <dir>/\`, \`Runtime Parameters:\` with \`context_slug\`, and local-only \`Required Output:\` if \`outputs\` is non-empty).`,
          `2. Immediately persist \`${handle}\` via \`weave_update\`: \`{"dir": "<dir>", "conversation_id": "<${handle}>"}\` (omit \`status\`).`
        ].join('\n')
      : [
          `1. Dispatch via \`${tools.subagent}\` (agent \`"<stem_of_instructions_file>"\`, role \`"<agent_id>"\`, pass \`Assigned Working Directory: <dir>/\`, \`Runtime Parameters:\` with \`context_slug\`, and local-only \`Required Output:\` if \`outputs\` is non-empty).`,
          `2. Persist \`${handle}\` (when UUID-formatted) via \`weave_update\`: \`{"dir": "<dir>", "conversation_id": "<${handle}>"}\` (omit \`status\`).`
        ].join('\n');

    execRefProtocolBItem1 = isAgy
      ? `Discover cluster child agents (\`filter_status: "initialized"\`), then invoke \`TypeName: "stage_orchestrator"\` (or \`"weavemx:stage_orchestrator"\`), \`Model: "${models.inherit}"\`, \`Role: "suborchestrator_<unit_id>"\` (**never** \`TypeName: "self"\`, avoiding \`18K–27K\` main-harness prefill bloat; dispatch concurrently only if \`execute in parallel\` is specified).`
      : `Discover cluster child agents (\`filter_status: "initialized"\`), then invoke \`stage_orchestrator\` via \`${tools.subagent}\` (model \`"${models.inherit}"\`, role \`"suborchestrator_<unit_id>"\`; dispatch concurrently only if \`execute in parallel\` is specified).`;

    execRefProtocolBItem2 = isAgy
      ? `Pass \`Mode: cluster\`, \`Unit ID: <unit_id>\`, \`Context Slug: <context_slug>\`, and the ordered list of pre-initialized children (\`<child_id>\`, \`TypeName\`, \`WD\`, \`Params\`, local \`Output\`). \`stage_orchestrator\` enforces shared \`runs/<context_slug>/\` scoping, zero self/root \`weave.md\` writes, sequential child dispatch + immediate \`conversation_id\` persistence, \`${tools.resume}\` revision loops (max 2 cycles), single batch \`weave_read\` (\`dirs: [...]\`, \`expected_status: "completed"\`), idle child preservation (never \`kill\`), and a 1-line \`CLUSTER_COMPLETED\` ack.`
      : `Pass \`Mode: cluster\`, \`Unit ID: <unit_id>\`, \`Context Slug: <context_slug>\`, and the ordered list of pre-initialized children (\`<child_id>\`, \`Agent\`, \`WD\`, \`Params\`, local \`Output\`). \`stage_orchestrator\` enforces shared \`runs/<context_slug>/\` scoping, zero self/root \`weave.md\` writes, sequential child dispatch + session persistence, ${resumeActionVerb} revision loops (max 2 cycles), single batch \`weave_read\` (\`dirs: [...]\`, \`expected_status: "completed"\`), idle child preservation, and a 1-line \`CLUSTER_COMPLETED\` ack.`;

    execRefGateRevision = isAgy
      ? `route revisions via \`${tools.resume}\` to the idle \`stage_orchestrator\` or persisted worker \`conversation_id\` (\`status: "<stage_slug>/in_progress/iteration_<N>"\`)`
      : `route revisions ${viaResume} to the idle \`stage_orchestrator\` or persisted worker session (\`status: "<stage_slug>/in_progress/iteration_<N>"\`)`;
  } else {
    // Stateless disk-backed revision fallback (e.g. Cursor, Codex)
    stageOrchProtocolAPost = `Stateless revision fallback: when an intra-stage audit/handoff loop requires revisions (max declared cycles, default 2), re-dispatch the worker via \`${tools.subagent}\` in the same \`Assigned Working Directory: <dir>/\` with the critique bullets so it updates its on-disk deliverables and \`weave.md\` in place.`;

    stageOrchIdlePreservation =
      'Preserve all child working directories and `weave.md` manifests on disk so downstream surgical revisions can re-enter existing sandboxes without re-provisioning.';

    stageOrchModeBDispatch = `Dispatch each child via \`${tools.subagent}\` (agent \`"<child_type>"\`, role \`"<child_id>"\`, pass \`Assigned Working Directory: <child_wd>/\`, \`Runtime Parameters:\` with \`context_slug\` + unit params, and local \`Required Output:\` if non-empty), and route audit revisions via stateless disk-backed re-dispatch into \`<child_wd>/\` (max 2 cycles).`;

    stageOrchModeBIdle = 'preserve all child working directories on disk';

    stageOrchSection3 = [
      `## 3. Surgical Revision Fallback (Stateless Disk-Backed Re-Dispatch via \`${tools.subagent}\`)`,
      '',
      `When re-dispatched via \`${tools.subagent}\` with revision feedback (e.g. from a Root Orchestrator User Review Gate), inspect the stage's existing worker workspaces via \`weave_read\` / \`weave_discover_agents\`, re-dispatch ONLY the target worker in its existing \`<dir>/\` CWD with the revision bullets so it updates deliverables on disk in place (never create duplicate worker folders), run any required peer re-audit loop, re-verify via \`weave_read\`, and return the 1-line \`STAGE_COMPLETED\` or \`CLUSTER_COMPLETED\` ack.`
    ].join('\n');

    orchKeepStageIdle =
      '**Preserve Stage Sandboxes for Stateless Revisions**: Once a stage finishes, keep all `runs/<context_slug>/<stage_slug>/agents/*` directories and `weave.md` manifests intact on disk so downstream surgical edits can re-dispatch into existing worker sandboxes without re-provisioning.';

    orchProtocolABody = `Dispatch via \`${tools.subagent}\` using agent \`"<filename_stem_of_instructions_file>"\` and role \`"<agent_id>"\` (never tell the worker to read its own \`instructions_file\`), passing \`Assigned Working Directory: <dir>/\`, \`Runtime Parameters:\` (including \`context_slug\`), and local-only \`Required Output:\` (omit if \`outputs\` is empty). For revisions, re-dispatch the worker in the same \`<dir>/\` CWD so it updates on-disk artifacts in place.`;

    orchProtocolBTail =
      'Wait for `CLUSTER_COMPLETED` and keep all cluster child directories intact on disk.';

    orchGateRevisionRouting = `route feedback via stateless disk-backed fallback by re-dispatching \`stage_orchestrator\` for \`<stage_slug>\` via \`${tools.subagent}\` (or re-dispatching the target worker directly in its existing \`<dir>/\` CWD discovered via \`weave_read\` / \`weave_discover_agents\` in stageless mode so it updates deliverables on disk in place)`;

    weaveAgentWakeupTrigger = `stateless re-dispatch via \`${tools.subagent}\``;

    execRefMultistageItem = `The Root Orchestrator stays thin by delegating each stage (\`S1..SN\`) via \`${tools.subagent}\` to \`stage_orchestrator\` (model \`"${models.inherit}"\`, role \`"stage_orchestrator_<stage_slug>"\`, \`Mode: stage\`, passing \`Stage Guide\`, \`Stage Directory\`, \`Context Slug\`, and \`Runtime Parameters\`). Keep all completed stage directories intact on disk for stateless surgical revisions.`;

    execRefProtocolAItems = [
      `1. Dispatch via \`${tools.subagent}\` (agent \`"<stem_of_instructions_file>"\`, role \`"<agent_id>"\`, pass \`Assigned Working Directory: <dir>/\`, \`Runtime Parameters:\` with \`context_slug\`, and local-only \`Required Output:\` if \`outputs\` is non-empty).`,
      `2. Stateless revisions: re-dispatch the target worker via \`${tools.subagent}\` in the same \`<dir>/\` CWD so it updates existing deliverables and \`weave.md\` on disk in place.`
    ].join('\n');

    execRefProtocolBItem1 = `Discover cluster child agents (\`filter_status: "initialized"\`), then invoke \`stage_orchestrator\` via \`${tools.subagent}\` (model \`"${models.inherit}"\`, role \`"suborchestrator_<unit_id>"\`; dispatch concurrently only if \`execute in parallel\` is specified).`;

    execRefProtocolBItem2 = `Pass \`Mode: cluster\`, \`Unit ID: <unit_id>\`, \`Context Slug: <context_slug>\`, and the ordered list of pre-initialized children (\`<child_id>\`, \`Agent\`, \`WD\`, \`Params\`, local \`Output\`). \`stage_orchestrator\` enforces shared \`runs/<context_slug>/\` scoping, zero self/root \`weave.md\` writes, sequential child dispatch, stateless disk-backed revision loops (max 2 cycles), single batch \`weave_read\` (\`dirs: [...]\`, \`expected_status: "completed"\`), on-disk sandbox preservation, and a 1-line \`CLUSTER_COMPLETED\` ack.`;

    execRefGateRevision = `route revisions via stateless disk-backed re-dispatch (\`${tools.subagent}\`) into \`stage_orchestrator\` or the existing worker \`<dir>/\` CWD (\`status: "<stage_slug>/in_progress/iteration_<N>"\`)`;
  }

  const weaveAgentIntroLine =
    mcp.style === 'wrapper'
      ? `All status lifecycle operations use \`${mcp.wrapperTool}\` with \`ServerName: "${mcp.serverName}"\`, where \`dir\` is strictly the **absolute path** to your assigned working directory.`
      : `All status lifecycle operations use the \`${mcp.serverName}\` MCP tools (\`${mcpToolRef('weave_verify')}\`, \`${mcpToolRef('weave_update')}\`), where \`dir\` is strictly the **absolute path** to your assigned working directory.`;

  const context = {
    // Signatures from src/tool_schemas.mjs
    SIG_WEAVE_INIT: COMPACT_TOOL_SIGNATURES.weave_init,
    SIG_WEAVE_UPDATE: COMPACT_TOOL_SIGNATURES.weave_update,
    SIG_WEAVE_VERIFY: COMPACT_TOOL_SIGNATURES.weave_verify,
    SIG_WEAVE_READ: COMPACT_TOOL_SIGNATURES.weave_read,
    SIG_WEAVE_DISCOVER_AGENTS: COMPACT_TOOL_SIGNATURES.weave_discover_agents,

    // Frontmatters
    AGENT_PROVISIONER_FRONTMATTER: buildAgentFrontmatter('provisioner', config, mcpToolRef),
    AGENT_STAGE_ORCHESTRATOR_FRONTMATTER: buildAgentFrontmatter('stage_orchestrator', config, mcpToolRef),

    // Shared tool & MCP tokens
    MCP_SERVER_NAME: mcp.serverName,
    MCP_SIGNATURE_CONTEXT: mcpSignatureContext,
    MCP_SCHEMA_REF: mcpSchemaRef,
    MCP_CALL_WEAVE_INIT: mcpCallWeaveInit,
    MCP_DIRECT_CONTAINER: mcpDirectContainer,
    MCP_BATCH_TOOL: mcpBatchTool,
    READ_TOOL: tools.read,
    WRITE_TOOL: tools.write,
    SHELL_TOOL: tools.shell,
    SHELL_NOTE: tools.shellNote || '',
    READ_TOOLS_SLASH: readSlash,
    ALT_READ_TOOLS_SLASH: altReadSlash,
    WRITE_TOOLS_SLASH: writeSlash,
    PRIMARY_ALT_READ: primaryAltRead,
    PRIMARY_ALT_WRITE: primaryAltWrite,
    WORKER_AGENTS_DIR: workerAgentsDir,
    PROTOCOL_NOUN: protocolNoun,
    PROTOCOL_FILE_REF: protocolFileRef,
    INSTANTIATION_REF_PATH: instantiationRefPath,
    EXECUTION_REF_PATH: executionRefPath,
    UI_TRACKER_SURFACE: uiTrackerSurface,
    UI_TRACKER_GATE_SURFACE: uiTrackerGateSurface,
    UI_TRACKER_NEXT_STAGE_SURFACE: uiTrackerNextStageSurface,
    UI_TRACKER_EXEC_SURFACE: uiTrackerExecSurface,
    ORCH_ANNOUNCE_TRACKER: orchAnnounceTracker,
    AUTHORING_MODEL_GUIDANCE: authoringModelGuidance,

    // Agent & Orchestrator protocol clauses
    PROVISIONER_INVOKE_CALL: provisionerInvokeCall,
    ORCH_DISPATCH_PROVISIONER_HEAD: orchDispatchProvisionerHead,
    ORCH_DISPATCH_STAGE_HEAD: orchDispatchStageHead,
    STAGE_ORCH_PROTOCOL_A_DISPATCH: stageOrchProtocolADispatch,
    STAGE_ORCH_PROTOCOL_A_POST: stageOrchProtocolAPost,
    STAGE_ORCH_PROTOCOL_B_CALL: stageOrchProtocolBCall,
    STAGE_ORCH_IDLE_PRESERVATION: stageOrchIdlePreservation,
    STAGE_ORCH_MODE_B_DISPATCH: stageOrchModeBDispatch,
    STAGE_ORCH_MODE_B_IDLE: stageOrchModeBIdle,
    STAGE_ORCH_SECTION_3: stageOrchSection3,
    ORCH_KEEP_STAGE_IDLE: orchKeepStageIdle,
    ORCH_PROTOCOL_A_BODY: orchProtocolABody,
    ORCH_PROTOCOL_B_HEAD: orchProtocolBHead,
    CLUSTER_CHILD_TYPE_LABEL: clusterChildTypeLabel,
    ORCH_PROTOCOL_B_TAIL: orchProtocolBTail,
    ORCH_GATE_REVISION_ROUTING: orchGateRevisionRouting,
    WEAVE_AGENT_INTRO_LINE: weaveAgentIntroLine,
    WEAVE_AGENT_WAKEUP_TRIGGER: weaveAgentWakeupTrigger,
    EXEC_REF_MULTISTAGE_ITEM: execRefMultistageItem,
    EXEC_REF_PROTOCOL_A_ITEMS: execRefProtocolAItems,
    EXEC_REF_PROTOCOL_B_ITEM_1: execRefProtocolBItem1,
    EXEC_REF_PROTOCOL_B_ITEM_2: execRefProtocolBItem2,
    EXEC_REF_GATE_REVISION: execRefGateRevision
  };

  for (const spec of PROTOCOL_SPECS) {
    context[spec.frontmatterToken] = buildProtocolFrontmatter(
      targets.protocolFormat,
      spec.name,
      spec.foldedDescription
    );
  }

  return context;
}

/**
 * Renders a canonical template string against a flat token context, failing fast on unknown or leftover tokens.
 * @param {string} templateSource
 * @param {Record<string, string>} context
 * @param {string} [eol='\n']
 * @returns {string}
 */
export function renderTemplate(templateSource, context, eol = '\n') {
  assertNonEmptyString(templateSource, 'templateSource');
  assertPlainObject(context, 'context');

  const normalized = templateSource.replace(/\r\n/g, '\n');
  const rendered = normalized.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, tokenName) => {
    if (!Object.hasOwn(context, tokenName)) {
      throw new Error(`CRITICAL: Unknown template token '{{${tokenName}}}'.`);
    }
    return String(context[tokenName]);
  });

  const leftover = rendered.match(/\{\{[^}]*\}\}/);
  if (leftover) {
    throw new Error(`CRITICAL: Unresolved template token '${leftover[0]}' in rendered output.`);
  }

  return eol === '\r\n' ? rendered.replace(/\n/g, '\r\n') : rendered;
}

/**
 * Parses YAML frontmatter supporting scalars, booleans, multi-line lists, and folded/literal block scalars.
 * @param {string} content
 * @returns {{ frontmatter: Record<string, any>, body: string }}
 */
export function parseAdapterFrontmatter(content) {
  assertNonEmptyString(content, 'content');
  const clean = content.replace(/^\uFEFF/, '');
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error('CRITICAL: Missing or malformed YAML frontmatter block.');
  }

  const lines = match[1].split(/\r?\n/);
  const frontmatter = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1 || /^\s/.test(line)) {
      throw new Error(`CRITICAL: Invalid YAML frontmatter line: '${line}'.`);
    }

    const key = line.slice(0, colonIdx).trim();
    const rawVal = line.slice(colonIdx + 1).trim();

    if (rawVal === '>-' || rawVal === '>' || rawVal === '|-' || rawVal === '|') {
      const blockLines = [];
      i++;
      while (i < lines.length && (/^\s+/.test(lines[i]) || lines[i].trim() === '')) {
        blockLines.push(lines[i].trim());
        i++;
      }
      const joiner = rawVal.startsWith('>') ? ' ' : '\n';
      frontmatter[key] = blockLines.filter(Boolean).join(joiner).trim();
      continue;
    }

    if (rawVal === '') {
      const items = [];
      i++;
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        const itemVal = lines[i].replace(/^\s*-\s+/, '').trim();
        items.push(unquoteYamlScalar(itemVal));
        i++;
      }
      frontmatter[key] = items;
      continue;
    }

    frontmatter[key] = parseYamlScalar(rawVal);
    i++;
  }

  return { frontmatter, body: match[2] };
}

function unquoteYamlScalar(val) {
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  return val;
}

function parseYamlScalar(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null' || raw === '~') return null;
  return unquoteYamlScalar(raw);
}

/**
 * Computes the relative output path for a protocol file based on `targets.protocolFormat`.
 * @param {Record<string, any>} targets
 * @param {string} protocolName
 * @returns {string}
 */
export function resolveProtocolRelativePath(targets, protocolName) {
  const base = targets.protocolsDir.replace(/\\/g, '/');
  if (targets.protocolFormat === 'skill') {
    return `${base}/${protocolName}/SKILL.md`;
  }
  if (targets.protocolFormat === 'mdc') {
    return `${base}/${protocolName}.mdc`;
  }
  return `${base}/${protocolName}.md`;
}

/**
 * Renders all protocol and control-plane agent files in memory for a validated harness config.
 * @param {Record<string, any>} config
 * @param {{ templatesDir: string, eol?: '\n'|'\r\n' }} options
 * @returns {Array<{ relativePath: string, content: string, kind: 'protocol'|'agent', name: string, requiredMcpTools: string[] }>}
 */
export function renderHarnessFiles(config, { templatesDir, eol }) {
  validateHarnessConfig(config);
  assertNonEmptyString(templatesDir, 'templatesDir');

  const context = buildTemplateContext(config);
  const renderedFiles = [];

  for (const spec of PROTOCOL_SPECS) {
    const tmplPath = path.join(templatesDir, spec.templateFile);
    const raw = fs.readFileSync(tmplPath, 'utf8');
    const targetEol = eol || (raw.includes('\r\n') ? '\r\n' : '\n');
    const content = renderTemplate(raw, context, targetEol);
    renderedFiles.push({
      relativePath: resolveProtocolRelativePath(config.targets, spec.name),
      content,
      kind: 'protocol',
      name: spec.name,
      requiredMcpTools: [...spec.requiredMcpTools]
    });
  }

  const allAgentDirs = [
    config.targets.agentsDir.replace(/\\/g, '/'),
    ...(config.targets.mirrorAgentsDirs || []).map((d) => d.replace(/\\/g, '/'))
  ];

  for (const spec of AGENT_SPECS) {
    const tmplPath = path.join(templatesDir, spec.templateFile);
    const raw = fs.readFileSync(tmplPath, 'utf8');
    const targetEol = eol || (raw.includes('\r\n') ? '\r\n' : '\n');
    const content = renderTemplate(raw, context, targetEol);
    for (const agentDir of allAgentDirs) {
      renderedFiles.push({
        relativePath: `${agentDir}/${spec.name}.md`,
        content,
        kind: 'agent',
        name: spec.name,
        requiredMcpTools: [...spec.requiredMcpTools]
      });
    }
  }

  return renderedFiles;
}

/**
 * Verifies frontmatter integrity, inline MCP compact signatures, unresolved token absence,
 * and cross-harness isolation (no Antigravity-exclusive identifiers leaking into other harnesses).
 *
 * @param {Record<string, any>} config
 * @param {Array<{ relativePath: string, content: string, kind: 'protocol'|'agent', name: string, requiredMcpTools: string[] }>} renderedFiles
 * @returns {{ verified: true, harnessId: string, fileCount: number }}
 */
export function verifyGeneratedAdapter(config, renderedFiles) {
  validateHarnessConfig(config);
  if (!Array.isArray(renderedFiles) || renderedFiles.length === 0) {
    throw new TypeError('CRITICAL: renderedFiles must be a non-empty array.');
  }

  const explicitlyConfiguredStrings = new Set(
    [
      config.tools.read,
      config.tools.readAlt,
      config.tools.write,
      config.tools.writeAlt,
      config.tools.shell,
      config.tools.subagent,
      config.tools.resume,
      config.tools.manageSubagents,
      config.mcp.wrapperTool,
      config.mcp.schemaGlob,
      config.uiTrackerLink
    ].filter((v) => typeof v === 'string' && v.length > 0)
  );

  for (const file of renderedFiles) {
    if (/\{\{[^}]*\}\}/.test(file.content)) {
      throw new Error(
        `CRITICAL: Unresolved template token detected in '${file.relativePath}' for harness '${config.id}'.`
      );
    }

    const { frontmatter, body } = parseAdapterFrontmatter(file.content);
    if (!body || !body.trim()) {
      throw new Error(`CRITICAL: Empty markdown body in '${file.relativePath}' for harness '${config.id}'.`);
    }

    if (file.kind === 'protocol') {
      const fmt = config.targets.protocolFormat;
      if (fmt === 'skill') {
        if (frontmatter.name !== file.name) {
          throw new Error(
            `CRITICAL: Skill frontmatter name mismatch in '${file.relativePath}': expected '${file.name}', got '${String(frontmatter.name)}'.`
          );
        }
        assertNonEmptyString(frontmatter.description, `${file.relativePath} frontmatter.description`);
      } else if (fmt === 'mdc') {
        assertNonEmptyString(frontmatter.description, `${file.relativePath} frontmatter.description`);
        if (typeof frontmatter.alwaysApply !== 'boolean') {
          throw new Error(`CRITICAL: Cursor .mdc rule '${file.relativePath}' must set boolean 'alwaysApply'.`);
        }
      } else {
        assertNonEmptyString(frontmatter.trigger, `${file.relativePath} frontmatter.trigger`);
        assertNonEmptyString(frontmatter.description, `${file.relativePath} frontmatter.description`);
      }
    } else {
      if (frontmatter.name !== file.name) {
        throw new Error(
          `CRITICAL: Agent frontmatter name mismatch in '${file.relativePath}': expected '${file.name}', got '${String(frontmatter.name)}'.`
        );
      }
      assertNonEmptyString(frontmatter.description, `${file.relativePath} frontmatter.description`);
      if (frontmatter.subagent !== true) {
        throw new Error(`CRITICAL: Control-plane agent '${file.relativePath}' must set 'subagent: true'.`);
      }
      if (!Array.isArray(frontmatter.tools) || frontmatter.tools.length === 0) {
        throw new Error(`CRITICAL: Control-plane agent '${file.relativePath}' must declare non-empty 'tools'.`);
      }
    }

    // Verify all required inline compact tool signatures exist verbatim
    for (const toolName of file.requiredMcpTools) {
      const sig = COMPACT_TOOL_SIGNATURES[toolName];
      if (!file.content.includes(toolName) || !file.content.includes(sig)) {
        throw new Error(
          `CRITICAL: Missing or drifted compact signature for '${toolName}' in '${file.relativePath}' (${config.id}).`
        );
      }
    }

    // Run full Antigravity validators on agy; run leak-prevention guards on all other harnesses
    if (config.id === 'agy') {
      if (file.requiredMcpTools.length > 0) {
        verifyInlineToolSignatures(file.content, file.requiredMcpTools);
      }
      if (file.kind === 'agent' && file.name === 'stage_orchestrator') {
        verifyStageOrchestratorContract(file.content);
      }
    } else {
      for (const agyToken of AGY_EXCLUSIVE_IDENTIFIERS) {
        if (explicitlyConfiguredStrings.has(agyToken)) continue;
        const isIdent = /^[A-Za-z_][A-Za-z0-9_]*$/.test(agyToken);
        const leaked = isIdent
          ? new RegExp(`\\b${agyToken}\\b`).test(file.content)
          : file.content.includes(agyToken);
        if (leaked) {
          throw new Error(
            `CRITICAL: Antigravity-only identifier '${agyToken}' leaked into '${file.relativePath}' for harness '${config.id}'.`
          );
        }
      }
    }
  }

  return { verified: true, harnessId: config.id, fileCount: renderedFiles.length };
}

/**
 * Loads all harness config JSON files (or a single harness by ID) from `adapters/harnesses/`.
 * @param {string} harnessesDir
 * @param {string} [harnessId]
 * @returns {Array<Record<string, any>>}
 */
export function loadHarnessConfigs(harnessesDir, harnessId) {
  assertNonEmptyString(harnessesDir, 'harnessesDir');
  if (!fs.existsSync(harnessesDir)) {
    throw new Error(`CRITICAL: Harnesses directory does not exist: '${harnessesDir}'.`);
  }

  if (harnessId) {
    const filePath = path.join(harnessesDir, `${harnessId}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`CRITICAL: Unknown harness '${harnessId}' (expected '${filePath}').`);
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return [validateHarnessConfig(parsed)];
  }

  const entries = fs
    .readdirSync(harnessesDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  if (entries.length === 0) {
    throw new Error(`CRITICAL: No harness *.json configs found in '${harnessesDir}'.`);
  }

  return entries.map((entry) => {
    const raw = fs.readFileSync(path.join(harnessesDir, entry), 'utf8');
    const parsed = JSON.parse(raw);
    return validateHarnessConfig(parsed);
  });
}

/**
 * Builds (or checks) harness adapters from canonical templates.
 *
 * @param {{
 *   repoRoot: string,
 *   harnessId?: string,
 *   outDir?: string,
 *   checkOnly?: boolean,
 *   eol?: '\n'|'\r\n'
 * }} options
 * @returns {{ harnesses: Array<{ id: string, outputDir: string, files: string[] }> }}
 */
export function buildAdapters({ repoRoot, harnessId, outDir, checkOnly = false, eol }) {
  assertNonEmptyString(repoRoot, 'repoRoot');
  const adaptersRoot = path.join(repoRoot, 'adapters');
  const harnessesDir = path.join(adaptersRoot, 'harnesses');
  const templatesDir = path.join(adaptersRoot, 'templates');

  const configs = loadHarnessConfigs(harnessesDir, harnessId);
  const results = [];

  for (const config of configs) {
    const targetRoot = outDir
      ? harnessId
        ? path.resolve(outDir)
        : path.join(path.resolve(outDir), config.id)
      : path.resolve(repoRoot, config.outputRoot || path.join('dist', 'adapters', config.id));

    const renderedFiles = renderHarnessFiles(config, { templatesDir, eol });
    verifyGeneratedAdapter(config, renderedFiles);

    const writtenPaths = [];
    for (const file of renderedFiles) {
      const absTarget = path.join(targetRoot, file.relativePath);
      let finalContent = file.content;
      if (!eol && fs.existsSync(absTarget)) {
        const existingText = fs.readFileSync(absTarget, 'utf8');
        const diskEol = existingText.includes('\r\n') ? '\r\n' : '\n';
        const normalized = file.content.replace(/\r\n/g, '\n');
        finalContent = diskEol === '\r\n' ? normalized.replace(/\n/g, '\r\n') : normalized;
      }

      if (checkOnly) {
        if (config.outputRoot === '.' && !outDir) {
          if (!fs.existsSync(absTarget)) {
            throw new Error(`CRITICAL: Missing expected in-repo adapter file '${file.relativePath}'.`);
          }
          const existing = fs.readFileSync(absTarget);
          const expected = Buffer.from(finalContent, 'utf8');
          if (Buffer.compare(existing, expected) !== 0) {
            throw new Error(
              `CRITICAL: Adapter drift detected in '${file.relativePath}'. Run 'npm run build:adapters' to sync.`
            );
          }
        }
      } else {
        fs.mkdirSync(path.dirname(absTarget), { recursive: true });
        fs.writeFileSync(absTarget, finalContent, 'utf8');
      }
      writtenPaths.push(file.relativePath);
    }

    results.push({
      id: config.id,
      outputDir: targetRoot,
      files: writtenPaths
    });
  }

  return { harnesses: results };
}
