import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..');

/** Precomputed IEEE 802.3 CRC-32 lookup table. */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/**
 * Computes unsigned 32-bit CRC-32 checksum for a Buffer.
 * @param {Buffer} buf
 * @returns {number}
 */
export function crc32(buf) {
  if (!Buffer.isBuffer(buf)) {
    throw new TypeError('CRITICAL: crc32 requires a Buffer');
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Escapes XML special characters for `.vsixmanifest` and `[Content_Types].xml`.
 * @param {string} str
 * @returns {string}
 */
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Builds a deterministic standard PKZIP archive Buffer from `{ path, data }` entries.
 * Uses UTF-8 filename flag (bit 11) and upfront CRC-32/sizes (bit 3 = 0) for strict `yauzl` compatibility.
 * @param {Array<{ path: string, data: Buffer | string }>} entries
 * @returns {Buffer}
 */
export function createZipArchive(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new TypeError('CRITICAL: createZipArchive requires a non-empty array of entries');
  }

  const seenPaths = new Set();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  // Deterministic MS-DOS timestamp: 2026-01-01 00:00:00
  const dosTime = 0x0000;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const item of entries) {
    if (!item || typeof item.path !== 'string' || !item.path.trim()) {
      throw new TypeError('CRITICAL: Each ZIP entry must define a non-empty string path');
    }
    const normPath = item.path.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normPath || normPath.split('/').includes('..')) {
      throw new Error(`CRITICAL: Invalid ZIP entry path '${item.path}'`);
    }
    if (seenPaths.has(normPath)) {
      throw new Error(`CRITICAL: Duplicate ZIP entry path '${normPath}'`);
    }
    seenPaths.add(normPath);

    const rawBuf = Buffer.isBuffer(item.data)
      ? item.data
      : (typeof item.data === 'string' ? Buffer.from(item.data, 'utf8') : null);
    if (!rawBuf) {
      throw new TypeError(`CRITICAL: Entry '${normPath}' data must be a Buffer or string`);
    }

    const nameBuf = Buffer.from(normPath, 'utf8');
    const crc = crc32(rawBuf);
    const useDeflate = rawBuf.length > 0;
    const compBuf = useDeflate ? zlib.deflateRawSync(rawBuf, { level: 9 }) : rawBuf;
    const method = useDeflate ? 8 : 0;
    const versionNeeded = useDeflate ? 20 : 10;
    const flags = 0x0800; // UTF-8 filenames

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(versionNeeded, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compBuf.length, 18);
    localHeader.writeUInt32LE(rawBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE((3 << 8) | 20, 4); // UNIX creator + spec 2.0
    centralHeader.writeUInt16LE(versionNeeded, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compBuf.length, 20);
    centralHeader.writeUInt32LE(rawBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, nameBuf, compBuf);
    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compBuf.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

/**
 * Parses and decompresses entries from a standard PKZIP / `.vsix` Buffer (verifying CRC-32).
 * @param {Buffer} zipBuf
 * @returns {Map<string, Buffer>}
 */
export function readZipEntries(zipBuf) {
  if (!Buffer.isBuffer(zipBuf) || zipBuf.length < 22) {
    throw new TypeError('CRITICAL: readZipEntries requires a valid ZIP Buffer');
  }
  let eocdOffset = -1;
  for (let i = zipBuf.length - 22; i >= Math.max(0, zipBuf.length - 65557); i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('CRITICAL: ZIP End of Central Directory signature not found');
  }

  const entryCount = zipBuf.readUInt16LE(eocdOffset + 10);
  const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);
  const result = new Map();

  let ptr = cdOffset;
  for (let idx = 0; idx < entryCount; idx++) {
    if (zipBuf.readUInt32LE(ptr) !== 0x02014b50) {
      throw new Error('CRITICAL: Corrupt Central Directory header signature');
    }
    const method = zipBuf.readUInt16LE(ptr + 10);
    const expectedCrc = zipBuf.readUInt32LE(ptr + 16);
    const compSize = zipBuf.readUInt32LE(ptr + 20);
    const uncompSize = zipBuf.readUInt32LE(ptr + 24);
    const nameLen = zipBuf.readUInt16LE(ptr + 28);
    const extraLen = zipBuf.readUInt16LE(ptr + 30);
    const commentLen = zipBuf.readUInt16LE(ptr + 32);
    const localOffset = zipBuf.readUInt32LE(ptr + 42);

    const name = zipBuf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    ptr += 46 + nameLen + extraLen + commentLen;

    if (zipBuf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`CRITICAL: Corrupt Local File Header for '${name}'`);
    }
    const localNameLen = zipBuf.readUInt16LE(localOffset + 26);
    const localExtraLen = zipBuf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compData = zipBuf.subarray(dataStart, dataStart + compSize);

    const rawData = method === 0
      ? Buffer.from(compData)
      : (method === 8 ? zlib.inflateRawSync(compData) : null);
    if (!rawData) {
      throw new Error(`CRITICAL: Unsupported ZIP compression method ${method} for '${name}'`);
    }
    if (rawData.length !== uncompSize) {
      throw new Error(`CRITICAL: Uncompressed size mismatch for '${name}'`);
    }
    if (crc32(rawData) !== expectedCrc) {
      throw new Error(`CRITICAL: CRC-32 mismatch for '${name}'`);
    }
    result.set(name, rawData);
  }

  return result;
}

