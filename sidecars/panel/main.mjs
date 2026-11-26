import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Response, SidecarApp } from 'sidecar_sdk';
import { resolveHostTheme, serializeHostCssVariables } from './lib/host_theme.mjs';
import { getMediaMimeType, isPathWithinRoot, resolveSafeMediaPath } from './lib/input_verifier.mjs';
import { evaluatePipelineStages, getActiveShowDir, getAllShowDirs, resolveEffectiveWorkspace } from './lib/pipeline.mjs';
import { executeStatusUpdate, readStageAgents, readAllStagesAgents } from './lib/status_tool.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE = process.cwd();

const app = new SidecarApp();
const readLocal = (rel) => readFileSync(join(HERE, rel), 'utf8');

// Static Pages & Tracker Scripts
app.page('/', () => {
  const rawHtml = readLocal('index.html');
  const hostTheme = resolveHostTheme();
  const inlineCss = serializeHostCssVariables(hostTheme.cssVariables);
  const metaJson = JSON.stringify({
    mode: hostTheme.mode,
    contrast: hostTheme.contrast,
    theme: hostTheme.theme
  }).replace(/</g, '\\u003c');
  const seedBlock = `<style id="agy-host-theme-seed">:root { ${inlineCss} }</style>\n  <script id="agy-host-theme-meta">window.__WEAVEMX_HOST_THEME__ = ${metaJson};</script>\n  `;
  return rawHtml.replace('<script>', `${seedBlock}<script>`);
});
app.api('/api/theme', () => resolveHostTheme(), 'GET');
app.page('/app.js', () => readLocal('app.js'));
app.page('/trackers/header_bar.js', () => readLocal('trackers/header_bar.js'));
app.page('/trackers/runtime_tracker.js', () => readLocal('trackers/runtime_tracker.js'));
app.page('/trackers/agent_panel.js', () => readLocal('trackers/agent_panel.js'));
app.page('/trackers/stage_panel.js', () => readLocal('trackers/stage_panel.js'));
app.page('/trackers/concept_tracker.js', () => readLocal('trackers/concept_tracker.js'));
app.page('/trackers/generic_tracker.js', () => readLocal('trackers/generic_tracker.js'));
app.api('/styles.css', () => new Response(readLocal('styles.css'), { contentType: 'text/css' }), 'GET');

function resolveWorkspace(data) {
  let ws = DEFAULT_WORKSPACE;
  if (data && data.workspaceUri) {
    try {
      ws = fileURLToPath(data.workspaceUri);
    } catch {
      // keep fallback
    }
  }
  return ws;
}

function resolveContextDir(ws, data) {
  if (data && typeof data.contextDir === 'string' && isPathWithinRoot(data.contextDir, ws, false) && existsSync(data.contextDir)) {
    return data.contextDir;
  }
  if (data && typeof data.showDir === 'string' && isPathWithinRoot(data.showDir, ws, false) && existsSync(data.showDir)) {
    return data.showDir;
  }
  if (data && (data.contextId || data.showId)) {
    const id = String(data.contextId || data.showId);
    const runsRoot = join(ws, 'runs');
    const runsCandidate = join(runsRoot, id);
    if (isPathWithinRoot(runsCandidate, runsRoot, false) && existsSync(runsCandidate)) return runsCandidate;
    const outputRoot = join(ws, 'output');
    const outputCandidate = join(outputRoot, id);
    if (isPathWithinRoot(outputCandidate, outputRoot, false) && existsSync(outputCandidate)) return outputCandidate;
    const found = getAllShowDirs(ws).find(s => s.id === id);
    if (found) return found.path;
  }
  return getActiveShowDir(ws);
}

const resolveShowDir = resolveContextDir;

