import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, serializeStatus, ALLOWED_FRONTMATTER_KEYS } from './frontmatter.mjs';
import { discoverAgents } from './agent_discovery.mjs';
import { parseWeaveStatus, STAGE_DIR_REGEX, LIFECYCLE_STATES } from './status_grammar.mjs';
import {
  parseInputEntry,
  inferLookupRoots,
  expandPathPattern,
  substitutePathVariables,
  resolveInputEntry,
  normalizeOutputs,
  mergeOutputDeclarations,
  verifyOutputFiles,
  mirrorOutputFiles
} from './path_resolver.mjs';

export {
  parseFrontmatter,
  serializeStatus,
  ALLOWED_FRONTMATTER_KEYS,
  discoverAgents,
  parseInputEntry,
  inferLookupRoots,
  expandPathPattern,
  substitutePathVariables,
  resolveInputEntry,
  mergeOutputDeclarations,
  mirrorOutputFiles,
  parseWeaveStatus,
  STAGE_DIR_REGEX,
  LIFECYCLE_STATES
};

const VALID_NODE_TYPES = ['agent', 'orchestrator'];

/**
 * Lists stage directory names (`stageNN_<slug>`) directly inside a run directory.
 * @param {string} runDir
 * @returns {string[]}
 */
function listStageDirs(runDir) {
  if (!fs.existsSync(runDir)) return [];
  return fs.readdirSync(runDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && STAGE_DIR_REGEX.test(d.name))
    .map(d => d.name)
    .sort();
}

/**
 * Validates a status string against the target weave.md node type and pipeline layout.
 * - agent: no stage prefix allowed.
 * - orchestrator (staged run, i.e. `stageNN_*` dirs exist): stage prefix required and must name an existing stage dir.
 * - orchestrator (stageless run): stage prefix not allowed.
 * - orchestrator (any): legacy `<state>/<stage>` order is rejected.
 * @param {string} resolvedDir
 * @param {'agent'|'orchestrator'} nodeType
 * @param {string} status
 * @returns {import('./status_grammar.mjs').ParsedWeaveStatus}
 */
export function assertStatusMatchesTarget(resolvedDir, nodeType, status) {
  if (typeof resolvedDir !== 'string' || !resolvedDir.trim()) {
    throw new TypeError('CRITICAL: resolvedDir must be a non-empty string.');
  }
  if (!VALID_NODE_TYPES.includes(nodeType)) {
    throw new TypeError(`CRITICAL: nodeType must be one of: ${VALID_NODE_TYPES.join(', ')}.`);
  }
  const parsed = parseWeaveStatus(status);

  if (nodeType === 'agent') {
    if (parsed.stage) {
      throw new Error(`CRITICAL: Agent weave.md status '${status}' must not carry a stage prefix. Use '<state>[/<detail>]' (e.g. 'in_progress/01_research').`);
    }
    return parsed;
  }

  if (parsed.detail && STAGE_DIR_REGEX.test(parsed.detail.split('/')[0])) {
    throw new Error(`CRITICAL: Orchestrator status '${status}' uses the legacy '<state>/<stage>' order. Use '<stage>/<state>[/<detail>]' (e.g. '${parsed.detail.split('/')[0]}/${parsed.state}').`);
  }

  const stageDirs = listStageDirs(resolvedDir);
  if (stageDirs.length > 0) {
    if (!parsed.stage) {
      throw new Error(`CRITICAL: Staged orchestrator status '${status}' must use '<stage>/<state>[/<detail>]' with <stage> one of: ${stageDirs.join(', ')}. If you are a subagent, pass your own assigned working directory instead of the run directory.`);
    }
    if (!stageDirs.includes(parsed.stage)) {
      throw new Error(`CRITICAL: Unknown stage '${parsed.stage}' in orchestrator status '${status}'. Existing stage directories: ${stageDirs.join(', ')}.`);
    }
  } else if (parsed.stage) {
    throw new Error(`CRITICAL: Stageless orchestrator status '${status}' must not carry a stage prefix (no stageNN_* directories exist in ${resolvedDir}).`);
  }
  return parsed;
}

/**
 * Validates and normalizes an optional inputs array.
 * @param {unknown} inputs 
 * @returns {string[] | null}
 */
