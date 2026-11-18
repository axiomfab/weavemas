import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePipelineStages, getActiveShowDir, getAllShowDirs, extractShowTitle, parseOrchestratorState, resolveEffectiveWorkspace, detectWorktreeInfo } from '../sidecars/panel/lib/pipeline.mjs';

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

    writeFileSync(join(showDir, 'stage01_data_ingest', 'weave.md'), '---\nstatus: completed\n---\nDone');

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

  it('happy path: parseOrchestratorState tolerates both stage2 and stage02 formats in weave.md and state.md', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tm-orch-'));
    try {
      // Test weave.md with stage2
      writeFileSync(join(tmp, 'weave.md'), '---\nstatus: in_progress/stage2_concept\n---\n');
      let parsed = parseOrchestratorState(tmp);
      assert.ok(parsed);
      assert.equal(parsed.stageNum, 2);
      assert.equal(parsed.isInProgress, true);
      assert.equal(parsed.isCompleted, false);

      // Test state.md with stage03 completed
      rmSync(join(tmp, 'weave.md'));
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
    writeFileSync(join(showDir, 'weave.md'), '---\nstatus: in_progress/stage2_concept\n---\n');

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

  it('UI Structure: index.html has full-bleed header and semantic roots, loads header_bar.js, and uses flat native agy styling', () => {
    const htmlPath = resolve(__dirname, '..', 'sidecars', 'panel', 'index.html');
    const html = readFileSync(htmlPath, 'utf8');
    const headerPath = resolve(__dirname, '..', 'sidecars', 'panel', 'trackers', 'header_bar.js');
    const headerJs = readFileSync(headerPath, 'utf8');
    const cssPath = resolve(__dirname, '..', 'sidecars', 'panel', 'styles.css');
    const css = readFileSync(cssPath, 'utf8');

    // Happy Path: Semantic container roots & scripts, with full-bleed header before max-w-4xl content
    assert.match(html, /<header id="header-root"><\/header>/);
    assert.match(html, /<section id="stepper-root"/);
    assert.match(html, /<main id="agents-root">/);
    assert.match(html, /<script src="trackers\/header_bar\.js"><\/script>/);
    assert.ok(html.indexOf('<header id="header-root"></header>') < html.indexOf('<div class="max-w-4xl'));
    assert.doesNotMatch(html, /<body[^>]*bg-\[#090d16\]/);
    assert.doesNotMatch(html, /<body[^>]*\bp-3\b/);

    // Happy Path: HeaderBar renders flat native agy header controls
    assert.match(headerJs, /class="agy-header"/);
    assert.match(headerJs, /id="show-select"/);
    assert.match(headerJs, /id="sync-btn"/);
    assert.match(headerJs, /class="pulsing-dot"/);
    assert.match(css, /\.agy-header\s*\{[^}]*border-bottom:/);
    assert.match(css, /\.agy-header\s*\{[^}]*var\(--agy-bg\)/);

    // Failure Path 1: Rounded card chrome & radio logo strictly removed
    assert.doesNotMatch(headerJs, /rounded-xl/);
    assert.doesNotMatch(headerJs, /bg-\[#0f172a\]/);
    assert.doesNotMatch(html, /📻/);
    assert.doesNotMatch(headerJs, /📻/);

    // Failure Path 2: Stage summary drawer box strictly removed
    assert.doesNotMatch(html, /id="stage-summary-drawer"/);
    assert.doesNotMatch(html, /id="drawer-tag"/);

    // Failure Path 3: Show: label prefix strictly removed
    assert.doesNotMatch(html, /Show:/);
    assert.doesNotMatch(headerJs, /Show:/);
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

  it('Stageless Pipeline UI: hides stepper-root when no stages exist and validates frontend script syntax', () => {
    const htmlPath = resolve(__dirname, '..', 'sidecars', 'panel', 'index.html');
    const html = readFileSync(htmlPath, 'utf8');
    const jsPath = resolve(__dirname, '..', 'sidecars', 'panel', 'app.js');
    const appJs = readFileSync(jsPath, 'utf8');

    // Happy Path 1: index.html hides stepper-line by default
    assert.match(html, /id="stepper-line"[^>]*style="display:\s*none;"/);

    // Happy Path 2: app.js hides stepperRoot and stepperLine when stageList is empty
    assert.match(appJs, /if\s*\(stageList\.length\s*===\s*0\)\s*\{\s*if\s*\(stepperRoot\)\s*stepperRoot\.style\.display\s*=\s*'none';/);
    assert.match(appJs, /if\s*\(stepperLine\)\s*stepperLine\.style\.display\s*=\s*'none';/);

    // Happy Path 3: Syntax check validates that app.js and panel trackers parse without syntax errors
    const scripts = ['app.js', 'trackers/header_bar.js', 'trackers/agent_panel.js', 'trackers/runtime_tracker.js', 'trackers/stage_panel.js'];
    for (const s of scripts) {
      const code = readFileSync(resolve(__dirname, '..', 'sidecars', 'panel', s), 'utf8');
      assert.doesNotThrow(() => new Function(code), `Syntax error in ${s}`);
    }
  });

  it('Pipeline Stepper: renders stage name cleanly without timing labels in pipeline view', () => {
    const jsPath = resolve(__dirname, '..', 'sidecars', 'panel', 'app.js');
    const appJs = readFileSync(jsPath, 'utf8');

    // Happy Path: Pipeline view renders st.name cleanly without timerLabel
    assert.match(appJs, /<span class="text-\[10px\] text-slate-500 text-center truncate max-w-\[70px\]" title="\$\{st\.name\}">\$\{st\.name\}<\/span>/);
    assert.doesNotMatch(appJs, /timerLabel/);

    // Failure Path 1: Pipeline stepper loop must not invoke calculateStageRuntime
    const stepperSectionMatch = appJs.match(/for\s*\(const st of stageList\)\s*\{([\s\S]*?)stepperRow\.innerHTML\s*=/);
    assert.ok(stepperSectionMatch, 'Stepper loop block should exist');
    assert.doesNotMatch(stepperSectionMatch[1], /calculateStageRuntime/);

    // Failure Path 2: Pipeline stepper loop must not contain bullet or timer strings
    assert.doesNotMatch(stepperSectionMatch[1], /⏱/);
    assert.doesNotMatch(stepperSectionMatch[1], /formatted/);
  });

  it('Solony Worktrees & Symlinks: getAllShowDirs discovers runs in .solony/worktrees and junctions, and resolveEffectiveWorkspace resolves worktree roots', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tm-wt-'));
    const mainShow = join(tmp, 'runs', 'show_main');
    const wtRoot = join(tmp, '.solony', 'worktrees', 'feat-jazz');
    const wtShow = join(wtRoot, 'runs', 'show_worktree');
    const emptyWt = join(tmp, '.solony', 'worktrees', 'empty-wt');

    mkdirSync(join(mainShow, 'stage01_setup'), { recursive: true });
    mkdirSync(join(wtShow, 'stage01_setup'), { recursive: true });
    mkdirSync(emptyWt, { recursive: true });

    // Create a junction/symlink in main runs pointing to an external show
    const extTarget = join(tmp, 'ext_show_target');
    mkdirSync(join(extTarget, 'stage01_setup'), { recursive: true });
    const linkedShow = join(tmp, 'runs', 'show_linked');
    symlinkSync(extTarget, linkedShow, 'junction');

    try {
      // Happy Path 1: Discovers main show, worktree show, and junctioned show without duplicates
      const shows = getAllShowDirs(tmp);
      const ids = shows.map(s => s.id);
      assert.ok(ids.includes('show_main'));
      assert.ok(ids.includes('show_worktree'));
      assert.ok(ids.includes('show_linked'));
      assert.equal(shows.length, 3);

      const mainEntry = shows.find(s => s.id === 'show_main');
      const wtEntry = shows.find(s => s.id === 'show_worktree');
      assert.equal(mainEntry.isWorktree, false);
      assert.equal(mainEntry.worktree, null);
      assert.equal(wtEntry.isWorktree, true);
      assert.equal(wtEntry.worktree, 'feat-jazz');

      // Happy Path 2: resolveEffectiveWorkspace resolves worktree root from worktree showDir
      assert.equal(resolveEffectiveWorkspace(tmp, wtShow), wtRoot);
      assert.equal(resolveEffectiveWorkspace(tmp, mainShow), tmp);

      // Happy Path 3: detectWorktreeInfo detects .git file pointing to gitdir worktrees/<name>
      const directWt = join(tmp, 'direct_wt_workspace');
      mkdirSync(directWt, { recursive: true });
      writeFileSync(join(directWt, '.git'), 'gitdir: C:/repo/.git/worktrees/feature-branch-wt\n');
      assert.deepEqual(detectWorktreeInfo(directWt), {
        isWorktree: true,
        worktreeName: 'feature-branch-wt'
      });
      assert.deepEqual(detectWorktreeInfo(tmp), {
        isWorktree: false,
        worktreeName: null
      });

      // Failure Path 1: resolveEffectiveWorkspace throws when workspaceDir is missing or not a string
      assert.throws(() => resolveEffectiveWorkspace(null, wtShow), /Workspace directory is required/);
      assert.throws(() => resolveEffectiveWorkspace('', wtShow), /Workspace directory is required/);

      // Failure Path 2: resolveEffectiveWorkspace falls back to workspaceDir when showDir is null, relative, or non-existent
      assert.equal(resolveEffectiveWorkspace(tmp, null), tmp);
      assert.equal(resolveEffectiveWorkspace(tmp, 'relative/path'), tmp);
      assert.equal(resolveEffectiveWorkspace(tmp, join(tmp, 'non_existent', 'show')), tmp);

      // Failure Path 3: detectWorktreeInfo throws on invalid rootDir or invalid explicitWorktreeName
      assert.throws(() => detectWorktreeInfo(''), /CRITICAL: rootDir is required/);
      assert.throws(() => detectWorktreeInfo(null), /CRITICAL: rootDir is required/);
      assert.throws(() => detectWorktreeInfo(tmp, 123), /CRITICAL: explicitWorktreeName must be a string or null/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('Awaiting Review Lifecycle: parseOrchestratorState & evaluatePipelineStages track awaiting_review, revisions, stage-scoped completed, and blocked', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tm-await-review-'));
    const showDir = join(tmp, 'runs', 'show_review_test').replace(/\\/g, '/');
    mkdirSync(join(showDir, 'stage01_editorial', 'agents', 'writer'), { recursive: true });
    mkdirSync(join(showDir, 'stage02_publishing'), { recursive: true });

    try {
      // 1. Happy Path: awaiting_review/stage01_editorial sets stage 1 awaiting_review and stage 2 pending
      writeFileSync(join(showDir, 'weave.md'), '---\ntype: "orchestrator"\nstatus: "awaiting_review/stage01_editorial"\noutputs: []\n---\n');
      let parsed = parseOrchestratorState(showDir);
      assert.equal(parsed.stageNum, 1);
      assert.equal(parsed.isAwaitingReview, true);
      assert.equal(parsed.isInProgress, false);
      assert.equal(parsed.isCompleted, false);

      let res = evaluatePipelineStages(showDir);
      assert.equal(res.activeStageNum, 1);
      assert.equal(res.stages[1].status, 'awaiting_review');
      assert.equal(res.stages[1].isAwaitingReview, true);
      assert.equal(res.stages[1].isCompleted, false);
      assert.equal(res.stages[1].tag, 'STAGE 1: AWAITING REVIEW');
      assert.equal(res.stages[2].status, 'pending');
      assert.equal(res.stages[2].isCompleted, false);

      // 2. Happy Path: revision returns to in_progress/stage01_editorial
      writeFileSync(join(showDir, 'weave.md'), '---\ntype: "orchestrator"\nstatus: "in_progress/stage01_editorial"\noutputs: []\n---\n');
      res = evaluatePipelineStages(showDir);
      assert.equal(res.stages[1].status, 'in_progress');
      assert.equal(res.stages[1].isAwaitingReview, false);
      assert.equal(res.stages[2].status, 'pending');

      // 3. Happy Path: completed/stage01_editorial completes ONLY stage 1 and leaves stage 2 pending
      writeFileSync(join(showDir, 'weave.md'), '---\ntype: "orchestrator"\nstatus: "completed/stage01_editorial"\noutputs: []\n---\n');
      res = evaluatePipelineStages(showDir);
      assert.equal(res.stages[1].status, 'completed');
      assert.equal(res.stages[1].isCompleted, true);
      assert.equal(res.stages[2].status, 'pending');
      assert.equal(res.stages[2].isCompleted, false);

      // 4. Happy Path: in_progress/stage02_publishing marks stage 1 completed and stage 2 in_progress
      writeFileSync(join(showDir, 'weave.md'), '---\ntype: "orchestrator"\nstatus: "in_progress/stage02_publishing"\noutputs: []\n---\n');
      res = evaluatePipelineStages(showDir);
      assert.equal(res.activeStageNum, 2);
      assert.equal(res.stages[1].status, 'completed');
      assert.equal(res.stages[2].status, 'in_progress');

      // 5. Happy Path: blocked/stage02_publishing marks stage 1 completed and stage 2 blocked
      writeFileSync(join(showDir, 'weave.md'), '---\ntype: "orchestrator"\nstatus: "blocked/stage02_publishing"\noutputs: []\n---\n');
      res = evaluatePipelineStages(showDir);
      assert.equal(res.activeStageNum, 2);
      assert.equal(res.stages[1].status, 'completed');
      assert.equal(res.stages[2].status, 'blocked');
      assert.equal(res.stages[2].tag, 'STAGE 2: BLOCKED');

      // 6. Failure Path 1: Body text mentioning "status: completed" does not override frontmatter status
      writeFileSync(
        join(showDir, 'weave.md'),
        '---\ntype: "orchestrator"\nstatus: "awaiting_review/stage01_editorial"\n---\n# Pipeline Status\n\nNote: agent had status: completed\n'
      );
      parsed = parseOrchestratorState(showDir);
      assert.equal(parsed.rawStatus, 'awaiting_review/stage01_editorial');
      assert.equal(parsed.isAwaitingReview, true);
      assert.equal(parsed.isCompleted, false);

      // Non-review states must keep isAwaitingReview=false
      for (const nonReview of ['in_progress/stage01_editorial', 'completed/stage01_editorial', 'blocked/stage01_editorial', 'waiting/sourcer', 'not_started']) {
        writeFileSync(join(showDir, 'weave.md'), `---\nstatus: "${nonReview}"\n---\n`);
        assert.equal(parseOrchestratorState(showDir).isAwaitingReview, false, `${nonReview} should not set isAwaitingReview`);
      }

      // 7. Failure Path 2: Bare awaiting_review or not_started does not mark downstream stages completed despite md files on disk
      writeFileSync(join(showDir, 'stage01_editorial', '01_draft.md'), '# Draft');
      writeFileSync(join(showDir, 'stage02_publishing', '02_final.md'), '# Final');
      writeFileSync(join(showDir, 'weave.md'), '---\nstatus: "not_started"\n---\n');
      res = evaluatePipelineStages(showDir);
      assert.equal(res.stages[1].status, 'pending');
      assert.equal(res.stages[2].status, 'pending');

      writeFileSync(join(showDir, 'weave.md'), '---\nstatus: "awaiting_review"\n---\n');
      res = evaluatePipelineStages(showDir);
      assert.equal(res.stages[1].status, 'completed');
      assert.equal(res.stages[2].status, 'awaiting_review');

      // When stage 2 has no activity on disk, bare awaiting_review infers stage 1 even if stage 1 has 01_draft.md
      rmSync(join(showDir, 'stage02_publishing', '02_final.md'));
      res = evaluatePipelineStages(showDir);
      assert.equal(res.stages[1].status, 'awaiting_review');
      assert.equal(res.stages[2].status, 'pending');

      // Heuristic fallback when root weave.md is absent respects stage-level awaiting_review despite 01_draft.md
      rmSync(join(showDir, 'weave.md'));
      writeFileSync(join(showDir, 'stage01_editorial', 'weave.md'), '---\nstatus: "awaiting_review"\n---\n');
      res = evaluatePipelineStages(showDir);
      assert.equal(res.stages[1].status, 'awaiting_review');
      assert.equal(res.stages[2].status, 'pending');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('Yellow-Green UI Indicator: styles.css, app.js, and StagePanel render awaiting_review in lime (#84cc16)', () => {
    const cssPath = resolve(__dirname, '..', 'sidecars', 'panel', 'styles.css');
    const css = readFileSync(cssPath, 'utf8');
    const appPath = resolve(__dirname, '..', 'sidecars', 'panel', 'app.js');
    const appJs = readFileSync(appPath, 'utf8');
    const stagePanelPath = resolve(__dirname, '..', 'sidecars', 'panel', 'trackers', 'stage_panel.js');
    const stagePanelJs = readFileSync(stagePanelPath, 'utf8');

    // Happy Path 1: CSS defines yellow-green lime (#84cc16) indicator and blocked rose (#f43f5e) indicator
    assert.match(css, /--lime:\s*#84cc16;/);
    assert.match(css, /\.stage-dot-awaiting-review\s*\{[^}]*#84cc16/);
    assert.match(css, /\.stage-dot-blocked\s*\{[^}]*#f43f5e/);

    // Happy Path 2: app.js applies stage-dot-awaiting-review for awaiting_review stages
    assert.match(appJs, /dotClass = 'stage-dot-awaiting-review'/);
    assert.match(appJs, /dotClass = 'stage-dot-blocked'/);

    // Happy Path 3: StagePanel renders lime badge and state label for awaiting_review
    const ctx = { window: {}, console };
    vm.createContext(ctx);
    vm.runInContext(stagePanelJs, ctx);
    const StagePanel = ctx.window.StagePanel;
    const container = { innerHTML: '' };

    StagePanel.render(container, {
      title: 'Stage 1: Editorial',
      desc: 'Waiting for user review',
      outputFile: '01_editorial_approved.md',
      status: 'awaiting_review',
      isCompleted: false,
      isAwaitingReview: true,
      tag: 'STAGE 1: AWAITING REVIEW'
    });
    assert.match(container.innerHTML, /bg-lime-500\/15/);
    assert.match(container.innerHTML, /text-lime-400/);
    assert.match(container.innerHTML, /STAGE 1: AWAITING REVIEW/);
    assert.match(container.innerHTML, /awaiting_review/);

    // Failure Path 1: StagePanel handles null container or null stageInfo without throwing
    assert.doesNotThrow(() => StagePanel.render(null, { status: 'awaiting_review' }));
    assert.doesNotThrow(() => StagePanel.render(container, null));

    // Failure Path 2: StagePanel does not render lime styling for blocked or completed stages
    StagePanel.render(container, {
      title: 'Stage 2: Publishing',
      desc: 'Blocked by missing input',
      outputFile: '02_final.md',
      status: 'blocked',
      isCompleted: false,
      tag: 'STAGE 2: BLOCKED'
    });
    assert.match(container.innerHTML, /bg-rose-500\/15/);
    assert.match(container.innerHTML, /text-rose-400/);
    assert.doesNotMatch(container.innerHTML, /text-lime-400/);
  });

  it('Light/Dark Theme Tokens & Bootstrap: styles.css, index.html, and trackers define theme variables, early init, and semantic classes', () => {
    const css = readFileSync(resolve(__dirname, '..', 'sidecars', 'panel', 'styles.css'), 'utf8');
    const html = readFileSync(resolve(__dirname, '..', 'sidecars', 'panel', 'index.html'), 'utf8');
    const agentPanelJs = readFileSync(resolve(__dirname, '..', 'sidecars', 'panel', 'trackers', 'agent_panel.js'), 'utf8');
    const runtimeJs = readFileSync(resolve(__dirname, '..', 'sidecars', 'panel', 'trackers', 'runtime_tracker.js'), 'utf8');
    const stagePanelJs = readFileSync(resolve(__dirname, '..', 'sidecars', 'panel', 'trackers', 'stage_panel.js'), 'utf8');

    // Happy Path 1: styles.css defines [data-theme="dark"] and [data-theme="light"] blocks and .agy-theme-btn
    assert.match(css, /\[data-theme="dark"\]\s*\{[\s\S]*?--agy-bg:\s*#131316;/);
    assert.match(css, /\[data-theme="light"\]\s*\{[\s\S]*?--agy-bg:\s*#f8fafc;/);
    assert.match(css, /\[data-theme="light"\]\s*\{[\s\S]*?--weave-card-bg:\s*#ffffff;/);
    assert.match(css, /\.agy-theme-btn/);
    assert.match(css, /\[data-theme="light"\]\s+\.vivid-pulse/);
    assert.match(css, /html,\s*\r?\nbody\s*\{[\s\S]*?background-color:\s*var\(--agy-bg\)\s*!important;/);
    assert.match(css, /\.weave-card,\s*\r?\n\.weave-stage-panel\s*\{[\s\S]*?background-color:\s*var\(--weave-card-bg\)\s*!important;/);
    assert.match(css, /\.weave-card-header\s*\{[\s\S]*?background-color:\s*var\(--weave-card-header-bg\)\s*!important;/);
    assert.match(css, /\.weave-group,\s*\r?\n\.weave-empty-state\s*\{[\s\S]*?background-color:\s*var\(--weave-group-bg\)\s*!important;/);

    // Happy Path 2: trackers emit semantic weave-* hooks
    assert.match(agentPanelJs, /weave-card/);
    assert.match(agentPanelJs, /weave-code-box/);
    assert.match(agentPanelJs, /weave-badge-completed/);
    assert.match(runtimeJs, /weave-runtime-badge/);
    assert.match(runtimeJs, /weave-log-entry/);
    assert.match(stagePanelJs, /weave-stage-panel/);

    // Happy Path 3: index.html inline bootstrap sets data-theme before /preload.js
    const inlineMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<script src="\/preload\.js"><\/script>/);
    assert.ok(inlineMatch, 'Early theme bootstrap script must appear before /preload.js');

    const runBootstrap = (localStorageImpl) => {
      const attrs = {};
      const ctx = {
        window: { localStorage: localStorageImpl },
        document: {
          documentElement: {
            style: {},
            setAttribute(k, v) { attrs[k] = v; }
          }
        }
      };
      vm.createContext(ctx);
      vm.runInContext(inlineMatch[1], ctx);
      return { attrs, style: ctx.document.documentElement.style };
    };

    const lightBoot = runBootstrap({ getItem: () => 'light' });
    assert.equal(lightBoot.attrs['data-theme'], 'light');
    assert.equal(lightBoot.style.colorScheme, 'light');

    // Failure Path 1: Bootstrap falls back to 'dark' when stored value is unrecognized or null
    const invalidBoot = runBootstrap({ getItem: () => 'unexpected-theme' });
    assert.equal(invalidBoot.attrs['data-theme'], 'dark');
    assert.equal(invalidBoot.style.colorScheme, 'dark');

    // Failure Path 2: Bootstrap falls back safely to 'dark' when localStorage access throws SecurityError
    const throwingBoot = runBootstrap({ getItem() { throw new Error('SecurityError'); } });
    assert.equal(throwingBoot.attrs['data-theme'], 'dark');
    assert.equal(throwingBoot.style.colorScheme, 'dark');
  });
});
