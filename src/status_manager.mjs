import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, serializeStatus, ALLOWED_FRONTMATTER_KEYS } from './frontmatter.mjs';

export { parseFrontmatter, serializeStatus, ALLOWED_FRONTMATTER_KEYS };

/**
 * Batch initializes multiple status.md files with strict pre-validation.
 */
export function statusInitBatch(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new TypeError('CRITICAL: items must be a non-empty array of objects.');
  }

  // 1. Strict pre-validation pass before touching disk
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== 'object') {
      throw new TypeError(`CRITICAL: Item at index ${i} must be an object.`);
    }
    if (!item.dir || typeof item.dir !== 'string') {
      throw new TypeError(`CRITICAL: Item at index ${i} must have a non-empty string 'dir'.`);
    }
    if (!path.isAbsolute(item.dir)) {
      throw new Error(`CRITICAL: Item at index ${i} has relative path "${item.dir}". Target directory must be an absolute path.`);
    }
    if (!item.role || typeof item.role !== 'string') {
      throw new TypeError(`CRITICAL: Item at index ${i} must have a non-empty string 'role'.`);
    }
    const type = item.type || 'agent';
    if (type !== 'agent' && type !== 'orchestrator') {
      throw new TypeError(`CRITICAL: Item at index ${i} type must be either "agent" or "orchestrator".`);
    }
    const status = item.status || 'not_started';
    if (typeof status !== 'string' || !status) {
      throw new TypeError(`CRITICAL: Item at index ${i} initial status must be a non-empty string.`);
    }
  }

  // 2. Execution pass
  const paths = [];
  for (const item of items) {
    const res = statusInit(item.dir, item.role, item.type || 'agent', item.status || 'not_started');
    paths.push(res.path);
  }

  return {
    success: true,
    count: paths.length,
    message: `STATUS_INIT_OK: Batch initialized ${paths.length} status.md files`,
    paths
  };
}

/**
 * Initializes a new status.md in target directory, or batch initializes if passed an array or { items }.
 */
export function statusInit(targetDir, role, type = 'agent', initialStatus = 'not_started') {
  if (Array.isArray(targetDir)) {
    return statusInitBatch(targetDir);
  }
  if (typeof targetDir === 'object' && targetDir !== null && Array.isArray(targetDir.items)) {
    return statusInitBatch(targetDir.items);
  }

  if (!targetDir || typeof targetDir !== 'string') {
    throw new TypeError('CRITICAL: Target directory must be a non-empty string.');
  }
  if (!path.isAbsolute(targetDir)) {
    throw new Error(`CRITICAL: Target directory must be an absolute path (received relative path: "${targetDir}"). Provide the full workspace path.`);
  }
  if (!role || typeof role !== 'string') {
    throw new TypeError('CRITICAL: Role identifier must be a non-empty string.');
  }
  const validTypes = ['agent', 'orchestrator'];
  if (!validTypes.includes(type)) {
    throw new TypeError('CRITICAL: Type must be either "agent" or "orchestrator".');
  }
  if (typeof initialStatus !== 'string' || !initialStatus) {
    throw new TypeError('CRITICAL: Initial status must be a non-empty string.');
  }

  const resolvedDir = path.resolve(targetDir);
  if (!fs.existsSync(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true });
  }

  const statusPath = path.join(resolvedDir, 'status.md');
  const now = new Date().toISOString();

  const frontmatter = {
    type,
    role,
    status: initialStatus,
    deliverable: null,
    updated_at: now
  };

  const initialBody = type === 'orchestrator'
    ? `# Pipeline Status\n\n- ${now}: \`${initialStatus}\` - Pipeline execution initialized\n`
    : `# ${role} Status\n\n- ${now}: \`${initialStatus}\` - Initialized status\n`;

  fs.writeFileSync(statusPath, serializeStatus(frontmatter, initialBody), 'utf-8');

  return {
    success: true,
    message: `STATUS_INIT_OK: Initialized ${type} status for '${role}' at ${statusPath}`,
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
 * Verifies that the agent role in status.md matches the expected role.
 */
export function statusVerify(targetDir, expectedRole) {
  if (!targetDir || typeof targetDir !== 'string') {
    throw new TypeError('CRITICAL: Target directory must be a non-empty string.');
  }
  if (!path.isAbsolute(targetDir)) {
    throw new Error(`CRITICAL: Target directory must be an absolute path (received relative path: "${targetDir}"). Provide the full workspace path.`);
  }
  if (!expectedRole || typeof expectedRole !== 'string') {
    throw new TypeError('CRITICAL: Expected role must be a non-empty string.');
  }
  const resolvedDir = path.resolve(targetDir);
  const statusPath = path.join(resolvedDir, 'status.md');
  if (!fs.existsSync(statusPath)) {
    throw new Error(`CRITICAL: status.md not found in directory: ${resolvedDir}`);
  }
  const fileContent = fs.readFileSync(statusPath, 'utf-8');
  const { frontmatter } = parseFrontmatter(fileContent);
  if (!frontmatter.role) {
    throw new Error(`CRITICAL: No role found in status.md frontmatter at ${statusPath}`);
  }
  if (frontmatter.role !== expectedRole) {
    throw new Error(`CRITICAL: Role mismatch. Expected '${expectedRole}', but status.md defines '${frontmatter.role}'.`);
  }
  return {
    success: true,
    role: String(frontmatter.role),
    status: String(frontmatter.status)
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
  const role = String(frontmatter.role ?? '');
  const type = String(frontmatter.type ?? 'agent');
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
    role,
    deliverable,
    type,
    updated_at: updatedAt
  };
}
