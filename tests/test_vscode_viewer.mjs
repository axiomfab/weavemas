import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  buildVsixPackage,
  createZipArchive,
  readZipEntries,
  crc32
} from '../scripts/build_vsix.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const EXT_DIR = path.join(REPO_ROOT, 'extensions', 'vscode-viewer');
const require = createRequire(import.meta.url);

const viewerExt = require(path.join(EXT_DIR, 'extension.js'));
const { createWeaveHostBridge } = require(path.join(EXT_DIR, 'webview_bridge.js'));

/**
 * Creates an in-memory mock `vscode` API capturing custom editor registrations, commands,
 * FileSystemWatcher callbacks, `openWith` calls, and `openExternal` calls.
 */
function createMockVscode(workspaceRoot) {
  const registeredEditors = new Map();
  const registeredCommands = new Map();
  const executedCommands = [];
  const externalUris = [];
  const watchers = [];
  const textDocListeners = new Set();

  class RelativePattern {
    constructor(base, pattern) {
      this.base = base;
      this.pattern = pattern;
    }
  }

  const Uri = {
    file(fsPath) {
      const resolved = path.resolve(fsPath);
      return {
        scheme: 'file',
        fsPath: resolved,
        toString() {
          return `file://${resolved.replace(/\\/g, '/')}`;
        }
      };
    },
    parse(raw) {
      return {
        raw,
        toString() {
          return raw;
        }
      };
    }
  };

  const vscodeApi = {
    Uri,
    RelativePattern,
    ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
    window: {
      activeColorTheme: { kind: 2 },
      activeTextEditor: null,
      registerCustomEditorProvider(viewType, provider, options) {
        registeredEditors.set(viewType, { provider, options });
        return { dispose() { registeredEditors.delete(viewType); } };
      }
    },
    commands: {
      registerCommand(id, handler) {
        registeredCommands.set(id, handler);
        return { dispose() { registeredCommands.delete(id); } };
      },
      async executeCommand(id, ...args) {
        executedCommands.push({ id, args });
        if (registeredCommands.has(id)) {
          return await registeredCommands.get(id)(...args);
        }
        return undefined;
      }
    },
    workspace: {
      workspaceFolders: workspaceRoot ? [{ uri: Uri.file(workspaceRoot) }] : [],
      getWorkspaceFolder(uri) {
        if (!workspaceRoot || !uri?.fsPath) return undefined;
        return { uri: Uri.file(workspaceRoot) };
      },
      createFileSystemWatcher(pattern) {
        const createCbs = new Set();
        const changeCbs = new Set();
        const deleteCbs = new Set();
        let isDisposed = false;
        const watcher = {
          pattern,
          get disposed() { return isDisposed; },
          onDidCreate(cb) {
            createCbs.add(cb);
            return { dispose() { createCbs.delete(cb); } };
          },
          onDidChange(cb) {
            changeCbs.add(cb);
            return { dispose() { changeCbs.delete(cb); } };
          },
          onDidDelete(cb) {
            deleteCbs.add(cb);
            return { dispose() { deleteCbs.delete(cb); } };
          },
          fireCreate(uri) { createCbs.forEach((cb) => cb(uri)); },
          fireChange(uri) { changeCbs.forEach((cb) => cb(uri)); },
          fireDelete(uri) { deleteCbs.forEach((cb) => cb(uri)); },
          dispose() {
            isDisposed = true;
            createCbs.clear();
            changeCbs.clear();
            deleteCbs.clear();
          }
        };
        watchers.push(watcher);
        return watcher;
      },
      onDidChangeTextDocument(cb) {
        textDocListeners.add(cb);
        return { dispose() { textDocListeners.delete(cb); } };
      }
    },
    env: {
      async openExternal(uri) {
        externalUris.push(uri.toString());
        return true;
      }
    }
  };

  return {
    vscodeApi,
    registeredEditors,
    registeredCommands,
    executedCommands,
    externalUris,
    watchers,
    fireTextDocChange(fsPath) {
      const evt = { document: { uri: Uri.file(fsPath) } };
      textDocListeners.forEach((cb) => cb(evt));
    }
  };
}

/**
 * Creates a mock VS Code WebviewPanel capturing `html`, `options`, `postMessage` payloads,
 * incoming Webview message simulation, and `dispose()`.
 */
