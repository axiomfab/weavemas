import fs from 'node:fs';
import path from 'node:path';

/**
 * Parses an input entry string into an optional logical name and raw path pattern.
 * Supports "- Draft: ../writer/draft.md" -> { name: "Draft", rawPath: "../writer/draft.md" }
 * while preserving Windows drive letters like "C:/..." or "C:\\..." as rawPath.
 * @param {string} entry
 * @returns {{ name: string | null, rawPath: string }}
 */
export function parseInputEntry(entry) {
  if (typeof entry !== 'string' || !entry.trim()) {
    throw new TypeError('CRITICAL: Input entry must be a non-empty string.');
  }
  const trimmed = entry.trim();
  // Match "<Label>: <path>" where Label is at least 2 chars (or 1 char if followed by ": " with space)
  // so Windows drive letters like "C:/foo" or "C:\foo" are not mistaken for labels.
  const match = trimmed.match(/^([^:/\\]+):\s+(.+)$/);
  if (match) {
    const name = match[1].trim();
    const rawPath = match[2].trim();
    if (!name || !rawPath) {
      throw new Error(`CRITICAL: Invalid named input entry '${entry}'. Expected '<Name>: <path>'.`);
    }
    return { name, rawPath };
  }
  return { name: null, rawPath: trimmed };
}

/**
 * Infers the 3-tier lookup roots from an agent's absolute working directory:
 * 1. agentDir (CWD of the agent)
 * 2. contextDir (runs/<context_slug>/ or legacy output/<context_slug>/)
 * 3. workspaceRoot (parent of runs/ or output/)
 * @param {string} agentDir
 * @returns {{ agentDir: string, contextDir: string | null, workspaceRoot: string | null }}
 */
export function inferLookupRoots(agentDir) {
  if (!agentDir || typeof agentDir !== 'string' || !path.isAbsolute(agentDir)) {
    throw new Error(`CRITICAL: agentDir must be an absolute path string (received: "${agentDir}").`);
  }
  const resolvedAgentDir = path.resolve(agentDir);
  const parts = resolvedAgentDir.split(path.sep);

  // Locate the 'runs' or legacy 'output' segment to identify <workspaceRoot>/runs/<context_slug>
  let runsIdx = parts.lastIndexOf('runs');
  if (runsIdx === -1) {
    runsIdx = parts.lastIndexOf('output');
  }
  if (runsIdx > 0 && runsIdx + 1 < parts.length) {
    const workspaceRoot = parts.slice(0, runsIdx).join(path.sep);
    const contextDir = parts.slice(0, runsIdx + 2).join(path.sep);
    return { agentDir: resolvedAgentDir, contextDir, workspaceRoot };
  }

  return { agentDir: resolvedAgentDir, contextDir: null, workspaceRoot: null };
}

/**
 * Converts a segment containing '*' wildcards into a RegExp.
 * @param {string} pattern
 * @returns {RegExp}
 */
function wildcardToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Expands a relative or absolute path (which may contain '*' wildcards in any path segment)
 * starting from baseDir. Returns an array of matching absolute file paths on disk.
 * @param {string} baseDir
 * @param {string} targetPattern
 * @returns {string[]}
 */
export function expandPathPattern(baseDir, targetPattern) {
  if (!baseDir || typeof baseDir !== 'string') {
    throw new TypeError('CRITICAL: baseDir must be a non-empty string.');
  }
  if (!targetPattern || typeof targetPattern !== 'string') {
    throw new TypeError('CRITICAL: targetPattern must be a non-empty string.');
  }

  const normalizedPattern = targetPattern.replace(/\\/g, '/');
  if (!normalizedPattern.includes('*')) {
    const candidate = path.isAbsolute(targetPattern)
      ? path.resolve(targetPattern)
      : path.resolve(baseDir, targetPattern);
    return fs.existsSync(candidate) ? [candidate] : [];
  }

  let startDir = baseDir;
  let relativeSegments = normalizedPattern.split('/').filter(Boolean);

  if (path.isAbsolute(targetPattern)) {
    const parsed = path.parse(targetPattern);
    startDir = parsed.root;
    const withoutRoot = targetPattern.slice(parsed.root.length).replace(/\\/g, '/');
    relativeSegments = withoutRoot.split('/').filter(Boolean);
  }

  let currentDirs = [path.resolve(startDir)];

  for (let i = 0; i < relativeSegments.length; i++) {
    const seg = relativeSegments[i];
    const isLast = i === relativeSegments.length - 1;
    const nextDirs = [];

    for (const dir of currentDirs) {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;

      if (seg === '.' || seg === '..') {
        const stepped = path.resolve(dir, seg);
        if (fs.existsSync(stepped)) nextDirs.push(stepped);
        continue;
      }

      if (!seg.includes('*')) {
        const joined = path.join(dir, seg);
        if (fs.existsSync(joined)) {
          nextDirs.push(joined);
        }
        continue;
      }

      const regex = wildcardToRegExp(seg);
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (regex.test(ent.name)) {
          const full = path.join(dir, ent.name);
          if (isLast || ent.isDirectory()) {
            nextDirs.push(full);
          }
        }
      }
    }
    currentDirs = nextDirs;
  }

  return currentDirs.sort();
}

/**
 * Substitutes ${PROJECT_DIR}, ${RUN_DIR}, ${AGENT_DIR} (and $PROJECT_DIR$, $RUN_DIR$, $AGENT_DIR$)
 * in targetPath using provided lookup roots.
 * @param {string} targetPath
 * @param {{ agentDir?: string, contextDir?: string | null, workspaceRoot?: string | null }} roots
 * @returns {string}
 */