function validateInputsArray(inputs) {
  if (inputs === null || inputs === undefined) return null;
  if (!Array.isArray(inputs)) {
    throw new TypeError('CRITICAL: inputs must be an array of non-empty file path strings.');
  }
  const normalized = [];
  for (const item of inputs) {
    if (typeof item !== 'string' || !item.trim()) {
      throw new TypeError('CRITICAL: Each entry in inputs must be a non-empty string.');
    }
    normalized.push(item.trim());
  }
  return normalized;
}

/**
 * Initializes a new weave.md in target directory.
 */
export function weaveInit(targetDir, type = 'agent', initialStatus = 'not_started', instructionsFile = null, inputs = null, outputs = null) {
  if (!targetDir || typeof targetDir !== 'string') {
    throw new TypeError('CRITICAL: Target directory must be a non-empty string.');
  }
  if (!path.isAbsolute(targetDir)) {
    throw new Error(`CRITICAL: Target directory must be an absolute path (received relative path: "${targetDir}"). Provide the full workspace path.`);
  }

  let resolvedType = type;
  let resolvedStatus = initialStatus;
  let resolvedInstructions = instructionsFile;
  let resolvedInputs = inputs;
  let resolvedOutputs = outputs;

  if (typeof type === 'object' && type !== null) {
    resolvedType = type.type || 'agent';
    resolvedStatus = type.status || 'not_started';
    resolvedInstructions = type.instructions_file || type.instructionsFile || null;
    resolvedInputs = type.inputs !== undefined ? type.inputs : null;
    resolvedOutputs = type.outputs !== undefined ? type.outputs : null;
  }

  const validTypes = ['agent', 'orchestrator'];
  if (!validTypes.includes(resolvedType)) {
    throw new TypeError('CRITICAL: Type must be either "agent" or "orchestrator".');
  }
  if (typeof resolvedStatus !== 'string' || !resolvedStatus) {
    throw new TypeError('CRITICAL: Initial status must be a non-empty string.');
  }
  if (resolvedInstructions !== null && resolvedInstructions !== undefined) {
    if (typeof resolvedInstructions !== 'string' || !resolvedInstructions.trim()) {
      throw new TypeError('CRITICAL: instructions_file must be a non-empty string.');
    }
  }
  const validatedInputs = validateInputsArray(resolvedInputs);
  const validatedOutputs = normalizeOutputs(resolvedOutputs);

  const resolvedDir = path.resolve(targetDir);
  if (resolvedType === 'orchestrator') {
    assertStatusMatchesTarget(resolvedDir, 'orchestrator', resolvedStatus);
  }
  if (!fs.existsSync(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true });
  }

  const statusPath = path.join(resolvedDir, 'weave.md');
  const now = new Date().toISOString();

  const frontmatter = {
    type: resolvedType,
    status: resolvedStatus,
    ...(resolvedInstructions ? { instructions_file: resolvedInstructions } : {}),
    ...(validatedInputs !== null ? { inputs: validatedInputs } : {}),
    outputs: validatedOutputs !== null ? validatedOutputs : [],
    updated_at: now
  };

  const agentName = path.basename(resolvedDir);
  const initialBody = resolvedType === 'orchestrator'
    ? `# Pipeline Status\n\n- ${now}: \`${resolvedStatus}\` - Pipeline execution initialized\n`
    : `# ${agentName} Status\n\n- ${now}: \`${resolvedStatus}\` - Initialized status\n`;

  fs.writeFileSync(statusPath, serializeStatus(frontmatter, initialBody), 'utf-8');

  return {
    success: true,
    message: `WEAVE_INIT_OK: Initialized ${resolvedType} weave at ${statusPath}`,
    path: statusPath
  };
}

/**
 * Updates weave.md in target directory with new status, optional progress note, and optional outputs.
 * Status grammar: `[<stage>/]<state>[/<detail>]` (see status_grammar.mjs).
 * Writes to a `type: orchestrator` weave.md require `options.type === 'orchestrator'`.
 * @param {string} targetDir
 * @param {string} status
 * @param {string | null} [progress=null]
 * @param {string | string[] | null} [outputs=null]
 * @param {{ type?: 'agent' | 'orchestrator', mirrorTo?: string }} [options={}]
 * @returns {{ success: boolean, message: string, status: string, mirrored_files?: string[] }}
 */