function createMockWebviewPanel() {
  const postedMessages = [];
  const msgListeners = new Set();
  const disposeListeners = new Set();
  const viewStateListeners = new Set();

  const webview = {
    cspSource: 'https://file+.vscode-resource.vscode-cdn.net',
    options: {},
    html: '',
    asWebviewUri(uri) {
      const clean = (uri.fsPath || String(uri)).replace(/\\/g, '/');
      return {
        toString() {
          return `https://file+.vscode-resource.vscode-cdn.net/${clean.replace(/^\/+/, '')}`;
        }
      };
    },
    async postMessage(msg) {
      postedMessages.push(msg);
      return true;
    },
    onDidReceiveMessage(cb) {
      msgListeners.add(cb);
      return { dispose() { msgListeners.delete(cb); } };
    }
  };

  const panel = {
    active: true,
    webview,
    onDidChangeViewState(cb) {
      viewStateListeners.add(cb);
      return { dispose() { viewStateListeners.delete(cb); } };
    },
    onDidDispose(cb) {
      disposeListeners.add(cb);
      return { dispose() { disposeListeners.delete(cb); } };
    }
  };

  return {
    panel,
    postedMessages,
    async sendFromWebview(msg) {
      for (const cb of [...msgListeners]) {
        await cb(msg);
      }
    },
    disposePanel() {
      panel.active = false;
      for (const cb of [...disposeListeners]) {
        cb();
      }
    }
  };
}

test('Extension Manifest & Orchestrator Skills (#23) - registers **/weave.md custom editor, 1-click raw toggle, and clickable [weave.md](file://...) links', () => {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const extPkg = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'package.json'), 'utf8'));

  assert.equal(extPkg.name, 'weavemx-viewer');
  assert.equal(extPkg.publisher, 'axiomfab');
  assert.equal(extPkg.version, rootPkg.version);
  assert.deepEqual(extPkg.activationEvents, ['onCustomEditor:weavemx.viewer']);

  const customEditors = extPkg.contributes?.customEditors || [];
  assert.equal(customEditors.length, 1);
  assert.equal(customEditors[0].viewType, 'weavemx.viewer');
  assert.equal(customEditors[0].displayName, 'WeaveMX');
  assert.equal(customEditors[0].priority, 'default');
  assert.deepEqual(customEditors[0].selector, [{ filenamePattern: '**/weave.md' }]);

  const cmdIds = (extPkg.contributes?.commands || []).map((c) => c.command);
  assert.ok(cmdIds.includes('weavemx.viewRawMarkdown'));
  assert.ok(cmdIds.includes('weavemx.openViewer'));
  const openViewerCmd = (extPkg.contributes?.commands || []).find((c) => c.command === 'weavemx.openViewer');
  assert.equal(openViewerCmd?.title, 'Open WeaveMX');

  const sidecarManifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'sidecars', 'panel', 'sidecar.json'), 'utf8'));
  assert.equal(sidecarManifest.display_name, 'WeaveMX');
  assert.equal(sidecarManifest.ui_config?.display_name, 'WeaveMX');
  assert.equal(sidecarManifest.ui_config?.views?.[0]?.title, 'WeaveMX');

  const sidecarHtml = fs.readFileSync(path.join(REPO_ROOT, 'sidecars', 'panel', 'index.html'), 'utf8');
  assert.match(sidecarHtml, /<title>WeaveMX<\/title>/);

  const titleMenus = extPkg.contributes?.menus?.['editor/title'] || [];
  assert.ok(titleMenus.some((m) => m.command === 'weavemx.viewRawMarkdown' && m.when.includes('weavemx.viewer')));
  assert.ok(titleMenus.some((m) => m.command === 'weavemx.openViewer' && m.when.includes('weave.md')));

  const orchSkill = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'weave-orchestrator', 'SKILL.md'), 'utf8');
  const matches = orchSkill.match(/\[weave\.md\]\(file:\/\/<workspace_root>\/runs\/<context_slug>\/weave\.md\)/g) || [];
  assert.ok(matches.length >= 3, 'weave-orchestrator/SKILL.md must emit [weave.md](file://...) at Step 0, Review Gate, and Stage Advance');
  assert.match(orchSkill, /\[WeaveMX\]\(sidecar:\/\/weavemx\/panel\/\)/);
  assert.doesNotMatch(orchSkill, /WeaveMX UI/);

  const execSkill = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'orchestrator-agent-execution', 'SKILL.md'), 'utf8');
  assert.match(execSkill, /\[weave\.md\]\(file:\/\/<workspace_root>\/runs\/<context_slug>\/weave\.md\)/);
  assert.match(execSkill, /\[WeaveMX\]\(sidecar:\/\/weavemx\/panel\/\)/);
  assert.doesNotMatch(execSkill, /WeaveMX UI/);
});