// API: Pipeline status across all stages
app.api('/api/pipeline', (data) => {
  const ws = resolveWorkspace(data);
  const availableShows = getAllShowDirs(ws);
  const showDir = resolveContextDir(ws, data);

  if (!showDir) {
    return {
      error: 'No pipeline directories found under runs/ (or output/)',
      showTitle: 'WeaveMX Pipeline',
      contextTitle: 'WeaveMX Pipeline',
      availableShows: [],
      availableContexts: [],
      activeStageNum: 1,
      stages: {},
      stageAgents: []
    };
  }
  const effectiveWs = resolveEffectiveWorkspace(ws, showDir);
  const result = evaluatePipelineStages(showDir);
  const stageAgents = readAllStagesAgents(showDir, effectiveWs);
  return {
    ...result,
    stageAgents,
    availableShows,
    availableContexts: availableShows
  };
}, 'GET');

// API: All discovered pipeline agents across all stages
app.api('/api/agents', (data) => {
  const ws = resolveWorkspace(data);
  const showDir = resolveShowDir(ws, data);
  if (!showDir) return { stages: [] };
  const effectiveWs = resolveEffectiveWorkspace(ws, showDir);
  const showBase = basename(showDir);
  return {
    showId: showBase,
    stages: readAllStagesAgents(showDir, effectiveWs)
  };
}, 'GET');

// API: Stage 2 Concept Tracker data
app.api('/api/tracker/concept', (data) => {
  const ws = resolveWorkspace(data);
  const showDir = resolveShowDir(ws, data);
  if (!showDir) {
    return {
      error: 'No active show directory found under runs/ (or output/)',
      agents: {},
      conceptFileContent: null
    };
  }
  const effectiveWs = resolveEffectiveWorkspace(ws, showDir);
  const showBase = basename(showDir);
  const agents = readStageAgents(showDir, 'stage02_concept', effectiveWs);

  let conceptFileContent = null;
  const conceptCandidates = [
    join(showDir, '02_concept.md'),
    join(showDir, 'stage02_concept', '02_concept.md'),
    join(showDir, '02_concept', '02_concept.md')
  ];
  for (const candidate of conceptCandidates) {
    if (existsSync(candidate)) {
      conceptFileContent = readFileSync(candidate, 'utf8');
      break;
    }
  }

  return {
    showId: showBase,
    agents,
    conceptFileContent
  };
}, 'GET');

// API: Universal weave_update endpoint
app.api('/api/weave_update', (data) => {
  const ws = resolveWorkspace(data);
  return executeStatusUpdate(data, ws);
}, 'POST');

app.api('/api/status_update', (data) => {
  const ws = resolveWorkspace(data);
  return executeStatusUpdate(data, ws);
}, 'POST');

// API: Serve media files (images, audio, video) for deliverable previews
app.api('/api/media', (data) => {
  if (!data || typeof data.path !== 'string' || !data.path.trim()) {
    return new Response(JSON.stringify({ error: 'CRITICAL: path parameter is required' }), {
      status: 400,
      contentType: 'application/json'
    });
  }
  const ws = resolveWorkspace(data);
  const rawPath = data.path.trim();
  const mimeType = getMediaMimeType(rawPath);
  if (!mimeType) {
    return new Response(JSON.stringify({ error: `CRITICAL: Unsupported media type for '${rawPath}'` }), {
      status: 415,
      contentType: 'application/json'
    });
  }

  const contextDir = resolveContextDir(ws, data);
  const effectiveWs = resolveEffectiveWorkspace(ws, contextDir);
  let resolvedPath = null;
  try {
    resolvedPath = resolveSafeMediaPath(rawPath, effectiveWs, contextDir);
  } catch (err) {
    if (err && err.code === 'FORBIDDEN_PATH') {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 403,
        contentType: 'application/json'
      });
    }
    throw err;
  }

  if (!resolvedPath) {
    return new Response(JSON.stringify({ error: `CRITICAL: Media file not found: '${rawPath}'` }), {
      status: 404,
      contentType: 'application/json'
    });
  }

  const buffer = readFileSync(resolvedPath);
  return new Response(buffer, {
    status: 200,
    contentType: mimeType,
    headers: {
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:"
    }
  });
}, 'GET');

app.run();