export function weaveUpdate(targetDir, status, progress = null, outputs = null, options = {}) {
  if (!targetDir || typeof targetDir !== 'string') {
    throw new TypeError('CRITICAL: Target directory must be a non-empty string.');
  }
  if (!path.isAbsolute(targetDir)) {
    throw new Error(`CRITICAL: Target directory must be an absolute path (received relative path: "${targetDir}"). Provide the full workspace path.`);
  }
  if (!status || typeof status !== 'string') {
    throw new TypeError('CRITICAL: Status must be a non-empty string.');
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('CRITICAL: options must be a plain object.');
  }
  if (options.type !== undefined && !VALID_NODE_TYPES.includes(options.type)) {
    throw new TypeError(`CRITICAL: options.type must be one of: ${VALID_NODE_TYPES.join(', ')}.`);
  }
  if (options.mirrorTo !== undefined) {
    if (typeof options.mirrorTo !== 'string' || !options.mirrorTo.trim()) {
      throw new TypeError('CRITICAL: mirror_to must be a non-empty string.');
    }
    if (!path.isAbsolute(options.mirrorTo.trim())) {
      throw new Error(`CRITICAL: mirror_to must be an absolute path (received relative path: "${options.mirrorTo.trim()}"). Provide the full destination path.`);
    }
  }

  // Syntax check first (independent of target file)
  parseWeaveStatus(status);

  const resolvedDir = path.resolve(targetDir);
  const statusPath = path.join(resolvedDir, 'weave.md');
  if (!fs.existsSync(statusPath)) {
    throw new Error(`CRITICAL: weave.md not found in directory: ${resolvedDir}`);
  }

  const fileContent = fs.readFileSync(statusPath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(fileContent);
  // Legacy weave.md files without `type` are agent nodes (matches weaveRead semantics).
  const nodeType = frontmatter.type === undefined ? 'agent' : String(frontmatter.type);
  if (!VALID_NODE_TYPES.includes(nodeType)) {
    throw new Error(`CRITICAL: weave.md in ${resolvedDir} has unsupported type '${nodeType}'.`);
  }
  if (nodeType === 'orchestrator' && options.type !== 'orchestrator') {
    throw new Error(`CRITICAL: Refusing to update orchestrator weave.md in ${resolvedDir} without type: "orchestrator". If you are a subagent, pass your own assigned working directory instead of the run directory.`);
  }
  if (options.type !== undefined && options.type !== nodeType) {
    throw new Error(`CRITICAL: Type mismatch. Expected '${options.type}' weave.md, but ${resolvedDir} contains a '${nodeType}' weave.md.`);
  }
  const parsedStatus = assertStatusMatchesTarget(resolvedDir, nodeType, status);

  const normalizedOutputs = normalizeOutputs(outputs);

  const rawExisting = frontmatter.outputs !== undefined ? frontmatter.outputs : frontmatter.deliverable;
  delete frontmatter.deliverable;
  const existingOutputs = Array.isArray(rawExisting)
    ? rawExisting.map(String)
    : (rawExisting ? [String(rawExisting)] : []);

  const mergedOutputs = mergeOutputDeclarations(existingOutputs, normalizedOutputs);

  let verifiedPaths = null;
  if (parsedStatus.state === 'completed') {
    if (mergedOutputs.length > 0) {
      verifiedPaths = verifyOutputFiles(resolvedDir, mergedOutputs);
    }
    frontmatter.outputs = mergedOutputs;
  } else if (parsedStatus.state === 'awaiting_review') {
    if (normalizedOutputs !== null && normalizedOutputs.length > 0) {
      verifiedPaths = verifyOutputFiles(resolvedDir, normalizedOutputs);
    }
    frontmatter.outputs = mergedOutputs;
  } else {
    frontmatter.outputs = mergedOutputs;
  }

  let mirroredFiles = null;
  if (options.mirrorTo !== undefined) {
    if (verifiedPaths === null) {
      const toVerify = (normalizedOutputs !== null && normalizedOutputs.length > 0)
        ? normalizedOutputs
        : mergedOutputs;
      verifiedPaths = verifyOutputFiles(resolvedDir, toVerify);
    }
    mirroredFiles = mirrorOutputFiles(verifiedPaths, options.mirrorTo);
  }

  const now = new Date().toISOString();
  frontmatter.status = status;
  frontmatter.updated_at = now;

  let updatedBody = body ? body.trim() : '';
  const progressLine = progress ? ` - ${progress}` : '';
  const logEntry = `- ${now}: \`${status}\`${progressLine}`;

  if (updatedBody) {
    updatedBody = `${updatedBody}\n${logEntry}`;
  } else {
    updatedBody = `# Status Log\n\n${logEntry}`;
  }

  fs.writeFileSync(statusPath, serializeStatus(frontmatter, updatedBody), 'utf-8');
  const mirrorSuffix = mirroredFiles ? ` | Mirrored: ${JSON.stringify(mirroredFiles)}` : '';
  return {
    success: true,
    message: `WEAVE_UPDATE_OK: status -> ${status}${mirrorSuffix}`,
    status,
    ...(mirroredFiles ? { mirrored_files: mirroredFiles } : {})
  };
}

/**
 * Verifies that the agent weave.md exists, matches expectations, and all declared inputs exist on disk.
 */
export function weaveVerify(targetDir, expectedId = null) {
  if (!targetDir || typeof targetDir !== 'string') {
    throw new TypeError('CRITICAL: Target directory must be a non-empty string.');
  }
  if (!path.isAbsolute(targetDir)) {
    throw new Error(`CRITICAL: Target directory must be an absolute path (received relative path: "${targetDir}"). Provide the full workspace path.`);
  }
  if (expectedId !== null && expectedId !== undefined) {
    if (typeof expectedId !== 'string' || !expectedId.trim()) {
      throw new TypeError('CRITICAL: Expected agent identifier must be a non-empty string.');
    }
  }
  const resolvedDir = path.resolve(targetDir);
  const statusPath = path.join(resolvedDir, 'weave.md');
  if (!fs.existsSync(statusPath)) {
    throw new Error(`CRITICAL: weave.md not found in directory: ${resolvedDir}`);
  }
  const fileContent = fs.readFileSync(statusPath, 'utf-8');
  const { frontmatter } = parseFrontmatter(fileContent);
  const agentId = path.basename(resolvedDir);

  if (frontmatter.type === 'orchestrator') {
    throw new Error(`CRITICAL: ${resolvedDir} contains the orchestrator weave.md, not an agent workspace. Subagents must pass their own assigned working directory.`);
  }

  if (expectedId !== null && expectedId !== undefined) {
    const normalizedExpected = expectedId.replace(/\\/g, '/');
    const normalizedDir = resolvedDir.replace(/\\/g, '/');
    const matches = agentId === expectedId ||
      normalizedDir.endsWith(`/${normalizedExpected}`) ||
      (frontmatter.instructions_file && String(frontmatter.instructions_file).includes(expectedId));

    if (!matches) {
      throw new Error(`CRITICAL: Identity mismatch. Expected '${expectedId}', but working directory is '${agentId}'.`);
    }
  }

  const rawInputs = Array.isArray(frontmatter.inputs) ? frontmatter.inputs : [];
  const resolvedInputs = {};
  const pendingInputs = [];

  for (const inputEntry of rawInputs) {
    try {
      const resolved = resolveInputEntry(resolvedDir, inputEntry);
      const key = resolved.name || resolved.pattern;
      resolvedInputs[key] = resolved.matches.length === 1 ? resolved.matches[0] : resolved.matches;
    } catch {
      pendingInputs.push(inputEntry);
    }
  }

  return {
    success: true,
    agent_id: agentId,
    status: String(frontmatter.status ?? ''),
    inputs: rawInputs,
    resolved_inputs: resolvedInputs,
    pending_inputs: pendingInputs
  };
}

/**
 * Reads weave.md from targetDir, parses frontmatter, optionally verifies expected outputs/status,
 * optionally mirrors verified output files in Node.js (zero-token copy), and returns status metadata.
 * @param {string} targetDir
 * @param {string | string[] | null} [expectedOutputs]
 * @param {string} [expectedStatus]
 * @param {{ mirrorTo?: string }} [options={}]
 */
export function weaveRead(targetDir, expectedOutputs = undefined, expectedStatus = undefined, options = {}) {
  if (!targetDir || typeof targetDir !== 'string') {
    throw new TypeError('CRITICAL: Target directory must be a non-empty string.');
  }
  if (!path.isAbsolute(targetDir)) {
    throw new Error(`CRITICAL: Target directory must be an absolute path (received relative path: "${targetDir}"). Provide the full workspace path.`);
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('CRITICAL: options must be a plain object.');
  }
  if (options.mirrorTo !== undefined) {
    if (typeof options.mirrorTo !== 'string' || !options.mirrorTo.trim()) {
      throw new TypeError('CRITICAL: mirror_to must be a non-empty string.');
    }
    if (!path.isAbsolute(options.mirrorTo.trim())) {
      throw new Error(`CRITICAL: mirror_to must be an absolute path (received relative path: "${options.mirrorTo.trim()}"). Provide the full destination path.`);
    }
  }
  const resolvedDir = path.resolve(targetDir);
  const statusPath = path.join(resolvedDir, 'weave.md');
  if (!fs.existsSync(statusPath)) {
    throw new Error(`CRITICAL: weave.md not found in directory: ${resolvedDir}`);
  }
  const fileContent = fs.readFileSync(statusPath, 'utf-8');
  const { frontmatter } = parseFrontmatter(fileContent);

  const status = String(frontmatter.status ?? '');
  const type = String(frontmatter.type ?? 'agent');
  const instructionsFile = frontmatter.instructions_file ? String(frontmatter.instructions_file) : null;
  const inputs = Array.isArray(frontmatter.inputs) ? frontmatter.inputs.map(String) : [];
  const rawOutputs = frontmatter.outputs !== undefined ? frontmatter.outputs : frontmatter.deliverable;
  const outputs = Array.isArray(rawOutputs)
    ? rawOutputs.map(String)
    : (rawOutputs ? [String(rawOutputs)] : []);
  const updatedAt = frontmatter.updated_at ? String(frontmatter.updated_at) : null;

  if (expectedStatus !== undefined && expectedStatus !== null) {
    if (typeof expectedStatus !== 'string' || !expectedStatus) {
      throw new TypeError('CRITICAL: Expected status must be a non-empty string.');
    }
    if (!status.startsWith(expectedStatus)) {
      throw new Error(`CRITICAL: Status mismatch. Expected status '${expectedStatus}', but weave.md defines '${status}'.`);
    }
  }

  let verifiedPaths = null;
  if (expectedOutputs !== undefined) {
    if (expectedOutputs === null || (Array.isArray(expectedOutputs) && expectedOutputs.length === 0)) {
      if (outputs.length > 0) {
        throw new Error(`CRITICAL: Outputs mismatch. Expected empty outputs, but weave.md defines '${JSON.stringify(outputs)}'.`);
      }
    } else {
      const expectedList = normalizeOutputs(expectedOutputs);
      const matches = expectedList.length === outputs.length && expectedList.every((val, idx) => {
        if (val === outputs[idx]) return true;
        const parsedOut = parseInputEntry(outputs[idx]);
        const parsedExp = parseInputEntry(val);
        const outLocal = parsedOut.name || parsedOut.rawPath;
        const expLocal = parsedExp.name || parsedExp.rawPath;
        return val === outLocal || val === parsedOut.rawPath || expLocal === outLocal;
      });
      if (!matches) {
        throw new Error(`CRITICAL: Outputs mismatch. Expected '${JSON.stringify(expectedList)}', but weave.md defines '${JSON.stringify(outputs)}'.`);
      }
      verifiedPaths = verifyOutputFiles(resolvedDir, outputs);
    }
  }

  let mirroredFiles = null;
  if (options.mirrorTo !== undefined) {
    if (verifiedPaths === null) {
      verifiedPaths = verifyOutputFiles(resolvedDir, outputs);
    }
    mirroredFiles = mirrorOutputFiles(verifiedPaths, options.mirrorTo);
  }

  return {
    status,
    instructions_file: instructionsFile,
    inputs,
    outputs,
    type,
    updated_at: updatedAt,
    ...(mirroredFiles ? { mirrored_files: mirroredFiles } : {})
  };
}

export {
  weaveInit as statusInit,
  weaveUpdate as statusUpdate,
  weaveVerify as statusVerify,
  weaveRead as statusRead
};