test('Shared Panel Hooks (#23) - HeaderBar onViewRawMarkdown toggle and AgentPanel webviewUri / WeaveHostBridge hooks', () => {
  const headerCode = fs.readFileSync(path.join(REPO_ROOT, 'sidecars', 'panel', 'trackers', 'header_bar.js'), 'utf8');
  const headerCtx = { window: {}, module: { exports: {} }, console };
  vm.createContext(headerCtx);
  vm.runInContext(headerCode, headerCtx);
  const HeaderBar = headerCtx.window.HeaderBar;

  let rawClicks = 0;
  let rawHandler = null;
  const mockRawBtn = {
    addEventListener(ev, fn) {
      if (ev === 'click') rawHandler = fn;
    }
  };
  const containerWithRaw = {
    innerHTML: '',
    querySelector(sel) {
      if (sel === 'header') return this.innerHTML.includes('<header') ? {} : null;
      if (sel === '#raw-markdown-btn') return mockRawBtn;
      return null;
    }
  };

  HeaderBar.render(containerWithRaw, {
    shows: [{ path: 'c:/ws/runs/demo', displayPath: 'runs\\demo' }],
    activePath: 'c:/ws/runs/demo',
    onViewRawMarkdown: () => { rawClicks += 1; }
  });
  assert.match(containerWithRaw.innerHTML, /id="raw-markdown-btn"/);
  assert.match(containerWithRaw.innerHTML, /View Raw Markdown/);
  assert.equal(typeof rawHandler, 'function');
  rawHandler();
  assert.equal(rawClicks, 1);

  // Guard paths: omitted onViewRawMarkdown hides button; non-function throws TypeError
  const containerWithoutRaw = { innerHTML: '', querySelector: () => null };
  HeaderBar.render(containerWithoutRaw, { shows: [] });
  assert.doesNotMatch(containerWithoutRaw.innerHTML, /id="raw-markdown-btn"/);

  assert.throws(
    () => HeaderBar.render({ innerHTML: '', querySelector: () => null }, { shows: [], onViewRawMarkdown: 'invalid' }),
    /CRITICAL: onViewRawMarkdown must be a function/
  );
  assert.throws(
    () => HeaderBar.render({ innerHTML: '', querySelector: () => null }, { shows: [], onViewRawMarkdown: 123 }),
    /CRITICAL: onViewRawMarkdown must be a function/
  );

  // AgentPanel webviewUri & WeaveHostBridge.openConversation
  const rtCode = fs.readFileSync(path.join(REPO_ROOT, 'sidecars', 'panel', 'trackers', 'runtime_tracker.js'), 'utf8');
  const agentCode = fs.readFileSync(path.join(REPO_ROOT, 'sidecars', 'panel', 'trackers', 'agent_panel.js'), 'utf8');
  let openedConvId = null;
  const agentCtx = {
    window: {
      WeaveHostBridge: {
        openConversation(id) { openedConvId = id; }
      }
    },
    console
  };
  vm.createContext(agentCtx);
  vm.runInContext(rtCode, agentCtx);
  vm.runInContext(agentCode, agentCtx);
  const AgentPanel = agentCtx.window.AgentPanel;

  const directImg = AgentPanel.renderMediaPreviewHtml(
    '02_illustration.png',
    'image',
    'C:/ws/runs/demo/02_illustration.png',
    'https://file+.vscode-resource.vscode-cdn.net/C:/ws/runs/demo/02_illustration.png'
  );
  assert.match(directImg, /src="https:\/\/file\+\.vscode-resource\.vscode-cdn\.net\/C:\/ws\/runs\/demo\/02_illustration\.png"/);
  assert.doesNotMatch(directImg, /\/api\/media/);

  // Whitespace webviewUri falls back cleanly to /api/media
  const fallbackImg = AgentPanel.renderMediaPreviewHtml('02_illustration.png', 'image', 'C:/ws/runs/demo/02_illustration.png', '   ');
  assert.match(fallbackImg, /\/api\/media\?path=/);

  let convClickHandler = null;
  const fakeConvBtn = {
    getAttribute(attr) { return attr === 'data-conv-id' ? '3f8a9c12-4b7e-4d1a-9e2b-8c7d6e5f4a3b' : null; },
    addEventListener(ev, fn) { if (ev === 'click') convClickHandler = fn; }
  };
  const cardContainer = {
    innerHTML: '',
    querySelectorAll(sel) {
      if (sel === '[data-conv-id]') return [fakeConvBtn];
      return [];
    }
  };
  AgentPanel.expandedCards.add('card_s1_writer');
  AgentPanel.render(cardContainer, {
    stages: [{
      num: 1,
      name: 'Editorial',
      nodes: [{
        type: 'agent',
        id: 'writer',
        name: 'writer',
        frontmatter: { status: 'completed', conversation_id: '3f8a9c12-4b7e-4d1a-9e2b-8c7d6e5f4a3b' },
        body: ''
      }]
    }]
  });
  assert.equal(typeof convClickHandler, 'function');
  convClickHandler({ stopPropagation() {} });
  assert.equal(openedConvId, '3f8a9c12-4b7e-4d1a-9e2b-8c7d6e5f4a3b');
  AgentPanel.expandedCards.clear();
});

