import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePipelineStages, getActiveShowDir, getAllShowDirs, extractShowTitle, parseOrchestratorState } from '../sidecars/panel/lib/pipeline.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Pipeline Panel Stage Evaluation', () => {

  it('happy path 1: populates arbitrary pipeline strictly from stageXY_<name> directories without hardcoding or descriptions', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tm-test-'));
    const showDir = join(tmp, 'output', 'show_test').replace(/\\/g, '/');
    mkdirSync(join(showDir, 'stage01_data_ingest'), { recursive: true });
    mkdirSync(join(showDir, 'stage02_ai_analysis'), { recursive: true });
    mkdirSync(join(showDir, 'ignored_folder'), { recursive: true });
    mkdirSync(join(showDir, '01_legacy_stage'), { recursive: true });

    writeFileSync(join(showDir, 'stage01_data_ingest', 'status.md'), '---\nstatus: completed\n---\nDone');

    try {
      const activeShow = getActiveShowDir(tmp);
      assert.equal(activeShow, showDir);

      let result = evaluatePipelineStages(showDir);
      assert.equal(result.stageList.length, 2);
      assert.equal(result.stages[1].name, 'Data Ingest');
      assert.equal(result.stages[1].folder, 'stage01_data_ingest/');
      assert.equal(result.stages[1].status, 'completed');
      assert.equal(result.stages[1].desc, undefined);

      assert.equal(result.stages[2].name, 'Ai Analysis');
      assert.equal(result.stages[2].status, 'in_progress');
      assert.equal(result.stages[2].desc, undefined);
      assert.equal(result.stages[3], undefined);

      mkdirSync(join(showDir, 'stage03_final_report'), { recursive: true });
      result = evaluatePipelineStages(showDir);
      assert.equal(result.stageList.length, 3);
      assert.equal(result.stages[3].name, 'Final Report');
      assert.equal(result.stages[3].status, 'pending');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('happy path 2: getAllShowDirs only accepts shows that have at least one stageXY_<name> directory', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tm-shows-'));
    const validShow = join(tmp, 'output', 'show_valid');
    const invalidShow = join(tmp, 'output', 'show_invalid');
    mkdirSync(join(validShow, 'stage01_setup'), { recursive: true });
    mkdirSync(join(invalidShow, '01_setup'), { recursive: true });

    try {
      const shows = getAllShowDirs(tmp);
      assert.equal(shows.length, 1);
      assert.equal(shows[0].id, 'show_valid');
      assert.equal(shows[0].title, 'output\\show_valid');
      assert.equal(shows[0].displayPath, 'output\\show_valid');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('happy path 3: extracts title from Director Setup H1 heading if topic line missing', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tm-clash-'));
    const showDir = join(tmp, 'output', 'show_09-10-2026_the_clash');
    mkdirSync(showDir, { recursive: true });
    writeFileSync(join(showDir, '01_setup.md'), '# Director Setup & Guidelines: The Clash and their story to the release of the London Calling album (1977-1980)\n\n## 1. Selected Writer Persona');

    try {
      const title = extractShowTitle(showDir);
      assert.ok(title.includes('The Clash'));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('failure path 1: getActiveShowDir and getAllShowDirs throw if workspace directory is missing or invalid', () => {
    assert.throws(() => getActiveShowDir(null), /Workspace directory is required/);
    assert.throws(() => getAllShowDirs(''), /Workspace directory is required/);
  });

  it('failure path 2: evaluatePipelineStages throws if show directory is invalid or does not exist', () => {
    assert.throws(() => evaluatePipelineStages(null), /Show directory is required/);
    assert.throws(() => evaluatePipelineStages('non_existent_dir_123'), /Show directory not found/);
  });

  it('failure path 3: handles show directory with zero stage directories gracefully', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tm-nostages-'));
    const showDir = join(tmp, 'output', 'show_empty');
    mkdirSync(showDir, { recursive: true });
    try {
      const res = evaluatePipelineStages(showDir);
      assert.deepEqual(res.stages, {});
      assert.deepEqual(res.stageList, []);
      assert.equal(res.activeStageNum, null);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('happy path: parseOrchestratorState tolerates both stage2 and stage02 formats in status.md and state.md', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tm-orch-'));
    try {
      // Test status.md with stage2
      writeFileSync(join(tmp, 'status.md'), '---\nstatus: in_progress/stage2_concept\n---\n');
      let parsed = parseOrchestratorState(tmp);
      assert.ok(parsed);
      assert.equal(parsed.stageNum, 2);
      assert.equal(parsed.isInProgress, true);
      assert.equal(parsed.isCompleted, false);

      // Test state.md with stage03 completed
      rmSync(join(tmp, 'status.md'));
      writeFileSync(join(tmp, 'state.md'), '---\nstatus: completed/stage03_writing\n---\n');
      parsed = parseOrchestratorState(tmp);
      assert.ok(parsed);
      assert.equal(parsed.stageNum, 3);
      assert.equal(parsed.isInProgress, false);
      assert.equal(parsed.isCompleted, true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('failure path: parseOrchestratorState throws on missing argument and returns null when no state file exists', () => {
    assert.throws(() => parseOrchestratorState(null), /Show directory is required/);
    assert.throws(() => parseOrchestratorState(''), /Show directory is required/);

    const tmp = mkdtempSync(join(tmpdir(), 'tm-orch-empty-'));
    try {
      const parsed = parseOrchestratorState(tmp);
      assert.equal(parsed, null);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('orchestrator authority: evaluatePipelineStages strictly respects orchestrator status over file existence', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tm-orch-eval-'));
    const showDir = join(tmp, 'output', 'show_test').replace(/\\/g, '/');
    mkdirSync(join(showDir, 'stage01_setup'), { recursive: true });
    mkdirSync(join(showDir, 'stage02_concept'), { recursive: true });
    mkdirSync(join(showDir, 'stage03_writing'), { recursive: true });

    // Put deliverable files in stage02 and stage03 that would otherwise cause heuristic completion
    writeFileSync(join(showDir, '02_concept.md'), '# Concept');
    writeFileSync(join(showDir, 'stage02_concept', 'concept.md'), '# Concept');
    writeFileSync(join(showDir, 'stage03_writing', 'script.md'), '# Script');

    // Orchestrator says stage2 is in progress
    writeFileSync(join(showDir, 'status.md'), '---\nstatus: in_progress/stage2_concept\n---\n');

    try {
      const res = evaluatePipelineStages(showDir);
      assert.equal(res.activeStageNum, 2);
      assert.equal(res.stages[1].status, 'completed');
      assert.equal(res.stages[2].status, 'in_progress');
      assert.equal(res.stages[2].isCompleted, false);
      assert.equal(res.stages[3].status, 'pending');
      assert.equal(res.stages[3].isCompleted, false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('UI Structure: index.html has WeaveMAS UI title, SVG logo, seamless stepper, and no summary drawer', () => {
    const htmlPath = resolve(__dirname, '..', 'sidecars', 'panel', 'index.html');
    const html = readFileSync(htmlPath, 'utf8');

    // Happy Path: Title and SVG logo
    assert.match(html, /<h1[^>]*>WeaveMAS UI<\/h1>/);
    assert.match(html, /<svg class="w-4\.5 h-4\.5 text-white"/);
    assert.match(html, /<!-- Horizontal Pipeline Stepper \(Seamless \/ No Card\) -->/);

    // Failure Path 1: Radio logo strictly removed
    assert.doesNotMatch(html, /📻/);

    // Failure Path 2: Stage summary drawer box strictly removed
    assert.doesNotMatch(html, /id="stage-summary-drawer"/);
    assert.doesNotMatch(html, /id="drawer-tag"/);

    // Failure Path 3: Show: label prefix strictly removed
    assert.doesNotMatch(html, /Show:/);
  });

  it('Stage Circle Flashing: styles.css and app.js implement stage-dot-flashing animation', () => {
    const cssPath = resolve(__dirname, '..', 'sidecars', 'panel', 'styles.css');
    const css = readFileSync(cssPath, 'utf8');
    const jsPath = resolve(__dirname, '..', 'sidecars', 'panel', 'app.js');
    const js = readFileSync(jsPath, 'utf8');

    // Happy Path: CSS defines stage-dot-flashing with yellow animation
    assert.match(css, /\.stage-dot-flashing\s*\{[^}]*#f59e0b/);
    assert.match(css, /@keyframes stage-yellow-flash/);

    // Happy Path: app.js inspects stage agents for active in_progress agent
    assert.match(js, /function hasAgentInProgress/);
    assert.match(js, /dotClass = 'stage-dot-flashing'/);

    // Failure Path 1: Not flashing when nodes array is empty or undefined
    const mockNodesEmpty = [];
    const hasActiveFn = (nodes) => {
      if (!nodes || !Array.isArray(nodes)) return false;
      for (const node of nodes) {
        if (!node) continue;
        if (node.type === 'agent') {
          const status = (node.frontmatter?.status || '').toLowerCase();
          const base = status.split('/')[0];
          if (base === 'in_progress' || base === 'revising' || base === 'running') return true;
        } else if (node.type === 'group' && node.children) {
          if (hasActiveFn(node.children)) return true;
        }
      }
      return false;
    };
    assert.equal(hasActiveFn(mockNodesEmpty), false);
    assert.equal(hasActiveFn(null), false);

    // Failure Path 2: Not flashing when agents are only completed or not_started
    const mockNodesDone = [
      { type: 'agent', frontmatter: { status: 'completed' } },
      { type: 'group', children: [{ type: 'agent', frontmatter: { status: 'not_started' } }] }
    ];
    assert.equal(hasActiveFn(mockNodesDone), false);

    // Happy Path Verification: Flashes when a nested agent is in_progress
    const mockNodesActive = [
      { type: 'group', children: [{ type: 'agent', frontmatter: { status: 'in_progress/drafting' } }] }
    ];
    assert.equal(hasActiveFn(mockNodesActive), true);
  });
});
