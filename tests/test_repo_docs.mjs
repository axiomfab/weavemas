import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_FRONTMATTER_KEYS } from '../src/frontmatter.mjs';
import { TOOLS } from '../src/tool_schemas.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Verifies that a string contains strictly 7-bit printable ASCII or standard whitespace.
 * @param {string} text
 * @returns {{ ok: boolean, line?: number, col?: number, codePoint?: number }}
 */
function checkStrictAscii(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const code = line.charCodeAt(j);
      if (code > 0x7f) {
        return { ok: false, line: i + 1, col: j + 1, codePoint: line.codePointAt(j) };
      }
    }
  }
  return { ok: true };
}

test('Repository Polish (R11) - Happy Path: root MIT LICENSE exists and is strict ASCII', () => {
  const licensePath = path.join(REPO_ROOT, 'LICENSE');
  assert.equal(fs.existsSync(licensePath), true, 'Root LICENSE file must exist');

  const content = fs.readFileSync(licensePath, 'utf8');
  assert.match(content, /^MIT License\b/);
  assert.match(content, /Permission is hereby granted, free of charge/);
  assert.match(content, /THE SOFTWARE IS PROVIDED "AS IS"/);

  const asciiCheck = checkStrictAscii(content);
  assert.equal(
    asciiCheck.ok,
    true,
    `LICENSE contains non-ASCII character at line ${asciiCheck.line}, col ${asciiCheck.col}`
  );
});

test('Repository Polish (R11) - Happy Path: README.md is strict ASCII and documents MCP tools, weave.md keys, and UI sidecar', () => {
  const readmePath = path.join(REPO_ROOT, 'README.md');
  assert.equal(fs.existsSync(readmePath), true, 'Root README.md must exist');

  const readme = fs.readFileSync(readmePath, 'utf8');
  const asciiCheck = checkStrictAscii(readme);
  assert.equal(
    asciiCheck.ok,
    true,
    `README.md contains non-ASCII character U+${(asciiCheck.codePoint || 0).toString(16).toUpperCase()} at line ${asciiCheck.line}, col ${asciiCheck.col}`
  );

  // Installation & MCP setup coverage
  assert.match(readme, /weavemas_weave/);
  assert.match(readme, /src\/mcp_server\.mjs/);
  assert.match(readme, /sidecar:\/\/weavemas\/panel\//);

  for (const tool of TOOLS) {
    assert.equal(
      readme.includes(`\`${tool.name}\``),
      true,
      `README.md must document MCP tool '${tool.name}'`
    );
  }

  // Closed weave.md frontmatter key coverage
  for (const key of ALLOWED_FRONTMATTER_KEYS) {
    assert.equal(
      readme.includes(key),
      true,
      `README.md must document weave.md frontmatter key '${key}'`
    );
  }

  // Relative file links in README.md (excluding code blocks/inline code and URI schemes) must resolve
  const outsideCode = readme.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, '');
  const linkRegex = /\[[^\]]+\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(outsideCode)) !== null) {
    const target = match[1].trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) {
      continue;
    }
    const cleanRel = target.split('#')[0];
    const resolved = path.resolve(REPO_ROOT, cleanRel);
    assert.equal(
      fs.existsSync(resolved),
      true,
      `Broken relative link '${target}' in README.md`
    );
  }
});

test('Repository Polish (R11) - Failure/Guard Path: checkStrictAscii rejects Unicode emojis and punctuation', () => {
  assert.equal(checkStrictAscii('Clean ASCII text -- -> "quotes"\n').ok, true);
  assert.equal(checkStrictAscii('Emoji 🚀 header').ok, false);
  assert.equal(checkStrictAscii('Em-dash — text').ok, false);
});

test('Repository Polish (R11) - Guard Path: docs/TUTORIAL.md is removed and no tracked docs/configs reference it', () => {
  const tutorialPath = path.join(REPO_ROOT, 'docs', 'TUTORIAL.md');
  assert.equal(fs.existsSync(tutorialPath), false, 'docs/TUTORIAL.md must be removed');

  const filesToCheck = [
    path.join(REPO_ROOT, 'README.md'),
    path.join(REPO_ROOT, 'plugin.json'),
    path.join(REPO_ROOT, 'package.json'),
    path.join(REPO_ROOT, 'rules', 'minimal_frontmatter.md')
  ];

  for (const filePath of filesToCheck) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(
      content.includes('TUTORIAL.md'),
      false,
      `Stale TUTORIAL.md reference found in ${path.relative(REPO_ROOT, filePath)}`
    );
  }
});
