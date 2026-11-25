#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildAdapters } from '../src/adapter_builder.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const { values } = parseArgs({
    options: {
      harness: { type: 'string', short: 'h' },
      'out-dir': { type: 'string', short: 'o' },
      check: { type: 'boolean', short: 'c', default: false }
    },
    strict: true
  });

  const result = buildAdapters({
    repoRoot: REPO_ROOT,
    harnessId: values.harness,
    outDir: values['out-dir'],
    checkOnly: Boolean(values.check)
  });

  const action = values.check ? 'Verified' : 'Built';
  for (const item of result.harnesses) {
    const relOut = path.relative(REPO_ROOT, item.outputDir) || '.';
    console.log(`${action} [${item.id}] -> ${relOut.replace(/\\/g, '/')} (${item.files.length} files)`);
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