test('Webview Bridge & Frontend Controller (#23) - boots with zero polling, renders push updates, and dispatches user actions', () => {
  const sentMessages = [];
  let savedState = {};
  let winMessageHandler = null;

  const elementsById = {
    'header-root': {
      innerHTML: '',
      querySelector() { return null; }
    },
    'stepper-root': { style: {} },
    'stepper-line': { style: {} },
    'stages-stepper-row': { innerHTML: '' },
    'agents-root': {
      innerHTML: '',
      querySelectorAll() { return []; }
    }
  };

  const docRoot = {
    style: {},
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k] ?? null; }
  };

  const vmWindow = {
    __WEAVEMX_BOOT__: {
      initialContextDir: 'C:/workspace/runs/kidswiki_rocket_age4',
      initialTheme: 'light',
      initialPayload: {
        contextDir: 'C:/workspace/runs/kidswiki_rocket_age4',
        selectedContextDir: 'C:/workspace/runs/kidswiki_rocket_age4',
        availableContexts: [{ path: 'C:/workspace/runs/kidswiki_rocket_age4', displayPath: 'runs\\kidswiki_rocket_age4' }],
        stages: {
          1: { num: 1, name: 'Editorial', status: 'in_progress', isCompleted: false, tag: 'STAGE 1: IN PROGRESS' }
        },
        stageList: [
          { num: 1, name: 'Editorial', status: 'in_progress', isCompleted: false, tag: 'STAGE 1: IN PROGRESS' }
        ],
        stageAgents: [{
          num: 1,
          name: 'Editorial',
          nodes: [{ type: 'agent', id: 'writer', name: 'writer', frontmatter: { status: 'in_progress/02_draft' }, body: '' }]
        }]
      }
    },
    addEventListener(ev, fn) {
      if (ev === 'message') winMessageHandler = fn;
    }
  };

  const vmContext = {
    window: vmWindow,
    document: {
      readyState: 'complete',
      documentElement: docRoot,
      getElementById(id) { return elementsById[id] || null; },
      querySelectorAll() { return []; },
      addEventListener() {}
    },
    acquireVsCodeApi() {
      return {
        postMessage(msg) { sentMessages.push(msg); },
        getState() { return savedState; },
        setState(next) { savedState = next; }
      };
    },
    setInterval() {
      // RuntimeTracker registers a local 200ms DOM timer, while app.js must NOT register 4000ms network polling
      return 1;
    },
    clearInterval() {},
    console
  };
  vmWindow.document = vmContext.document;

  vm.createContext(vmContext);
  for (const rel of [
    'extensions/vscode-viewer/webview_bridge.js',
    'sidecars/panel/trackers/header_bar.js',
    'sidecars/panel/trackers/runtime_tracker.js',
    'sidecars/panel/trackers/agent_panel.js',
    'sidecars/panel/trackers/stage_panel.js',
    'sidecars/panel/app.js'
  ]) {
    vm.runInContext(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'), vmContext);
  }

  // Zero HTTP polling in VS Code Webview mode
  assert.equal(vmWindow.App.isPollingActive(), false);
  assert.equal(docRoot.getAttribute('data-theme'), 'light');
  assert.deepEqual(JSON.parse(JSON.stringify(sentMessages)), [
    { type: 'ready', contextDir: 'C:/workspace/runs/kidswiki_rocket_age4' }
  ]);
  assert.match(elementsById['stages-stepper-row'].innerHTML, /Stage 1/);
  assert.match(elementsById['agents-root'].innerHTML, /Writer/);

  // Push live update via postMessage -> re-renders completed stage and second agent
  assert.equal(typeof winMessageHandler, 'function');
  winMessageHandler({
    data: {
      type: 'pipelineUpdate',
      payload: {
        contextDir: 'C:/workspace/runs/kidswiki_rocket_age4',
        selectedContextDir: 'C:/workspace/runs/kidswiki_rocket_age4',
        availableContexts: [{ path: 'C:/workspace/runs/kidswiki_rocket_age4', displayPath: 'runs\\kidswiki_rocket_age4' }],
        stages: {
          1: { num: 1, name: 'Editorial', status: 'completed', isCompleted: true, tag: 'STAGE 1: COMPLETED' }
        },
        stageList: [
          { num: 1, name: 'Editorial', status: 'completed', isCompleted: true, tag: 'STAGE 1: COMPLETED' }
        ],
        stageAgents: [{
          num: 1,
          name: 'Editorial',
          nodes: [
            { type: 'agent', id: 'writer', name: 'writer', frontmatter: { status: 'completed' }, body: '' },
            { type: 'agent', id: 'fact_checker', name: 'fact_checker', frontmatter: { status: 'completed' }, body: '' }
          ]
        }]
      }
    }
  });
  assert.match(elementsById['stages-stepper-row'].innerHTML, /stage-dot-completed/);
  assert.match(elementsById['agents-root'].innerHTML, /Fact Checker/);

  // Bridge actions & persistence
  vmWindow.WeaveHostBridge.selectContext('C:/workspace/runs/other_run');
  vmWindow.WeaveHostBridge.requestPipeline('C:/workspace/runs/other_run');
  vmWindow.WeaveHostBridge.viewRawMarkdown('C:/workspace/runs/other_run');
  vmWindow.WeaveHostBridge.storage.setItem('weavemx-ui-theme', 'dark');
  assert.equal(vmWindow.WeaveHostBridge.storage.getItem('weavemx-ui-theme'), 'dark');
  assert.equal(sentMessages.some((m) => m.type === 'selectContext' && m.contextDir === 'C:/workspace/runs/other_run'), true);
  assert.equal(sentMessages.some((m) => m.type === 'requestPipeline'), true);
  assert.equal(sentMessages.some((m) => m.type === 'viewRawMarkdown'), true);

  // Failure / Guard paths on createWeaveHostBridge
  assert.throws(() => createWeaveHostBridge('invalid'), /CRITICAL: createWeaveHostBridge options must be a plain object/);
  assert.throws(() => createWeaveHostBridge({ vscodeApi: null }), /CRITICAL: VS Code Webview API/);
  const bridge = createWeaveHostBridge({ vscodeApi: { postMessage() {} } });
  assert.throws(() => bridge.onPipelineUpdate('not-fn'), /CRITICAL: onPipelineUpdate requires a function listener/);
  assert.throws(() => bridge.selectContext('   '), /CRITICAL: selectContext requires a non-empty contextDir/);
  assert.doesNotThrow(() => bridge._handleHostMessage({ data: null }));
});