export function substitutePathVariables(targetPath, roots) {
  if (typeof targetPath !== 'string' || !targetPath.trim()) {
    throw new TypeError('CRITICAL: targetPath must be a non-empty string.');
  }
  if (!roots || typeof roots !== 'object') {
    throw new TypeError('CRITICAL: roots must be a non-null object.');
  }
  const { workspaceRoot, contextDir, agentDir } = roots;

  let resolved = targetPath;

  if (resolved.includes('${PROJECT_DIR}') || resolved.includes('$PROJECT_DIR$')) {
    if (!workspaceRoot) {
      throw new Error('CRITICAL: Unable to resolve ${PROJECT_DIR}; could not infer workspace root.');
    }
    resolved = resolved.replace(/\$\{PROJECT_DIR\}|\$PROJECT_DIR\$/g, workspaceRoot);
  }

  if (resolved.includes('${RUN_DIR}') || resolved.includes('$RUN_DIR$')) {
    if (!contextDir) {
      throw new Error('CRITICAL: Unable to resolve ${RUN_DIR}; could not infer run context directory.');
    }
    resolved = resolved.replace(/\$\{RUN_DIR\}|\$RUN_DIR\$/g, contextDir);
  }

  if (resolved.includes('${AGENT_DIR}') || resolved.includes('$AGENT_DIR$')) {
    if (!agentDir) {
      throw new Error('CRITICAL: Unable to resolve ${AGENT_DIR}; could not infer agent directory.');
    }
    resolved = resolved.replace(/\$\{AGENT_DIR\}|\$AGENT_DIR\$/g, agentDir);
  }

  return resolved;
}

/**
 * Resolves a single input entry across the 3-tier hierarchy:
 * 1. Agent CWD (agentDir)
 * 2. Run Context Directory (runs/<context_slug>/ or output/<context_slug>/)
 * 3. Workspace Root (<workspace_root>/)
 * Throws a CRITICAL error if no matching file exists in any tier.
 * @param {string} agentDir
 * @param {string} entry
 * @returns {{ raw: string, name: string | null, pattern: string, matches: string[] }}
 */
export function resolveInputEntry(agentDir, entry) {
  const { name, rawPath } = parseInputEntry(entry);
  const roots = inferLookupRoots(agentDir);
  const substitutedPath = substitutePathVariables(rawPath, roots);
  const hadVariable = rawPath !== substitutedPath;

  const isExplicitRelative = substitutedPath.startsWith('./') || substitutedPath.startsWith('../') || substitutedPath.startsWith('.\\') || substitutedPath.startsWith('..\\');
  const candidateRoots = hadVariable || path.isAbsolute(substitutedPath) || isExplicitRelative
    ? [agentDir]
    : [agentDir, roots.contextDir, roots.workspaceRoot].filter(Boolean);

  for (const root of candidateRoots) {
    const matches = expandPathPattern(root, substitutedPath);
    if (matches.length > 0) {
      return { raw: entry, name, pattern: substitutedPath, matches };
    }
  }

  const tried = candidateRoots.map(r => path.isAbsolute(substitutedPath) ? substitutedPath : path.resolve(r, substitutedPath)).join(', ');
  throw new Error(`CRITICAL: Input file does not exist on disk: ${tried} (declared as "${entry}")`);
}

/**
 * Validates and normalizes outputs argument (string or string[]) into a string[] (or null if omitted).
 * @param {unknown} outputs
 * @returns {string[] | null}
 */
export function normalizeOutputs(outputs) {
  if (outputs === null || outputs === undefined) return null;
  if (typeof outputs === 'string') {
    const trimmed = outputs.trim();
    if (!trimmed) {
      throw new TypeError('CRITICAL: Outputs string must be non-empty.');
    }
    return [trimmed];
  }
  if (Array.isArray(outputs)) {
    if (outputs.length === 0) {
      throw new TypeError('CRITICAL: Outputs array must contain at least one path.');
    }
    return outputs.map(item => {
      if (typeof item !== 'string' || !item.trim()) {
        throw new TypeError('CRITICAL: Each entry in outputs array must be a non-empty string.');
      }
      return item.trim();
    });
  }
  throw new TypeError('CRITICAL: Outputs must be a non-empty string or array of strings.');
}

/**
 * Verifies that every output entry (supporting wildcards) exists on disk relative to resolvedDir.
 * @param {string} resolvedDir
 * @param {string | string[]} outputs
 * @returns {string[]}
 */
export function verifyOutputFiles(resolvedDir, outputs) {
  const normalized = normalizeOutputs(outputs);
  if (!normalized || normalized.length === 0) {
    throw new Error('CRITICAL: Outputs path is required when setting status to completed.');
  }
  const roots = inferLookupRoots(resolvedDir);
  const allMatches = [];
  for (const item of normalized) {
    const substituted = substitutePathVariables(item, roots);
    const matches = expandPathPattern(resolvedDir, substituted);
    if (matches.length === 0) {
      const targetPath = path.isAbsolute(substituted) ? substituted : path.join(resolvedDir, substituted);
      throw new Error(`CRITICAL: Output file does not exist on disk: ${targetPath}`);
    }
    allMatches.push(...matches);
  }
  return allMatches;
}

export {
  normalizeOutputs as normalizeDeliverable,
  verifyOutputFiles as verifyDeliverableFiles
};
