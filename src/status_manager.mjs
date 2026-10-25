import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, serializeStatus, ALLOWED_FRONTMATTER_KEYS } from './frontmatter.mjs';
import { discoverAgents } from './agent_discovery.mjs';

export { parseFrontmatter, serializeStatus, ALLOWED_FRONTMATTER_KEYS, discoverAgents };

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
 * Initializes a new status.md in target directory.
 */
export function statusInit(targetDir, type = 'agent', initialStatus = 'not_started', instructionsFile = null, inputs = null) {
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

  const statusPath = path.join(resolvedDir, 'status.md');
  const now = new Date().toISOString();

  const frontmatter = {
    type: resolvedType,
    status: resolvedStatus,
    ...(resolvedInstructions ? { instructions_file: resolvedInstructions } : {}),
    ...(validatedInputs !== null ? { inputs: validatedInputs } : {}),
    deliverable: null,
    updated_at: now
  };

  const agentName = path.basename(resolvedDir);
  const initialBody = resolvedType === 'orchestrator'
    ? `# Pipeline Status\n\n- ${now}: \`${resolvedStatus}\` - Pipeline execution initialized\n`
    : `# ${agentName} Status\n\n- ${now}: \`${resolvedStatus}\` - Initialized status\n`;

  fs.writeFileSync(statusPath, serializeStatus(frontmatter, initialBody), 'utf-8');

  return {
    success: true,
    message: `STATUS_INIT_OK: Initialized ${resolvedType} status at ${statusPath}`,
    path: statusPath
  };
}

/**
 * Updates status.md in target directory with new status, optional progress note, and optional deliverable.
 */
export function statusUpdate(targetDir, status, progress = null, deliverable = null) {
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
  const statusPath = path.join(resolvedDir, 'status.md');
  if (!fs.existsSync(statusPath)) {
    throw new Error(`CRITICAL: status.md not found in directory: ${resolvedDir}`);
  }

  const fileContent = fs.readFileSync(statusPath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(fileContent);

  if (status.startsWith('completed')) {
    const finalDeliverable = deliverable || frontmatter.deliverable;
    if (!finalDeliverable) {
      throw new Error('CRITICAL: Deliverable path is required when setting status to completed.');
    }
    const deliverablePath = path.isAbsolute(finalDeliverable)
      ? finalDeliverable
      : path.join(resolvedDir, finalDeliverable);
    if (!fs.existsSync(deliverablePath)) {
      throw new Error(`CRITICAL: Deliverable file does not exist on disk: ${deliverablePath}`);
    }
    frontmatter.deliverable = finalDeliverable;
  } else if (deliverable) {
    frontmatter.deliverable = deliverable;
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
    message: `STATUS_UPDATE_OK: status -> ${status}`,
    status
  };
}

/**
 * Verifies that the agent status.md exists, matches expectations, and all declared inputs exist on disk.
 */
export function statusVerify(targetDir, expectedId = null) {
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
  const statusPath = path.join(resolvedDir, 'status.md');
  if (!fs.existsSync(statusPath)) {
    throw new Error(`CRITICAL: status.md not found in directory: ${resolvedDir}`);
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
  for (const inputPath of rawInputs) {
    const resolvedInput = path.isAbsolute(inputPath)
      ? inputPath
      : path.resolve(resolvedDir, inputPath);
    if (!fs.existsSync(resolvedInput)) {
      throw new Error(`CRITICAL: Input file does not exist on disk: ${resolvedInput} (declared as "${inputPath}")`);
    }
  }

  return {
    success: true,
    agent_id: agentId,
    status: String(frontmatter.status ?? ''),
    inputs: rawInputs
  };
}

/**
 * Reads status.md from targetDir, parses frontmatter, optionally verifies expected deliverable/status,
 * and returns status metadata matching status.md schema.
 */
export function statusRead(targetDir, expectedDeliverable = undefined, expectedStatus = undefined) {
  if (!targetDir || typeof targetDir !== 'string') {
    throw new TypeError('CRITICAL: Target directory must be a non-empty string.');
  }
  if (!path.isAbsolute(targetDir)) {
    throw new Error(`CRITICAL: Target directory must be an absolute path (received relative path: "${targetDir}"). Provide the full workspace path.`);
  }
  const resolvedDir = path.resolve(targetDir);
  const statusPath = path.join(resolvedDir, 'status.md');
  if (!fs.existsSync(statusPath)) {
    throw new Error(`CRITICAL: status.md not found in directory: ${resolvedDir}`);
  }
  const fileContent = fs.readFileSync(statusPath, 'utf-8');
  const { frontmatter } = parseFrontmatter(fileContent);

  const status = String(frontmatter.status ?? '');
  const type = String(frontmatter.type ?? 'agent');
  const instructionsFile = frontmatter.instructions_file ? String(frontmatter.instructions_file) : null;
  const inputs = Array.isArray(frontmatter.inputs) ? frontmatter.inputs.map(String) : [];
  const deliverable = frontmatter.deliverable ? String(frontmatter.deliverable) : null;
  const updatedAt = frontmatter.updated_at ? String(frontmatter.updated_at) : null;

  if (expectedStatus !== undefined && expectedStatus !== null) {
    if (typeof expectedStatus !== 'string' || !expectedStatus) {
      throw new TypeError('CRITICAL: Expected status must be a non-empty string.');
    }
    if (!status.startsWith(expectedStatus)) {
      throw new Error(`CRITICAL: Status mismatch. Expected status '${expectedStatus}', but status.md defines '${status}'.`);
    }
  }

  if (expectedDeliverable !== undefined) {
    if (expectedDeliverable === null) {
      if (deliverable !== null) {
        throw new Error(`CRITICAL: Deliverable mismatch. Expected null, but status.md defines '${deliverable}'.`);
      }
    } else {
      if (typeof expectedDeliverable !== 'string' || !expectedDeliverable) {
        throw new TypeError('CRITICAL: Expected deliverable must be a non-empty string or null.');
      }
      if (deliverable !== expectedDeliverable) {
        throw new Error(`CRITICAL: Deliverable mismatch. Expected '${expectedDeliverable}', but status.md defines '${deliverable}'.`);
      }
      const deliverablePath = path.isAbsolute(deliverable)
        ? deliverable
        : path.join(resolvedDir, deliverable);
      if (!fs.existsSync(deliverablePath)) {
        throw new Error(`CRITICAL: Deliverable file does not exist on disk: ${deliverablePath}`);
      }
    }
  }

  return {
    status,
    instructions_file: instructionsFile,
    inputs,
    deliverable,
    type,
    updated_at: updatedAt
  };
}
