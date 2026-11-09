import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Response, SidecarApp } from 'sidecar_sdk';
import { getMediaMimeType } from './lib/input_verifier.mjs';
import { evaluatePipelineStages, getActiveShowDir, getAllShowDirs, resolveEffectiveWorkspace } from './lib/pipeline.mjs';
import { executeStatusUpdate, readStageAgents, readAllStagesAgents } from './lib/status_tool.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE = process.cwd();

const app = new SidecarApp();
const readLocal = (rel) => readFileSync(join(HERE, rel), 'utf8');

// Static Pages & Tracker Scripts
app.page('/', () => readLocal('index.html'));
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
  if (data && data.contextDir && existsSync(data.contextDir)) return data.contextDir;
  if (data && data.showDir && existsSync(data.showDir)) return data.showDir;
  if (data && (data.contextId || data.showId)) {
    const id = data.contextId || data.showId;
    const runsCandidate = join(ws, 'runs', id);
    if (existsSync(runsCandidate)) return runsCandidate;
    const outputCandidate = join(ws, 'output', id);
    if (existsSync(outputCandidate)) return outputCandidate;
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
      showTitle: 'WeaveMAS Pipeline',
      contextTitle: 'WeaveMAS Pipeline',
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

  let resolvedPath = null;
  if (isAbsolute(rawPath) && existsSync(rawPath)) {
    resolvedPath = rawPath;
  } else {
    const contextDir = resolveContextDir(ws, data);
    const effectiveWs = resolveEffectiveWorkspace(ws, contextDir);
    const candidates = [contextDir ? join(contextDir, rawPath) : null, join(effectiveWs, rawPath), join(ws, rawPath)].filter(Boolean);
    for (const cand of candidates) {
      if (existsSync(cand) && statSync(cand).isFile()) {
        resolvedPath = cand;
        break;
      }
    }
    if (!resolvedPath && contextDir && existsSync(contextDir)) {
      const findInDir = (dir, depth = 0) => {
        if (depth > 5) return null;
        const direct = join(dir, rawPath);
        if (existsSync(direct) && statSync(direct).isFile()) return direct;
        for (const ent of readdirSync(dir, { withFileTypes: true })) {
          if (ent.isDirectory()) {
            const found = findInDir(join(dir, ent.name), depth + 1);
            if (found) return found;
          }
        }
        return null;
      };
      resolvedPath = findInDir(contextDir);
    }
  }

  if (!resolvedPath || !statSync(resolvedPath).isFile()) {
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
      'Cache-Control': 'no-cache'
    }
  });
}, 'GET');

app.run();
