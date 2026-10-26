import fs from 'node:fs';
import path from 'node:path';
import { parseInputEntry, inferLookupRoots, expandPathPattern } from '../../../src/path_resolver.mjs';

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
    ? (path.isAbsolute(showDir) ? showDir : path.join(effectiveWs, 'output', showDir))
    : contextDir;

  return inputs.map(rawInput => {
    if (typeof rawInput !== 'string') {
      return { raw: String(rawInput), isWildcard: false, exists: false, count: 0 };
    }
    const { rawPath } = parseInputEntry(rawInput);
    const isWildcard = rawPath.includes('*');
    const isExplicitRel = rawPath.startsWith('./') || rawPath.startsWith('../') || rawPath.startsWith('.\\') || rawPath.startsWith('..\\');

    const candidateRoots = path.isAbsolute(rawPath) || isExplicitRel
      ? [agentDir]
      : [agentDir, effectiveContext, effectiveWs].filter(Boolean);

    let matchCount = 0;
    for (const root of candidateRoots) {
      const matches = expandPathPattern(root, rawPath);
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
