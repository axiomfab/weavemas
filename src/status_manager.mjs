import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, serializeStatus } from './frontmatter.mjs';

export { parseFrontmatter, serializeStatus };

/**
 * Initializes a new status.md in target directory.
 * @param {string} targetDir 
 * @param {string} role 
 * @param {string} [type='agent']
 * @param {string} [initialStatus='not_started']
 * @returns {{ success: boolean, message: string, path: string }}
 */
export function statusInit(targetDir, role, type = 'agent', initialStatus = 'not_started') {
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
    ? `# Pipeline Status\n\n- ${now}: Pipeline execution initialized (\`${initialStatus}\`).\n`
    : `# ${role} Status\n\n- ${now}: Initialized status as \`${initialStatus}\`.\n`;

  fs.writeFileSync(statusPath, serializeStatus(frontmatter, initialBody), 'utf-8');

  return {
    success: true,
    message: `STATUS_INIT_OK: Initialized ${type} status for '${role}' at ${statusPath}`,
    path: statusPath
  };
}

/**
 * Updates status.md in target directory with new status, optional progress note, and optional deliverable.
 * @param {string} targetDir 
 * @param {string} status 
 * @param {string|null} [progress=null]
 * @param {string|null} [deliverable=null]
 * @returns {{ success: boolean, message: string, status: string }}
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
  const timestamp = now;
  const progressLine = progress ? ` - ${progress}` : '';
  const logEntry = `- ${timestamp}: \`${status}\`${progressLine}`;

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
 * @param {string} targetDir 
 * @param {string} expectedRole 
 * @returns {{ success: boolean, role: string, status: string }}
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
 * Reads status.md from targetDir, parses frontmatter, verifies deliverable existence on disk,
 * and returns structured metadata.
 * @param {string} targetDir
 * @returns {{
 *   success: boolean,
 *   status: string,
 *   role: string,
 *   type?: string,
 *   deliverable: string | null,
 *   deliverable_path: string | null,
 *   deliverable_exists: boolean,
 *   deliverable_size: number,
 *   is_completed: boolean,
 *   progress?: string | null,
 *   updated_at?: string | null
 * }}
 */
export function statusRead(targetDir) {
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
  const type = frontmatter.type ? String(frontmatter.type) : undefined;
  const deliverable = frontmatter.deliverable ? String(frontmatter.deliverable) : null;
  const progress = frontmatter.progress ? String(frontmatter.progress) : null;
  const updatedAt = frontmatter.updated_at ? String(frontmatter.updated_at) : null;

  let deliverablePath = null;
  let deliverableExists = false;
  let deliverableSize = 0;

  if (deliverable) {
    deliverablePath = path.isAbsolute(deliverable) ? deliverable : path.join(resolvedDir, deliverable);
    deliverableExists = fs.existsSync(deliverablePath);
    if (deliverableExists) {
      deliverableSize = fs.statSync(deliverablePath).size;
    }
  }

  const isCompleted = status.startsWith('completed') && (deliverable ? (deliverableExists && deliverableSize > 0) : true);

  return {
    success: true,
    status,
    role,
    ...(type ? { type } : {}),
    deliverable,
    deliverable_path: deliverablePath,
    deliverable_exists: deliverableExists,
    deliverable_size: deliverableSize,
    is_completed: isCompleted,
    ...(progress ? { progress } : {}),
    ...(updatedAt ? { updated_at: updatedAt } : {})
  };
}