/**
 * Generates OPC `[Content_Types].xml` for the VSIX archive.
 * @returns {string}
 */
export function buildContentTypesXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '  <Default Extension=".vsixmanifest" ContentType="text/xml" />',
    '  <Default Extension=".json" ContentType="application/json" />',
    '  <Default Extension=".js" ContentType="application/javascript" />',
    '  <Default Extension=".mjs" ContentType="application/javascript" />',
    '  <Default Extension=".css" ContentType="text/css" />',
    '  <Default Extension=".html" ContentType="text/html" />',
    '  <Default Extension=".md" ContentType="text/markdown" />',
    '  <Override PartName="/extension/LICENSE" ContentType="text/plain" />',
    '</Types>',
    ''
  ].join('\n');
}

/**
 * Generates `extension.vsixmanifest` from `extensions/vscode-viewer/package.json`.
 * @param {Record<string, unknown>} pkg
 * @returns {string}
 */
export function buildVsixManifestXml(pkg) {
  if (!pkg || typeof pkg !== 'object') {
    throw new TypeError('CRITICAL: buildVsixManifestXml requires a package.json object');
  }
  const id = escapeXml(pkg.name || 'weavemas-viewer');
  const version = escapeXml(pkg.version || '0.1.0');
  const publisher = escapeXml(pkg.publisher || 'axiomfab');
  const displayName = escapeXml(pkg.displayName || pkg.name || 'WeaveMAS Viewer');
  const description = escapeXml(pkg.description || '');
  const engine = escapeXml(pkg.engines?.vscode || '^1.85.0');
  const categories = escapeXml(Array.isArray(pkg.categories) ? pkg.categories.join(',') : 'Other');
  const repoUrl = escapeXml(
    typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url || 'https://github.com/axiomfab/weavemas-agy.git')
  );

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">',
    '  <Metadata>',
    `    <Identity Language="en-US" Id="${id}" Version="${version}" Publisher="${publisher}" />`,
    `    <DisplayName>${displayName}</DisplayName>`,
    `    <Description xml:space="preserve">${description}</Description>`,
    '    <Tags>weavemas,multi-agent,antigravity,custom-editor,weave.md</Tags>',
    `    <Categories>${categories}</Categories>`,
    '    <GalleryFlags>Public</GalleryFlags>',
    '    <Properties>',
    `      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${engine}" />`,
    '      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />',
    '      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />',
    '      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui,workspace" />',
    `      <Property Id="Microsoft.VisualStudio.Services.Links.Source" Value="${repoUrl}" />`,
    `      <Property Id="Microsoft.VisualStudio.Services.Links.GitHub" Value="${repoUrl}" />`,
    '    </Properties>',
    '    <License>extension/LICENSE</License>',
    '  </Metadata>',
    '  <Installation>',
    '    <InstallationTarget Id="Microsoft.VisualStudio.Code" />',
    '  </Installation>',
    '  <Dependencies />',
    '  <Assets>',
    '    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />',
    '    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />',
    '    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true" />',
    '  </Assets>',
    '</PackageManifest>',
    ''
  ].join('\n');
}

/**
 * Packages `extensions/vscode-viewer/` together with shared `sidecars/panel/*` and
 * `src/{status_grammar.mjs,path_resolver.mjs}` into a standalone `weavemas-viewer.vsix`.
 * @param {{
 *   repoRoot?: string,
 *   outputPath?: string
 * }} [options={}]
 * @returns {{ outputPath: string, bytes: number, entryPaths: string[], version: string }}
 */
