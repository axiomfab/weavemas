import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';

/**
 * Reads the first 1,024 bytes (1KB) of a file to extract frontmatter efficiently.
 * @param {string} filePath 
 * @returns {string}
 */
export function readFirst1KB(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(1024);
    const bytesRead = fs.readSync(fd, buffer, 0, 1024, 0);
    return buffer.toString('utf-8', 0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Recursively scans directory for agent weave.md files located under agents/ subdirectories.
 * @param {string} baseDir 
 * @returns {Array<{ agent_id: string, dir: string, statusFile: string }>}
 */
export function scanForAgents(baseDir) {
  const found = [];

  function scanInsideAgents(agentsDir) {
    if (!fs.existsSync(agentsDir)) return;
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      const fullPath = path.join(agentsDir, ent.name);
      if (ent.isDirectory()) {
        const statusFile = path.join(fullPath, 'weave.md');
        if (fs.existsSync(statusFile) && fs.statSync(statusFile).isFile()) {
          found.push({
            agent_id: ent.name,
            dir: fullPath,
            statusFile
          });
        } else {
          scanInsideAgents(fullPath);
        }
      }
    }
  }

  function walk(current) {
    if (!fs.existsSync(current)) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'agents') {
          scanInsideAgents(full);
        } else {
          walk(full);
        }
      }
    }
  }

  if (path.basename(baseDir) === 'agents') {
    scanInsideAgents(baseDir);
  } else {
    walk(baseDir);
  }

  return found;
}

/**
 * Discovers initialized or matching agent workspaces in a stage or context directory.
 * @param {string} directory 
 * @param {string|null} [filterStatus='initialized'] 
 * @param {number} [limit] 
 * @returns {{ total_matching: number, returned_count: number, remaining_count: number, agents: Array<Record<string, unknown>> }}
 */
export function discoverAgents(directory, filterStatus = 'initialized', limit = undefined) {
  if (!directory || typeof directory !== 'string') {
    throw new TypeError('CRITICAL: Directory must be a non-empty string.');
  }
  if (!path.isAbsolute(directory)) {
    throw new Error(`CRITICAL: Directory must be an absolute path (received relative path: "${directory}"). Provide the full workspace path.`);
  }

  const resolvedDir = path.resolve(directory);
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`CRITICAL: Directory does not exist on disk: ${resolvedDir}`);
  }

  if (filterStatus !== null && filterStatus !== undefined && typeof filterStatus !== 'string') {
    throw new TypeError('CRITICAL: filter_status must be a string or null.');
  }

  if (limit !== undefined && limit !== null) {
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0) {
      throw new TypeError('CRITICAL: limit must be a non-negative integer.');
    }
  }

  const items = scanForAgents(resolvedDir);
  const matching = [];

  for (const item of items) {
    const chunk = readFirst1KB(item.statusFile);
    const { frontmatter } = parseFrontmatter(chunk);
    const status = typeof frontmatter.status === 'string' ? frontmatter.status : '';

    if (filterStatus !== null && filterStatus !== undefined && status !== filterStatus) {
      continue;
    }

    matching.push({
      agent_id: item.agent_id,
      dir: item.dir,
      instructions_file: typeof frontmatter.instructions_file === 'string' ? frontmatter.instructions_file : null,
      inputs: Array.isArray(frontmatter.inputs) ? frontmatter.inputs.map(String) : [],
      status
    });
  }

  matching.sort((a, b) => a.agent_id.localeCompare(b.agent_id));

  const totalMatching = matching.length;
  const returnedAgents = (limit !== undefined && limit !== null)
    ? matching.slice(0, limit)
    : matching;

  return {
    total_matching: totalMatching,
    returned_count: returnedAgents.length,
    remaining_count: totalMatching - returnedAgents.length,
    agents: returnedAgents
  };
}