test('WeaveCustomEditorProvider (#23) - end-to-end FileSystemWatcher live updates, run switching, 1-click raw toggle, and security guards', async () => {
  const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemx-vsce-ws-'));
  const run1 = path.join(tmpWs, 'runs', 'kidswiki_rocket_age4');
  const run2 = path.join(tmpWs, 'runs', 'kidswiki_moon_age6');
  const wtRun = path.join(tmpWs, '.solony', 'worktrees', 'feat-ui', 'runs', 'kidswiki_mars_age5');

  try {
    fs.mkdirSync(path.join(run1, 'stage01_editorial', 'agents', 'writer'), { recursive: true });
    fs.mkdirSync(path.join(run1, 'stage02_publishing', 'agents', 'illustrator'), { recursive: true });
    fs.mkdirSync(path.join(run2, 'stage01_editorial'), { recursive: true });
    fs.mkdirSync(path.join(wtRun, 'stage01_editorial', 'agents', 'writer'), { recursive: true });

    const rootWeave1 = path.join(run1, 'weave.md');
    fs.writeFileSync(rootWeave1, '---\ntype: "orchestrator"\nstatus: "stage01_editorial/in_progress"\n---\n', 'utf8');
    fs.writeFileSync(
      path.join(run1, 'stage01_editorial', 'agents', 'writer', 'weave.md'),
      '---\ntype: "agent"\nstatus: "in_progress/02_draft"\noutputs:\n  - "draft.md"\n---\n- 2026-11-25T10:00:00.000Z: `in_progress/02_draft` - Writing\n',
      'utf8'
    );
    fs.writeFileSync(path.join(run1, 'stage01_editorial', 'agents', 'writer', 'draft.md'), '# Rocket\nBlast off!\n', 'utf8');
    fs.writeFileSync(
      path.join(run1, 'stage02_publishing', 'agents', 'illustrator', 'weave.md'),
      '---\ntype: "agent"\nstatus: "completed"\noutputs:\n  - "illustration.png"\n---\n',
      'utf8'
    );
    fs.writeFileSync(path.join(run1, 'stage02_publishing', 'agents', 'illustrator', 'illustration.png'), 'PNG_DATA', 'utf8');
    fs.writeFileSync(path.join(run2, 'weave.md'), '---\ntype: "orchestrator"\nstatus: "stage01_editorial/awaiting_review"\n---\n', 'utf8');
    fs.writeFileSync(path.join(wtRun, 'weave.md'), '---\ntype: "orchestrator"\nstatus: "stage01_editorial/completed"\n---\n', 'utf8');

    const mockHost = createMockVscode(tmpWs);
    const subscriptions = [];
    viewerExt.activate({ extensionPath: EXT_DIR, subscriptions }, mockHost.vscodeApi);

    assert.equal(mockHost.registeredEditors.has('weavemx.viewer'), true);
    assert.equal(mockHost.registeredCommands.has('weavemx.viewRawMarkdown'), true);
    assert.equal(mockHost.registeredCommands.has('weavemx.openViewer'), true);

    const provider = new viewerExt.WeaveCustomEditorProvider(
      { extensionPath: EXT_DIR },
      { vscodeApi: mockHost.vscodeApi, watcherDebounceMs: 0 }
    );

    const { panel, postedMessages, sendFromWebview, disposePanel } = createMockWebviewPanel();
    const doc = { uri: mockHost.vscodeApi.Uri.file(rootWeave1) };
    await provider.resolveCustomTextEditor(doc, panel);

    // Verify CSP, offline styles (no remote CDN / preload.js), and embedded initial state
    assert.match(panel.webview.html, /Content-Security-Policy/);
    assert.match(panel.webview.html, /webview_tailwind\.css/);
    assert.doesNotMatch(panel.webview.html, /gstatic\.com/);
    assert.doesNotMatch(panel.webview.html, /\/preload\.js/);
    assert.equal(mockHost.watchers.length, 1);
    assert.equal(mockHost.watchers[0].pattern.pattern, '**/weave.md');

    // Webview 'ready' receives full pipeline payload including main + worktree runs & media webviewUri
    await sendFromWebview({ type: 'ready', contextDir: null });
    assert.equal(postedMessages.length, 1);
    const readyPayload = postedMessages[0].payload;
    assert.equal(readyPayload.stages[1].status, 'in_progress');
    assert.equal(readyPayload.availableContexts.length, 3);
    const illusStage = readyPayload.stageAgents.find((s) => s.num === 2);
    assert.ok(illusStage);
    const illusItem = illusStage.nodes[0].outputItems[0];
    assert.match(illusItem.webviewUri, /^https:\/\/file\+\.vscode-resource\.vscode-cdn\.net\//);

    // Live FileSystemWatcher change on **/weave.md pushes updated state automatically
    fs.writeFileSync(rootWeave1, '---\ntype: "orchestrator"\nstatus: "stage01_editorial/awaiting_review"\n---\n', 'utf8');
    mockHost.watchers[0].fireChange(doc.uri);
    await new Promise((r) => setTimeout(r, 15));
    const afterWatchPayload = postedMessages[postedMessages.length - 1].payload;
    assert.equal(afterWatchPayload.stages[1].status, 'awaiting_review');

    // Switching run via selectContext updates payload to run2
    await sendFromWebview({ type: 'selectContext', contextDir: run2 });
    const switchedPayload = postedMessages[postedMessages.length - 1].payload;
    assert.equal(switchedPayload.selectedContextDir, run2.replace(/\\/g, '/'));
    assert.equal(switchedPayload.stages[1].status, 'awaiting_review');

    // Guard path: path traversal in selectContext is ignored and does not switch outside workspaceRoot
    const countBeforeTraversal = postedMessages.length;
    await sendFromWebview({ type: 'selectContext', contextDir: path.join(tmpWs, '..', 'outside_dir') });
    assert.equal(postedMessages.length, countBeforeTraversal);

    // 1-click "View Raw Markdown" from Webview opens weave.md in default text editor
    await sendFromWebview({ type: 'viewRawMarkdown', contextDir: run2 });
    const openRawCall = mockHost.executedCommands.find((c) => c.id === 'vscode.openWith' && c.args[1] === 'default');
    assert.ok(openRawCall, 'viewRawMarkdown must execute vscode.openWith with "default"');
    assert.equal(path.resolve(openRawCall.args[0].fsPath), path.resolve(path.join(run2, 'weave.md')));

    // Reverse 1-click "Open WeaveMX" command reopens weave.md in weavemx.viewer
    await mockHost.vscodeApi.commands.executeCommand('weavemx.openViewer', doc.uri);
    const openViewerCall = mockHost.executedCommands.find((c) => c.id === 'vscode.openWith' && c.args[1] === 'weavemx.viewer');
    assert.ok(openViewerCall, 'weavemx.openViewer must execute vscode.openWith with "weavemx.viewer"');

    // Guard path: openConversation accepts valid UUID and rejects malformed URIs
    await sendFromWebview({ type: 'openConversation', conversationId: 'not-a-uuid;evil' });
    assert.equal(mockHost.externalUris.length, 0);
    await sendFromWebview({ type: 'openConversation', conversationId: '3f8a9c12-4b7e-4d1a-9e2b-8c7d6e5f4a3b' });
    assert.deepEqual(mockHost.externalUris, ['conversation://3f8a9c12-4b7e-4d1a-9e2b-8c7d6e5f4a3b']);

    // Opening nested worker weave.md focuses its stage and agent card automatically
    const nestedPanel = createMockWebviewPanel();
    const nestedDoc = {
      uri: mockHost.vscodeApi.Uri.file(path.join(run1, 'stage02_publishing', 'agents', 'illustrator', 'weave.md'))
    };
    await provider.resolveCustomTextEditor(nestedDoc, nestedPanel.panel);
    await nestedPanel.sendFromWebview({ type: 'ready' });
    const nestedPayload = nestedPanel.postedMessages[0].payload;
    assert.equal(nestedPayload.selectedContextDir, run1.replace(/\\/g, '/'));
    assert.equal(nestedPayload.focusStageNum, 2);
    assert.equal(nestedPayload.focusCardId, 'card_s2_illustrator');

    // Disposing panel cleans up FileSystemWatcher and stops pushing updates
    disposePanel();
    assert.equal(mockHost.watchers[0].disposed, true);
    const countAfterDispose = postedMessages.length;
    mockHost.watchers[0].fireChange(doc.uri);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(postedMessages.length, countAfterDispose);
  } finally {
    fs.rmSync(tmpWs, { recursive: true, force: true });
  }
});

test('WeaveCustomEditorProvider Guard Paths (#23) - validates constructor, activate, resolveCustomTextEditor, and inline JSON escaping', async () => {
  assert.throws(() => new viewerExt.WeaveCustomEditorProvider(null), /CRITICAL: WeaveCustomEditorProvider requires a context/);
  assert.throws(() => new viewerExt.WeaveCustomEditorProvider({ extensionPath: '' }), /CRITICAL: WeaveCustomEditorProvider requires a context/);
  assert.throws(() => new viewerExt.WeaveCustomEditorProvider({ extensionPath: EXT_DIR }, 'bad'), /CRITICAL: WeaveCustomEditorProvider options must be a plain object/);
  assert.throws(() => new viewerExt.WeaveCustomEditorProvider({ extensionPath: EXT_DIR }, { unknownOpt: 1 }), /CRITICAL: Unknown option 'unknownOpt'/);
  assert.throws(() => new viewerExt.WeaveCustomEditorProvider({ extensionPath: EXT_DIR }, { watcherDebounceMs: -5 }), /CRITICAL: options\.watcherDebounceMs/);
  assert.throws(() => viewerExt.activate(null), /CRITICAL: activate requires a valid VS Code ExtensionContext/);
  assert.throws(() => viewerExt.resolvePanelAssetsRoot(''), /CRITICAL: extensionPath must be a non-empty string/);
  assert.throws(() => viewerExt.resolvePanelAssetsRoot(os.tmpdir()), /CRITICAL: Could not locate sidecars\/panel assets/);

  const mockHost = createMockVscode(null);
  const provider = new viewerExt.WeaveCustomEditorProvider({ extensionPath: EXT_DIR }, { vscodeApi: mockHost.vscodeApi });
  await assert.rejects(() => provider.resolveCustomTextEditor(null, {}), /CRITICAL: resolveCustomTextEditor requires a valid TextDocument/);
  await assert.rejects(
    () => provider.resolveCustomTextEditor({ uri: { fsPath: path.join(REPO_ROOT, 'weave.md') } }, {}),
    /CRITICAL: resolveCustomTextEditor requires a valid WebviewPanel/
  );

  // Script-breakout escaping guard
  const escaped = viewerExt.serializeForInlineScript({ text: '</script><script>alert(1)</script>' });
  assert.doesNotMatch(escaped, /<\/script>/i);
  assert.match(escaped, /\\u003c\/script\\u003e/);
});

test('VSIX Packager (#23) - builds standalone weavemx-viewer.vsix and runs self-contained outside repo root', async () => {
  const tmpOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weavemx-vsix-test-'));
  const vsixPath = path.join(tmpOutDir, 'weavemx-viewer.vsix');
  const extractedDir = path.join(tmpOutDir, 'unpacked');
  const sampleWs = path.join(tmpOutDir, 'sample-ws');

  try {
    const built = buildVsixPackage({ repoRoot: REPO_ROOT, outputPath: vsixPath });
    assert.equal(fs.existsSync(vsixPath), true);
    assert.ok(built.bytes > 1000);

    const zipBuf = fs.readFileSync(vsixPath);
    const entries = readZipEntries(zipBuf);
    assert.equal(entries.has('[Content_Types].xml'), true);
    assert.equal(entries.has('extension.vsixmanifest'), true);
    assert.equal(entries.has('extension/package.json'), true);
    assert.equal(entries.has('extension/extension.js'), true);
    assert.equal(entries.has('extension/sidecars/panel/lib/pipeline.mjs'), true);
    assert.equal(entries.has('extension/src/path_resolver.mjs'), true);
    // Must not bundle sidecar_sdk server entrypoint
    assert.equal(entries.has('extension/sidecars/panel/main.mjs'), false);

    const manifestXml = entries.get('extension.vsixmanifest').toString('utf8');
    assert.match(manifestXml, /Id="weavemx-viewer"/);
    assert.match(manifestXml, /Publisher="axiomfab"/);

    // Extract extension/ into an isolated temp folder outside the repo to prove zero external repo coupling
    for (const [entryName, data] of entries.entries()) {
      if (!entryName.startsWith('extension/')) continue;
      const rel = entryName.slice('extension/'.length);
      const dest = path.join(extractedDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, data);
    }

    fs.mkdirSync(path.join(sampleWs, 'runs', 'standalone_run', 'agents', 'writer'), { recursive: true });
    const weaveFile = path.join(sampleWs, 'runs', 'standalone_run', 'weave.md');
    fs.writeFileSync(weaveFile, '---\ntype: "orchestrator"\nstatus: "completed"\n---\n', 'utf8');
    fs.writeFileSync(
      path.join(sampleWs, 'runs', 'standalone_run', 'agents', 'writer', 'weave.md'),
      '---\ntype: "agent"\nstatus: "completed"\n---\n',
      'utf8'
    );

    const unpackedExt = require(path.join(extractedDir, 'extension.js'));
    assert.equal(
      path.resolve(unpackedExt.resolvePanelAssetsRoot(extractedDir)),
      path.resolve(path.join(extractedDir, 'sidecars', 'panel'))
    );

    const mockHost = createMockVscode(sampleWs);
    const provider = new unpackedExt.WeaveCustomEditorProvider(
      { extensionPath: extractedDir },
      { vscodeApi: mockHost.vscodeApi, watcherDebounceMs: 0 }
    );
    const mockPanel = createMockWebviewPanel();
    await provider.resolveCustomTextEditor({ uri: mockHost.vscodeApi.Uri.file(weaveFile) }, mockPanel.panel);
    await mockPanel.sendFromWebview({ type: 'ready' });
    assert.equal(mockPanel.postedMessages.length, 1);
    assert.equal(mockPanel.postedMessages[0].payload.stageAgents.length, 1);

    // Packager failure/guard paths
    assert.throws(() => crc32('not-a-buffer'), /CRITICAL: crc32 requires a Buffer/);
    assert.throws(() => createZipArchive([]), /CRITICAL: createZipArchive requires a non-empty array/);
    assert.throws(() => createZipArchive([{ path: '../escape.txt', data: 'x' }]), /CRITICAL: Invalid ZIP entry path/);
    assert.throws(
      () => createZipArchive([{ path: 'a.txt', data: '1' }, { path: 'a.txt', data: '2' }]),
      /CRITICAL: Duplicate ZIP entry path/
    );
    assert.throws(() => readZipEntries(Buffer.from('not a zip')), /CRITICAL: readZipEntries requires a valid ZIP Buffer/);
    const validSmallZip = createZipArchive([{ path: 'hello.txt', data: 'hello world' }]);
    const corruptedZip = Buffer.from(validSmallZip);
    const cdOffset = corruptedZip.readUInt32LE(corruptedZip.length - 22 + 16);
    corruptedZip[cdOffset + 16] ^= 0xff; // corrupt central directory CRC-32 field
    assert.throws(() => readZipEntries(corruptedZip), /CRITICAL: CRC-32 mismatch/);
    assert.throws(() => buildVsixPackage({ repoRoot: tmpOutDir }), /CRITICAL: Extension manifest not found/);
  } finally {
    fs.rmSync(tmpOutDir, { recursive: true, force: true });
  }
});
