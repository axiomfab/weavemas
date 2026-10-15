import fs from 'node:fs';
import path from 'node:path';

/**
 * Parses frontmatter from a markdown string.
 * @param {string} content 
 * @returns {{ frontmatter: Record<string, unknown>, body: string }}
 */
export function parseFrontmatter(content) {
  if (typeof content !== 'string') {
    throw new TypeError('CRITICAL: Content must be a string to parse frontmatter.');
  }
  const clean = content.replace(/^\uFEFF/, '').trimStart();
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: clean };
  }
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else if (val === 'true') {
      val = true;
    } else if (val === 'false') {
      val = false;
    } else if (val === 'null' || val === '~') {
      val = null;
    } else if (!isNaN(Number(val)) && val !== '') {
      val = Number(val);
    }
    frontmatter[key] = val;
  }
  return { frontmatter, body: match[2] || '' };
}

/**
 * Serializes frontmatter and markdown body.
 * @param {Record<string, unknown>} frontmatter 
 * @param {string} body 
 * @returns {string}
 */
export function serializeStatus(frontmatter, body) {
  if (!frontmatter || typeof frontmatter !== 'object') {
    throw new TypeError('CRITICAL: Frontmatter must be a non-null object.');
  }
  const lines = ['---'];
  for (const [key, val] of Object.entries(frontmatter)) {
    if (val === null) {
      lines.push(`${key}: null`);
    } else if (typeof val === 'string') {
      lines.push(`${key}: "${val}"`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  lines.push('---');
  return body ? `${lines.join('\n')}\n\n${body.trim()}\n` : `${lines.join('\n')}\n`;
}

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
  if (!role || typeof role !== 'string') {
    throw new TypeError('CRITICAL: Role identifier must be a non-empty string.');
  }
  if (!type || typeof type !== 'string' || (type !== 'agent' && type !== 'orchestrator')) {
    throw new TypeError('CRITICAL: Type must be either "agent" or "orchestrator".');
  }
  if (!initialStatus || typeof initialStatus !== 'string') {
    throw new TypeError('CRITICAL: Initial status must be a non-empty string.');
  }
  const resolvedDir = path.resolve(targetDir);
  if (!fs.existsSync(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true });
  }
  const statusPath = path.join(resolvedDir, 'status.md');
  const frontmatter = {
    type: type.trim(),
    role: role.trim(),
    status: initialStatus.trim(),
    deliverable: null,
    updated_at: new Date().toISOString()
  };
  const body = type === 'orchestrator'
    ? 'Pipeline execution initialized.'
    : `Working directory initialized for ${role.trim()}.`;
  fs.writeFileSync(statusPath, serializeStatus(frontmatter, body), 'utf-8');
  return {
    success: true,
    message: `STATUS_INIT_OK: Initialized status.md in ${resolvedDir}`,
    path: statusPath
  };
}

/**
 * Updates status.md in target directory.
 * @param {string} targetDir 
 * @param {string} status 
 * @param {string|null} progress 
 * @param {string|null} deliverable 
 * @returns {{ success: boolean, message: string, status: string }}
 */
export function statusUpdate(targetDir, status, progress, deliverable) {
  if (!targetDir || typeof targetDir !== 'string') {
    throw new TypeError('CRITICAL: Target directory must be a non-empty string.');
  }
  if (!status || typeof status !== 'string') {
    throw new TypeError('CRITICAL: Status must be a non-empty string.');
  }
  const validPrefixes = ['in_progress/', 'waiting/', 'completed', 'blocked/'];
  const isValid = validPrefixes.some(prefix => status === prefix || status.startsWith(prefix));
  if (!isValid) {
    throw new Error(`CRITICAL: Invalid status state '${status}'. Must be completed or start with in_progress/, waiting/, or blocked/.`);
  }
  const resolvedDir = path.resolve(targetDir);
  const statusPath = path.join(resolvedDir, 'status.md');
  if (!fs.existsSync(statusPath)) {
    throw new Error(`CRITICAL: status.md not found in directory: ${resolvedDir}`);
  }

  // Deliverable verification on completion
  if (status === 'completed') {
    if (!deliverable || typeof deliverable !== 'string') {
      throw new Error('CRITICAL: Deliverable path is required when setting status to completed.');
    }
    const deliverablePath = path.isAbsolute(deliverable)
      ? deliverable
      : path.join(resolvedDir, deliverable);
    if (!fs.existsSync(deliverablePath)) {
      throw new Error(`CRITICAL: Deliverable file does not exist on disk: ${deliverablePath}`);
    }
  }

  const fileContent = fs.readFileSync(statusPath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(fileContent);

  frontmatter.status = status;
  frontmatter.updated_at = new Date().toISOString();
  if (deliverable) {
    frontmatter.deliverable = deliverable;
  }

  let updatedBody = body;
  if (progress && typeof progress === 'string') {
    const timestamp = new Date().toISOString();
    const entry = `\n- [${timestamp}] **${status}**: ${progress.trim()}`;
    updatedBody = body.trim() ? `${body.trim()}\n${entry}` : entry.trim();
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
