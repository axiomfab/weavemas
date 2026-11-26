import fs from 'node:fs';
import path from 'node:path';
import { buildAdapters } from './adapter_builder.mjs';

export const CURSOR_MCP_SERVER_NAME = 'weavemx_weave';

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`CRITICAL: '${label}' must be a non-null plain object.`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`CRITICAL: '${label}' must be a non-empty string.`);
  }
}

/**
 * Normalizes a filesystem path to forward slashes for cross-platform JSON config portability.
 * @param {string} targetPath
 * @returns {string}
 */
export function normalizePosixPath(targetPath) {
  assertNonEmptyString(targetPath, 'targetPath');
  return path.resolve(targetPath).replace(/\\/g, '/');
}

/**
 * Constructs the `.cursor/mcp.json` server entry for `weavemx_weave`.
 * @param {string} serverScriptPath
 * @returns {{ command: string, args: string[] }}
 */
export function buildCursorMcpServerEntry(serverScriptPath) {
  assertNonEmptyString(serverScriptPath, 'serverScriptPath');
  return {
    command: 'node',
    args: [normalizePosixPath(serverScriptPath)]
  };
}

/**
 * Non-destructively merges the `weavemx_weave` MCP server entry into an existing
 * `.cursor/mcp.json` object without clobbering sibling top-level keys or other MCP servers.
 *
 * @param {Record<string, any> | null | undefined} existingConfig
 * @param {string} serverScriptPath
 * @returns {Record<string, any>}
 */
export function mergeCursorMcpConfig(existingConfig, serverScriptPath) {
  assertNonEmptyString(serverScriptPath, 'serverScriptPath');

  let base = {};
  if (existingConfig !== undefined && existingConfig !== null) {
    assertPlainObject(existingConfig, 'existingConfig');
    base = { ...existingConfig };
  }

  let existingServers = {};
  if (base.mcpServers !== undefined) {
    assertPlainObject(base.mcpServers, 'mcpServers');
    existingServers = { ...base.mcpServers };
  }

  return {
    ...base,
    mcpServers: {
      ...existingServers,
      [CURSOR_MCP_SERVER_NAME]: buildCursorMcpServerEntry(serverScriptPath)
    }
  };
}

/**
 * Installs the generated WeaveMX Cursor adapter (`.cursor/rules/*.mdc`, `.cursor/agents/*.md`)
 * and registers `weavemx_weave` in `<targetDir>/.cursor/mcp.json`.
 *
 * @param {{
 *   repoRoot: string,
 *   targetDir: string,
 *   serverScriptPath?: string,
 *   dryRun?: boolean
 * }} options
 * @returns {{
 *   harnessId: 'cursor',
 *   targetDir: string,
 *   dryRun: boolean,
 *   adapterFiles: string[],
 *   mcpJsonPath: string,
 *   mcpStatus: 'created' | 'updated' | 'unchanged',
 *   mcpServer: { command: string, args: string[] }
 * }}
 */
export function installCursorAdapter({ repoRoot, targetDir, serverScriptPath, dryRun = false }) {
  assertNonEmptyString(repoRoot, 'repoRoot');
  assertNonEmptyString(targetDir, 'targetDir');

  const absRepoRoot = path.resolve(repoRoot);
  const absTargetDir = path.resolve(targetDir);

  if (!fs.existsSync(absTargetDir)) {
    throw new Error(`CRITICAL: Target project directory does not exist: '${absTargetDir}'.`);
  }
  if (!fs.statSync(absTargetDir).isDirectory()) {
    throw new Error(`CRITICAL: Target path is not a directory: '${absTargetDir}'.`);
  }

  const absServerScript = path.resolve(
    serverScriptPath || path.join(absRepoRoot, 'src', 'mcp_server.mjs')
  );
  if (!fs.existsSync(absServerScript)) {
    throw new Error(`CRITICAL: MCP server script does not exist: '${absServerScript}'.`);
  }

  const buildResult = buildAdapters({
    repoRoot: absRepoRoot,
    harnessId: 'cursor',
    outDir: absTargetDir,
    checkOnly: Boolean(dryRun),
    eol: '\n'
  });
  const cursorHarness = buildResult.harnesses[0];

  const mcpJsonPath = path.join(absTargetDir, '.cursor', 'mcp.json');
  let existingRaw = null;
  let existingObj = null;

  if (fs.existsSync(mcpJsonPath)) {
    existingRaw = fs.readFileSync(mcpJsonPath, 'utf8');
    try {
      existingObj = JSON.parse(existingRaw);
    } catch (err) {
      throw new Error(
        `CRITICAL: Existing '${mcpJsonPath}' contains invalid JSON: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const mergedConfig = mergeCursorMcpConfig(existingObj, absServerScript);
  const nextRaw = `${JSON.stringify(mergedConfig, null, 2)}\n`;

  let mcpStatus;
  if (existingRaw === null) {
    mcpStatus = 'created';
  } else if (existingRaw.replace(/\r\n/g, '\n') === nextRaw) {
    mcpStatus = 'unchanged';
  } else {
    mcpStatus = 'updated';
  }

  if (!dryRun && mcpStatus !== 'unchanged') {
    fs.mkdirSync(path.dirname(mcpJsonPath), { recursive: true });
    fs.writeFileSync(mcpJsonPath, nextRaw, 'utf8');
  }

  return {
    harnessId: 'cursor',
    targetDir: absTargetDir,
    dryRun: Boolean(dryRun),
    adapterFiles: cursorHarness.files,
    mcpJsonPath,
    mcpStatus,
    mcpServer: mergedConfig.mcpServers[CURSOR_MCP_SERVER_NAME]
  };
}
