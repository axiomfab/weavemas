#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { installCursorAdapter } from '../src/cursor_installer.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function printHelp() {
  console.log(`Usage: node scripts/install-cursor.mjs [options] [target-dir]

Installs the WeaveMX Cursor adapter (.cursor/rules/*.mdc, .cursor/agents/*.md)
and registers the 'weavemx_weave' MCP server in <target-dir>/.cursor/mcp.json.

Options:
  -t, --target <dir>       Target project directory (or pass as first positional arg)
  -s, --server-path <file> Custom path to src/mcp_server.mjs (defaults to this repo)
  -n, --dry-run            Validate and preview changes without writing files
  -h, --help               Show this help message
`);
}

function main() {
  const { values, positionals } = parseArgs({
    options: {
      target: { type: 'string', short: 't' },
      'server-path': { type: 'string', short: 's' },
      'dry-run': { type: 'boolean', short: 'n', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    },
    allowPositionals: true,
    strict: true
  });

  if (values.help) {
    printHelp();
    return;
  }

  const targetDir = values.target || positionals[0];
  if (!targetDir) {
    throw new Error(
      'CRITICAL: Missing target project directory. Pass --target <dir> or a positional <target-dir>.'
    );
  }

  const result = installCursorAdapter({
    repoRoot: REPO_ROOT,
    targetDir,
    serverScriptPath: values['server-path'],
    dryRun: Boolean(values['dry-run'])
  });

  const prefix = result.dryRun ? '[dry-run] ' : '';
  const rules = result.adapterFiles.filter((f) => f.startsWith('.cursor/rules/'));
  const agents = result.adapterFiles.filter((f) => f.startsWith('.cursor/agents/'));

  console.log(`${prefix}Installed WeaveMX Cursor adapter into ${result.targetDir.replace(/\\/g, '/')}`);
  console.log(`  Rules  (${rules.length}): ${rules.join(', ')}`);
  console.log(`  Agents (${agents.length}): ${agents.join(', ')}`);
  console.log(`  MCP    (${result.mcpStatus}): .cursor/mcp.json -> weavemx_weave (${result.mcpServer.args[0]})`);
  console.log('  Tip: Install the weave.md viewer with `cursor --install-extension extensions/vscode-viewer/weavemx-viewer.vsix`');
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
