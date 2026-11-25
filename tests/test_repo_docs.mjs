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

  // Relative file links in README.md (excluding fenced code blocks of 3+ backticks, inline code, and URI schemes) must resolve
  const outsideCode = readme.replace(/(`{3,})[\s\S]*?\1/g, '').replace(/`[^`\n]+`/g, '');
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

test('Repository Polish (R11) - Happy Path: examples/kidswiki markdown specifications and workflow graph SVG exist, are linked from README.md, and are strict ASCII', () => {
  const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
  assert.match(readme, /!\[KidsWiki Workflow Graph\]\(assets\/kidswiki_graph\.svg\)/);

  const svgPath = path.join(REPO_ROOT, 'assets', 'kidswiki_graph.svg');
  assert.equal(fs.existsSync(svgPath), true, 'Missing assets/kidswiki_graph.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  assert.equal(checkStrictAscii(svgContent).ok, true, 'assets/kidswiki_graph.svg must be strict ASCII');
  assert.match(svgContent, /<svg\b/);

  const expectedExampleFiles = [
    'examples/kidswiki/orchestrator.md',
    'examples/kidswiki/orchestrator_trigger.md',
    'examples/kidswiki/orchestrator/stage1_editorial.md',
    'examples/kidswiki/orchestrator/stage2_publishing.md',
    'examples/kidswiki/.agent/agents/stage1_writer.md',
    'examples/kidswiki/.agent/agents/stage1_fact_checker.md',
    'examples/kidswiki/.agent/agents/stage1_age_checker.md',
    'examples/kidswiki/.agent/agents/stage2_illustrator.md'
  ];

  for (const relPath of expectedExampleFiles) {
    const absPath = path.join(REPO_ROOT, relPath);
    assert.equal(fs.existsSync(absPath), true, `Missing KidsWiki example file: ${relPath}`);
    assert.equal(
      readme.includes(`(${relPath})`),
      true,
      `README.md must link to '${relPath}'`
    );

    const content = fs.readFileSync(absPath, 'utf8');
    const asciiCheck = checkStrictAscii(content);
    assert.equal(
      asciiCheck.ok,
      true,
      `${relPath} contains non-ASCII character at line ${asciiCheck.line}, col ${asciiCheck.col}`
    );
    assert.equal(content.includes('TUTORIAL.md'), false, `Stale TUTORIAL.md link in ${relPath}`);
  }
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

test('Install Guides & Release Workflow (#26) - README.md provides self-contained collapsible per-platform guides', () => {
  const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
  const startIdx = readme.indexOf('## Installation and Setup');
  const endIdx = readme.indexOf('### MCP Tools (`weavemas_weave`)');
  assert.notEqual(startIdx, -1, 'README.md must contain Installation and Setup section');
  assert.notEqual(endIdx, -1, 'README.md must contain MCP Tools subsection');
  assert.ok(endIdx > startIdx, 'MCP Tools subsection must follow Installation and Setup');

  const installSection = readme.slice(startIdx, endIdx);
  const asciiCheck = checkStrictAscii(installSection);
  assert.equal(
    asciiCheck.ok,
    true,
    `Installation and Setup contains non-ASCII character at line ${asciiCheck.line}, col ${asciiCheck.col}`
  );

  // Extract all <details...>...</details> blocks in Installation and Setup
  const detailsRegex = /<details(\s+open)?>([\s\S]*?)<\/details>/g;
  const blocks = [];
  let m;
  while ((m = detailsRegex.exec(installSection)) !== null) {
    blocks.push({ open: Boolean(m[1]), body: m[2] });
  }
  assert.equal(blocks.length, 4, 'Installation and Setup must contain exactly 4 <details> blocks');

  // 1. Antigravity App (expanded by default)
  assert.equal(blocks[0].open, true, '1. Antigravity App block must be <details open>');
  assert.match(blocks[0].body, /1\. Antigravity App/);
  assert.match(blocks[0].body, /git clone https:\/\/github\.com\/axiomfab\/weavemas-agy\.git/);

  // 2. Antigravity IDE & VS Code (collapsed, self-contained)
  assert.equal(blocks[1].open, false, '2. Antigravity IDE & VS Code block must be collapsed by default');
  assert.match(blocks[1].body, /2\. Antigravity IDE &amp; VS Code/);
  assert.match(blocks[1].body, /git clone https:\/\/github\.com\/axiomfab\/weavemas-agy\.git/);
  assert.match(blocks[1].body, /code --install-extension[^\n]*weavemas-viewer\.vsix/);

  // 3. Cursor (collapsed, self-contained)
  assert.equal(blocks[2].open, false, '3. Cursor block must be collapsed by default');
  assert.match(blocks[2].body, /3\. Cursor/);
  assert.match(blocks[2].body, /git clone https:\/\/github\.com\/axiomfab\/weavemas-agy\.git/);
  assert.match(blocks[2].body, /install-cursor\.mjs/);
  assert.match(blocks[2].body, /cursor --install-extension[^\n]*weavemas-viewer\.vsix/);

  // 4. Codex, Claude Code, Windsurf & Other Harnesses (collapsed placeholder + standalone MCP JSON)
  assert.equal(blocks[3].open, false, '4. Other Harnesses block must be collapsed by default');
  assert.match(blocks[3].body, /4\. Codex, Claude Code, Windsurf &amp; Other Harnesses/);
  assert.match(blocks[3].body, /contact@axiomfab\.org/);
  assert.match(blocks[3].body, /"mcpServers"/);
  assert.match(blocks[3].body, /src\/mcp_server\.mjs/);
});

test('Install Guides & Release Workflow (#26) - release.yml builds and attaches weavemas-viewer.vsix on Release Please cut', () => {
  const releasePath = path.join(REPO_ROOT, '.github', 'workflows', 'release.yml');
  assert.equal(fs.existsSync(releasePath), true, '.github/workflows/release.yml must exist');

  const content = fs.readFileSync(releasePath, 'utf8');
  const asciiCheck = checkStrictAscii(content);
  assert.equal(asciiCheck.ok, true, '.github/workflows/release.yml must be strict ASCII');

  assert.match(content, /googleapis\/release-please-action@v\d+/);
  assert.match(content, /steps\.release\.outputs\.release_created == 'true'/);
  assert.match(content, /npm run build:vsix/);
  assert.match(content, /gh release upload[\s\S]*extensions\/vscode-viewer\/weavemas-viewer\.vsix/);
});