export function buildVsixPackage(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('CRITICAL: buildVsixPackage options must be a plain object');
  }
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const extDir = path.join(repoRoot, 'extensions', 'vscode-viewer');
  const pkgPath = path.join(extDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`CRITICAL: Extension manifest not found at '${pkgPath}'`);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const outputPath = path.resolve(
    options.outputPath || path.join(extDir, 'weavemas-viewer.vsix')
  );

  const fileMappings = [
    { zipPath: 'extension/package.json', diskPath: path.join(extDir, 'package.json') },
    { zipPath: 'extension/extension.js', diskPath: path.join(extDir, 'extension.js') },
    { zipPath: 'extension/webview_bridge.js', diskPath: path.join(extDir, 'webview_bridge.js') },
    { zipPath: 'extension/webview_tailwind.css', diskPath: path.join(extDir, 'webview_tailwind.css') },
    { zipPath: 'extension/README.md', diskPath: path.join(extDir, 'README.md') },
    { zipPath: 'extension/LICENSE', diskPath: path.join(repoRoot, 'LICENSE') },
    // Shared WeaveMAS panel UI & libraries (no sidecar_sdk / main.mjs server)
    { zipPath: 'extension/sidecars/panel/index.html', diskPath: path.join(repoRoot, 'sidecars', 'panel', 'index.html') },
    { zipPath: 'extension/sidecars/panel/app.js', diskPath: path.join(repoRoot, 'sidecars', 'panel', 'app.js') },
    { zipPath: 'extension/sidecars/panel/styles.css', diskPath: path.join(repoRoot, 'sidecars', 'panel', 'styles.css') },
    { zipPath: 'extension/sidecars/panel/lib/pipeline.mjs', diskPath: path.join(repoRoot, 'sidecars', 'panel', 'lib', 'pipeline.mjs') },
    { zipPath: 'extension/sidecars/panel/lib/status_tool.mjs', diskPath: path.join(repoRoot, 'sidecars', 'panel', 'lib', 'status_tool.mjs') },
    { zipPath: 'extension/sidecars/panel/lib/input_verifier.mjs', diskPath: path.join(repoRoot, 'sidecars', 'panel', 'lib', 'input_verifier.mjs') },
    { zipPath: 'extension/sidecars/panel/trackers/header_bar.js', diskPath: path.join(repoRoot, 'sidecars', 'panel', 'trackers', 'header_bar.js') },
    { zipPath: 'extension/sidecars/panel/trackers/runtime_tracker.js', diskPath: path.join(repoRoot, 'sidecars', 'panel', 'trackers', 'runtime_tracker.js') },
    { zipPath: 'extension/sidecars/panel/trackers/agent_panel.js', diskPath: path.join(repoRoot, 'sidecars', 'panel', 'trackers', 'agent_panel.js') },
    { zipPath: 'extension/sidecars/panel/trackers/stage_panel.js', diskPath: path.join(repoRoot, 'sidecars', 'panel', 'trackers', 'stage_panel.js') },
    { zipPath: 'extension/sidecars/panel/trackers/concept_tracker.js', diskPath: path.join(repoRoot, 'sidecars', 'panel', 'trackers', 'concept_tracker.js') },
    { zipPath: 'extension/sidecars/panel/trackers/generic_tracker.js', diskPath: path.join(repoRoot, 'sidecars', 'panel', 'trackers', 'generic_tracker.js') },
    // Shared WeaveMAS grammar & path resolver imported by sidecars/panel/lib/*
    { zipPath: 'extension/src/status_grammar.mjs', diskPath: path.join(repoRoot, 'src', 'status_grammar.mjs') },
    { zipPath: 'extension/src/path_resolver.mjs', diskPath: path.join(repoRoot, 'src', 'path_resolver.mjs') }
  ];

  const entries = [
    { path: '[Content_Types].xml', data: buildContentTypesXml() },
    { path: 'extension.vsixmanifest', data: buildVsixManifestXml(pkg) }
  ];

  for (const mapping of fileMappings) {
    if (!fs.existsSync(mapping.diskPath)) {
      throw new Error(`CRITICAL: Required extension asset missing on disk: '${mapping.diskPath}'`);
    }
    entries.push({
      path: mapping.zipPath,
      data: fs.readFileSync(mapping.diskPath)
    });
  }

  const archiveBuf = createZipArchive(entries);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, archiveBuf);

  return {
    outputPath,
    bytes: archiveBuf.length,
    entryPaths: entries.map((e) => e.path),
    version: String(pkg.version)
  };
}

const isCliMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCliMain) {
  let outArg = null;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--out' && process.argv[i + 1]) {
      outArg = process.argv[i + 1];
      i++;
    }
  }
  const result = buildVsixPackage(outArg ? { outputPath: outArg } : {});
  console.log(
    `Packaged weavemas-viewer v${result.version} (${result.entryPaths.length} files, ${result.bytes} bytes) -> ${result.outputPath}`
  );
}
