import fs from 'node:fs';
import path from 'node:path';
import { parseInputEntry, inferLookupRoots, expandPathPattern, substitutePathVariables } from '../../../src/path_resolver.mjs';

/**
 * Checks existence and wildcard match count for an agent's declared inputs.
 * @param {string} agentDir - Working directory of the agent
 * @param {string[]} inputs - Array of input paths/patterns
 * @param {string} workspaceRoot - Pipeline workspace root
 * @param {string} showDir - Relative or absolute show/context dir
 * @returns {Array<{ raw: string, isWildcard: boolean, exists: boolean, count: number }>}
 */
export function checkAgentInputs(agentDir, inputs, workspaceRoot, showDir) {
  if (!agentDir || typeof agentDir !== 'string') {
    throw new TypeError('CRITICAL: agentDir must be a non-empty string');
  }
  if (!Array.isArray(inputs)) return [];

  const { contextDir, workspaceRoot: inferredRoot } = inferLookupRoots(agentDir);
  const effectiveWs = workspaceRoot || inferredRoot;
  const effectiveContext = (showDir && effectiveWs)
    ? (path.isAbsolute(showDir)
        ? showDir
        : (fs.existsSync(path.join(effectiveWs, 'runs', showDir))
            ? path.join(effectiveWs, 'runs', showDir)
            : path.join(effectiveWs, 'output', showDir)))
    : contextDir;

  return inputs.map(rawInput => {
    if (typeof rawInput !== 'string') {
      return { raw: String(rawInput), isWildcard: false, exists: false, count: 0 };
    }
    const { rawPath } = parseInputEntry(rawInput);
    const substitutedPath = substitutePathVariables(rawPath, {
      agentDir,
      contextDir: effectiveContext,
      workspaceRoot: effectiveWs
    });
    const hadVariable = rawPath !== substitutedPath;
    const isWildcard = substitutedPath.includes('*');
    const isExplicitRel = substitutedPath.startsWith('./') || substitutedPath.startsWith('../') || substitutedPath.startsWith('.\\') || substitutedPath.startsWith('..\\');

    const candidateRoots = hadVariable || path.isAbsolute(substitutedPath) || isExplicitRel
      ? [agentDir]
      : [agentDir, effectiveContext, effectiveWs].filter(Boolean);

    let matchCount = 0;
    for (const root of candidateRoots) {
      const matches = expandPathPattern(root, substitutedPath);
      if (matches.length > 0) {
        matchCount = matches.length;
        break;
      }
    }

    return {
      raw: rawInput,
      isWildcard,
      exists: matchCount > 0,
      count: matchCount
    };
  });
}

const BINARY_EXTS = new Set([
  '.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico',
  '.mp4', '.mov', '.webm', '.avi', '.mkv', '.zip', '.tar', '.gz', '.pdf'
]);

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readSingleOutputFile(filePath, displayName) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    const ext = path.extname(filePath).toLowerCase();
    if (BINARY_EXTS.has(ext)) {
      return `[Media/Binary file: ${displayName} • ${formatFileSize(stat.size)}]`;
    }
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Resolves an agent's outputs (single string, array of strings, or wildcards) and loads their contents.
 * @param {string} dir
 * @param {unknown} rawOutputs
 * @param {string} workspaceRoot
 * @param {string} showDir
 * @param {string | null} stageName
 * @returns {{ deliverableContent: string | null, outputItems: Array<{ name: string, content: string | null, exists: boolean }> }}
 */
export function resolveAgentOutputs(dir, rawOutputs, workspaceRoot, showDir, stageName) {
  if (!dir || typeof dir !== 'string') {
    throw new TypeError('CRITICAL: dir must be a non-empty string');
  }
  const patterns = Array.isArray(rawOutputs)
    ? rawOutputs.map(s => String(s).trim()).filter(s => s && s !== 'null' && s !== 'None')
    : (typeof rawOutputs === 'string' && rawOutputs.trim() && rawOutputs !== 'null' && rawOutputs !== 'None' ? [rawOutputs.trim()] : []);

  if (patterns.length === 0) {
    return { deliverableContent: null, outputItems: [] };
  }

  const showFullPath = (showDir && workspaceRoot)
    ? ((path.isAbsolute(showDir) && fs.existsSync(showDir))
        ? showDir
        : (fs.existsSync(path.join(workspaceRoot, 'runs', showDir))
            ? path.join(workspaceRoot, 'runs', showDir)
            : path.join(workspaceRoot, 'output', showDir)))
    : null;

  const candidateRoots = [
    dir,
    (stageName && showFullPath) ? path.join(showFullPath, stageName) : null,
    showFullPath
  ].filter(Boolean);

  const outputItems = [];
  for (const pat of patterns) {
    if (pat.includes('*')) {
      let matchedFiles = [];
      let matchedRoot = dir;
      for (const root of candidateRoots) {
        const matches = expandPathPattern(root, pat).filter(f => {
          try { return fs.statSync(f).isFile(); } catch { return false; }
        });
        if (matches.length > 0) {
          matchedFiles = matches;
          matchedRoot = root;
          break;
        }
      }
      if (matchedFiles.length > 0) {
        for (const fPath of matchedFiles) {
          const relName = path.relative(matchedRoot, fPath).replace(/\\/g, '/');
          const content = readSingleOutputFile(fPath, relName);
          outputItems.push({ name: relName, content, exists: content !== null });
        }
      } else {
        outputItems.push({ name: pat, content: null, exists: false });
      }
    } else {
      let foundContent = null;
      for (const root of candidateRoots) {
        const cand = path.isAbsolute(pat) ? pat : path.join(root, pat);
        if (fs.existsSync(cand)) {
          foundContent = readSingleOutputFile(cand, pat);
          if (foundContent !== null) break;
        }
      }
      outputItems.push({ name: pat, content: foundContent, exists: foundContent !== null });
    }
  }

  if (outputItems.length === 1) {
    return {
      deliverableContent: outputItems[0].exists ? outputItems[0].content : null,
      outputItems
    };
  }

  const anyExists = outputItems.some(it => it.exists);
  if (!anyExists) {
    return { deliverableContent: null, outputItems };
  }

  const combined = outputItems.map(it => {
    const body = (it.exists && it.content.trim() !== '')
      ? it.content
      : (it.exists ? 'Output file is empty.' : `Output (${it.name}) has not been generated yet.`);
    return `── 📄 ${it.name} ──\n${body}`;
  }).join('\n\n');

  return { deliverableContent: combined, outputItems };
}
