import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, serializeStatus, ALLOWED_FRONTMATTER_KEYS } from './frontmatter.mjs';
import { discoverAgents } from './agent_discovery.mjs';
import {
  parseInputEntry,
  inferLookupRoots,
  expandPathPattern,
  substitutePathVariables,
  resolveInputEntry,
  normalizeOutputs,
  verifyOutputFiles
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
  resolveInputEntry
};

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
export function weaveInit(targetDir, type = 'agent', initialStatus = 'not_started', instructionsFile = null, inputs = null) {
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

  if (typeof type === 'object' && type !== null) {
    resolvedType = type.type || 'agent';
    resolvedStatus = type.status || 'not_started';
    resolvedInstructions = type.instructions_file || type.instructionsFile || null;
    resolvedInputs = type.inputs !== undefined ? type.inputs : null;
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

  const resolvedDir = path.resolve(targetDir);
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
    outputs: [],
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
 */
export function weaveUpdate(targetDir, status, progress = null, outputs = null) {
  if (!targetDir || typeof targetDir !== 'string') {
    throw new TypeError('CRITICAL: Target directory must be a non-empty string.');
  }
  if (!path.isAbsolute(targetDir)) {
    throw new Error(`CRITICAL: Target directory must be an absolute path (received relative path: "${targetDir}"). Provide the full workspace path.`);
  }
  if (!status || typeof status !== 'string') {
    throw new TypeError('CRITICAL: Status must be a non-empty string.');
  }

  const validPrefixes = ['not_started', 'in_progress', 'waiting', 'blocked', 'completed'];
  const hasValidPrefix = validPrefixes.some(p => status === p || status.startsWith(`${p}/`));
  if (!hasValidPrefix) {
    throw new Error(`CRITICAL: Invalid status state '${status}'. Must start with one of: ${validPrefixes.join(', ')}`);
  }

  const resolvedDir = path.resolve(targetDir);
  const statusPath = path.join(resolvedDir, 'weave.md');
  if (!fs.existsSync(statusPath)) {
    throw new Error(`CRITICAL: weave.md not found in directory: ${resolvedDir}`);
  }

  const fileContent = fs.readFileSync(statusPath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(fileContent);
  const normalizedOutputs = normalizeOutputs(outputs);

  const rawExisting = frontmatter.outputs !== undefined ? frontmatter.outputs : frontmatter.deliverable;
  delete frontmatter.deliverable;
  const existingOutputs = Array.isArray(rawExisting)
    ? rawExisting.map(String)
    : (rawExisting ? [String(rawExisting)] : []);

  if (status.startsWith('completed')) {
    const finalOutputs = normalizedOutputs !== null ? normalizedOutputs : existingOutputs;
    if (!finalOutputs || finalOutputs.length === 0) {
      throw new Error('CRITICAL: Outputs path is required when setting status to completed.');
    }
    verifyOutputFiles(resolvedDir, finalOutputs);
    frontmatter.outputs = finalOutputs;
  } else if (normalizedOutputs !== null) {
    frontmatter.outputs = normalizedOutputs;
  } else {
    frontmatter.outputs = existingOutputs;
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
  return {
    success: true,
    message: `WEAVE_UPDATE_OK: status -> ${status}`,
    status
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
 * and returns status metadata matching weave.md schema.
 */
export function weaveRead(targetDir, expectedOutputs = undefined, expectedStatus = undefined) {
  if (!targetDir || typeof targetDir !== 'string') {
    throw new TypeError('CRITICAL: Target directory must be a non-empty string.');
  }
  if (!path.isAbsolute(targetDir)) {
    throw new Error(`CRITICAL: Target directory must be an absolute path (received relative path: "${targetDir}"). Provide the full workspace path.`);
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

  if (expectedOutputs !== undefined) {
    if (expectedOutputs === null || (Array.isArray(expectedOutputs) && expectedOutputs.length === 0)) {
      if (outputs.length > 0) {
        throw new Error(`CRITICAL: Outputs mismatch. Expected empty outputs, but weave.md defines '${JSON.stringify(outputs)}'.`);
      }
    } else {
      const expectedList = normalizeOutputs(expectedOutputs);
      const matches = expectedList.length === outputs.length && expectedList.every((val, idx) => val === outputs[idx]);
      if (!matches) {
        throw new Error(`CRITICAL: Outputs mismatch. Expected '${JSON.stringify(expectedList)}', but weave.md defines '${JSON.stringify(outputs)}'.`);
      }
      verifyOutputFiles(resolvedDir, outputs);
    }
  }

  return {
    status,
    instructions_file: instructionsFile,
    inputs,
    outputs,
    type,
    updated_at: updatedAt
  };
}

export {
  weaveInit as statusInit,
  weaveUpdate as statusUpdate,
  weaveVerify as statusVerify,
  weaveRead as statusRead
};
