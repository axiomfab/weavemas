import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Response, SidecarApp } from 'sidecar_sdk';
import { evaluatePipelineStages, getActiveShowDir, getAllShowDirs } from './lib/pipeline.mjs';
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
    const candidate = join(ws, 'output', id);
    if (existsSync(candidate)) return candidate;
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
      error: 'No pipeline directories found under output/',
      showTitle: 'WeaveMAS Pipeline',
      contextTitle: 'WeaveMAS Pipeline',
      availableShows: [],
      availableContexts: [],
      activeStageNum: 1,
      stages: {},
      stageAgents: []
    };
  }
  const result = evaluatePipelineStages(showDir);
  const showBase = basename(showDir);
  const stageAgents = readAllStagesAgents(showBase, ws);
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
  const showBase = basename(showDir);
  return {
    showId: showBase,
    stages: readAllStagesAgents(showBase, ws)
  };
}, 'GET');

// API: Stage 2 Concept Tracker data
app.api('/api/tracker/concept', (data) => {
  const ws = resolveWorkspace(data);
  const showDir = resolveShowDir(ws, data);
  if (!showDir) {
    return {
      error: 'No active show directory found under output/',
      agents: {},
      conceptFileContent: null
    };
  }
  const showBase = basename(showDir);
  const agents = readStageAgents(showBase, 'stage02_concept', ws);

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

// API: Universal status_update endpoint
app.api('/api/status_update', (data) => {
  const ws = resolveWorkspace(data);
  return executeStatusUpdate(data, ws);
}, 'POST');

app.run();
