const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const VIEW_TYPE = 'weavemx.viewer';
const CMD_VIEW_RAW_MARKDOWN = 'weavemx.viewRawMarkdown';
const CMD_OPEN_VIEWER = 'weavemx.openViewer';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks whether a value is a non-null plain object.
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Lazily resolves the VS Code Extension Host API so Node.js unit tests can import
 * and exercise `WeaveCustomEditorProvider` without an active Extension Host process.
 * @returns {typeof import('vscode')}
 */
function getHostVscode() {
  return require('vscode');
}

/**
 * Resolves the `sidecars/panel` directory from either a packaged `.vsix` layout
 * (`<extensionPath>/sidecars/panel`) or the monorepo layout (`<extensionPath>/../../sidecars/panel`).
 * @param {string} extensionPath
 * @returns {string}
 */
function resolvePanelAssetsRoot(extensionPath) {
  if (typeof extensionPath !== 'string' || !extensionPath.trim()) {
    throw new TypeError('CRITICAL: extensionPath must be a non-empty string');
  }
  const bundledRoot = path.join(extensionPath, 'sidecars', 'panel');
  if (fs.existsSync(path.join(bundledRoot, 'lib', 'pipeline.mjs'))) {
    return bundledRoot;
  }
  const monorepoRoot = path.resolve(extensionPath, '..', '..', 'sidecars', 'panel');
  if (fs.existsSync(path.join(monorepoRoot, 'lib', 'pipeline.mjs'))) {
    return monorepoRoot;
  }
  throw new Error(
    `CRITICAL: Could not locate sidecars/panel assets at '${bundledRoot}' or '${monorepoRoot}'`
  );
}

/**
 * Dynamically imports the ESM core WeaveMX panel modules directly in the Extension Host.
 * @param {string} extensionPath
 * @returns {Promise<{
 *   panelRoot: string,
 *   evaluatePipelineStages: Function,
 *   getAllShowDirs: Function,
 *   getActiveShowDir: Function,
 *   resolveEffectiveWorkspace: Function,
 *   detectWorktreeInfo: Function,
 *   readAllStagesAgents: Function,
 *   isPathWithinRoot: Function,
 *   resolveSafeMediaPath: Function,
 *   inferLookupRoots: Function
 * }>}
 */
async function loadPanelCoreModules(extensionPath) {
  const panelRoot = resolvePanelAssetsRoot(extensionPath);
  const srcRoot = path.resolve(panelRoot, '..', '..', 'src');

  const [pipelineMod, statusToolMod, inputVerifierMod, pathResolverMod] = await Promise.all([
    import(pathToFileURL(path.join(panelRoot, 'lib', 'pipeline.mjs')).href),
    import(pathToFileURL(path.join(panelRoot, 'lib', 'status_tool.mjs')).href),
    import(pathToFileURL(path.join(panelRoot, 'lib', 'input_verifier.mjs')).href),
    import(pathToFileURL(path.join(srcRoot, 'path_resolver.mjs')).href)
  ]);

  return {
    panelRoot,
    evaluatePipelineStages: pipelineMod.evaluatePipelineStages,
    getAllShowDirs: pipelineMod.getAllShowDirs,
    getActiveShowDir: pipelineMod.getActiveShowDir,
    resolveEffectiveWorkspace: pipelineMod.resolveEffectiveWorkspace,
    detectWorktreeInfo: pipelineMod.detectWorktreeInfo,
    readAllStagesAgents: statusToolMod.readAllStagesAgents,
    isPathWithinRoot: inputVerifierMod.isPathWithinRoot,
    resolveSafeMediaPath: inputVerifierMod.resolveSafeMediaPath,
    inferLookupRoots: pathResolverMod.inferLookupRoots
  };
}

/**
 * Infers the active run `contextDir`, canonical `workspaceRoot`, and optional stage/card focus
 * from an opened `weave.md` path (master run, stage directory, worker sandbox, or worktree).
 * @param {string} documentFsPath
 * @param {string | null | undefined} vscodeWorkspaceRoot
 * @param {(dir: string) => { agentDir: string, contextDir: string | null, workspaceRoot: string | null }} inferLookupRootsFn
 * @returns {{
 *   contextDir: string,
 *   workspaceRoot: string,
 *   focusStageNum: number | null,
 *   focusCardId: string | null
 * }}
 */
function inferContextAndWorkspace(documentFsPath, vscodeWorkspaceRoot, inferLookupRootsFn) {
  if (typeof documentFsPath !== 'string' || !documentFsPath.trim()) {
    throw new TypeError('CRITICAL: documentFsPath must be a non-empty string');
  }
  if (typeof inferLookupRootsFn !== 'function') {
    throw new TypeError('CRITICAL: inferLookupRootsFn must be a function');
  }

  const absDocPath = path.resolve(documentFsPath);
  const docDir = path.dirname(absDocPath);
  const { contextDir: inferredContextDir, workspaceRoot: inferredWsRoot } = inferLookupRootsFn(docDir);

  let contextDir = inferredContextDir || docDir;
  let workspaceRoot = inferredWsRoot || (vscodeWorkspaceRoot ? path.resolve(vscodeWorkspaceRoot) : path.dirname(docDir));

  // Promote `.solony/worktrees/<wt>` root to canonical parent workspace so getAllShowDirs lists both main and worktree runs
  if (inferredWsRoot) {
    const normalizedWs = inferredWsRoot.replace(/\\/g, '/');
    const wtMatch = normalizedWs.match(/^(.+)\/\.solony\/worktrees\/[^/]+$/);
    if (wtMatch && wtMatch[1]) {
      workspaceRoot = path.resolve(wtMatch[1]);
    } else if (vscodeWorkspaceRoot) {
      const resolvedVsWs = path.resolve(vscodeWorkspaceRoot);
      const normVs = process.platform === 'win32' ? resolvedVsWs.toLowerCase() : resolvedVsWs;
      const normInf = process.platform === 'win32' ? path.resolve(inferredWsRoot).toLowerCase() : path.resolve(inferredWsRoot);
      if (normInf === normVs || normInf.startsWith(normVs + path.sep)) {
        workspaceRoot = resolvedVsWs;
      }
    }
  }

  let focusStageNum = null;
  let focusCardId = null;

  const relFromContext = path.relative(contextDir, docDir).replace(/\\/g, '/');
  if (relFromContext && !relFromContext.startsWith('..')) {
    const parts = relFromContext.split('/').filter(Boolean);
    if (parts.length > 0) {
      const stageMatch = parts[0].match(/^stage[_-]?0*(\d+)(?:[_-]|$)/i);
      if (stageMatch) {
        focusStageNum = parseInt(stageMatch[1], 10);
        if (parts[1] === 'agents' && parts.length >= 3) {
          const agentSlug = parts.slice(2).join('_');
          focusCardId = `card_s${focusStageNum}_${agentSlug}`;
        }
      } else if (parts[0] === 'agents' && parts.length >= 2) {
        const agentSlug = parts.slice(1).join('_');
        focusCardId = `card_${agentSlug}`;
      }
    }
  }

  return {
    contextDir: contextDir.replace(/\\/g, '/'),
    workspaceRoot: path.resolve(workspaceRoot),
    focusStageNum,
    focusCardId
  };
}

/**
 * Enriches agent deliverable media items with Webview resource URIs validated via `resolveSafeMediaPath`.
 * @param {Array<Record<string, unknown>>} stageAgents
 * @param {{
 *   workspaceRoot: string,
 *   effectiveWs: string,
 *   contextDir: string,
 *   resolveSafeMediaPath: Function,
 *   toWebviewMediaUri?: ((absPath: string) => string) | null
 * }} opts
 */
function attachWebviewMediaUris(stageAgents, opts) {
  const { workspaceRoot, effectiveWs, contextDir, resolveSafeMediaPath, toWebviewMediaUri } = opts;
  if (!Array.isArray(stageAgents) || typeof toWebviewMediaUri !== 'function') return;

  function visitNode(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.outputItems)) {
      for (const item of node.outputItems) {
        if (!item || !item.exists || !item.mediaType || !item.filePath) continue;
        let safePath = null;
        for (const rootCandidate of [effectiveWs, workspaceRoot]) {
          if (!rootCandidate) continue;
          try {
            safePath = resolveSafeMediaPath(item.filePath, rootCandidate, contextDir);
            if (safePath) break;
          } catch {
            safePath = null;
          }
        }
        if (safePath) {
          item.webviewUri = toWebviewMediaUri(safePath);
        }
      }
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(visitNode);
    }
  }

  for (const stageEntry of stageAgents) {
    if (stageEntry && Array.isArray(stageEntry.nodes)) {
      stageEntry.nodes.forEach(visitNode);
    }
  }
}

/**
 * Computes the complete WeaveMX UI payload directly in the Extension Host using `sidecars/panel/lib/*`.
 * @param {Awaited<ReturnType<typeof loadPanelCoreModules>>} mods
 * @param {{
 *   workspaceRoot: string,
 *   contextDir?: string | null,
 *   focusStageNum?: number | null,
 *   focusCardId?: string | null,
 *   toWebviewMediaUri?: ((absPath: string) => string) | null
 * }} params
 * @returns {Record<string, unknown>}
 */
function buildPipelinePayload(mods, params) {
  if (!isPlainObject(mods)) {
    throw new TypeError('CRITICAL: buildPipelinePayload requires loaded panel modules');
  }
  if (!isPlainObject(params) || typeof params.workspaceRoot !== 'string' || !params.workspaceRoot.trim()) {
    throw new TypeError('CRITICAL: buildPipelinePayload requires a non-empty workspaceRoot');
  }

  const workspaceRoot = path.resolve(params.workspaceRoot);
  const availableShows = fs.existsSync(workspaceRoot) ? mods.getAllShowDirs(workspaceRoot) : [];

  let activeContextDir = null;
  if (typeof params.contextDir === 'string' && params.contextDir.trim()) {
    const candidate = path.resolve(params.contextDir);
    if (fs.existsSync(candidate)) {
      activeContextDir = candidate.replace(/\\/g, '/');
    }
  }
  if (!activeContextDir && availableShows.length > 0) {
    activeContextDir = availableShows[0].path;
  }

  if (!activeContextDir || !fs.existsSync(activeContextDir)) {
    return {
      error: 'No pipeline directories found under runs/ (or output/)',
      showTitle: 'WeaveMX Pipeline',
      contextTitle: 'WeaveMX Pipeline',
      availableShows: [],
      availableContexts: [],
      activeStageNum: 1,
      stages: {},
      stageList: [],
      stageAgents: []
    };
  }

  const normActive = activeContextDir.replace(/\\/g, '/').toLowerCase();
  const hasEntry = availableShows.some((s) => (s.path || '').replace(/\\/g, '/').toLowerCase() === normActive);
  if (!hasEntry) {
    const base = path.basename(activeContextDir);
    let mtime = 0;
    try {
      mtime = fs.statSync(activeContextDir).mtimeMs;
    } catch {
      mtime = 0;
    }
    const wtInfo = mods.detectWorktreeInfo(path.dirname(activeContextDir), null);
    availableShows.unshift({
      id: base,
      name: base,
      path: activeContextDir,
      title: base,
      displayPath: base,
      mtime,
      isWorktree: wtInfo.isWorktree,
      worktree: wtInfo.worktreeName
    });
  }

  const effectiveWs = mods.resolveEffectiveWorkspace(workspaceRoot, activeContextDir);
  const result = mods.evaluatePipelineStages(activeContextDir);
  const stageAgents = mods.readAllStagesAgents(activeContextDir, effectiveWs);

  attachWebviewMediaUris(stageAgents, {
    workspaceRoot,
    effectiveWs,
    contextDir: activeContextDir,
    resolveSafeMediaPath: mods.resolveSafeMediaPath,
    toWebviewMediaUri: params.toWebviewMediaUri || null
  });

  return {
    ...result,
    selectedContextDir: activeContextDir,
    focusStageNum: typeof params.focusStageNum === 'number' ? params.focusStageNum : null,
    focusCardId: typeof params.focusCardId === 'string' ? params.focusCardId : null,
    stageAgents,
    availableShows,
    availableContexts: availableShows
  };
}

/**
 * Generates a cryptographic nonce for Webview Content-Security-Policy script authorization.
 * @returns {string}
 */
function createNonce() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Safely serializes JSON for inline `<script>` embedding without `</script>` breakout.
 * @param {unknown} data
 * @returns {string}
 */
function serializeForInlineScript(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * Builds the strict CSP-protected Webview HTML reusing `sidecars/panel/styles.css`, `trackers/*`, and `app.js`.
 * @param {{
 *   webview: import('vscode').Webview,
 *   vscodeApi: typeof import('vscode'),
 *   extensionPath: string,
 *   panelRoot: string,
 *   initialPayload: Record<string, unknown>,
 *   initialContextDir: string | null,
 *   initialTheme?: 'light' | 'dark',
 *   nonce?: string
 * }} opts
 * @returns {string}
 */
function renderWebviewHtml(opts) {
  if (!isPlainObject(opts) || !opts.webview || typeof opts.webview.asWebviewUri !== 'function') {
    throw new TypeError('CRITICAL: renderWebviewHtml requires a valid webview with asWebviewUri');
  }
  const { webview, vscodeApi, extensionPath, panelRoot, initialPayload, initialContextDir } = opts;
  const initialTheme = opts.initialTheme === 'light' ? 'light' : 'dark';
  const nonce = (typeof opts.nonce === 'string' && opts.nonce.trim()) ? opts.nonce.trim() : createNonce();
  const cspSource = webview.cspSource || 'vscode-webview-resource:';

  const toUri = (absFilePath) => webview.asWebviewUri(vscodeApi.Uri.file(absFilePath)).toString();

  const tailwindCssUri = toUri(path.join(extensionPath, 'webview_tailwind.css'));
  const panelStylesUri = toUri(path.join(panelRoot, 'styles.css'));
  const bridgeJsUri = toUri(path.join(extensionPath, 'webview_bridge.js'));
  const headerBarJsUri = toUri(path.join(panelRoot, 'trackers', 'header_bar.js'));
  const runtimeTrackerJsUri = toUri(path.join(panelRoot, 'trackers', 'runtime_tracker.js'));
  const agentPanelJsUri = toUri(path.join(panelRoot, 'trackers', 'agent_panel.js'));
  const stagePanelJsUri = toUri(path.join(panelRoot, 'trackers', 'stage_panel.js'));
  const appJsUri = toUri(path.join(panelRoot, 'app.js'));

  const bootJson = serializeForInlineScript({
    initialPayload,
    initialContextDir,
    initialTheme
  });

  return `<!DOCTYPE html>
<html lang="en" data-theme="${initialTheme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data: blob:; media-src ${cspSource} data: blob:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>WeaveMX</title>
  <link rel="stylesheet" href="${tailwindCssUri}">
  <link rel="stylesheet" href="${panelStylesUri}">
</head>
<body class="min-h-screen select-none">
  <header id="header-root"></header>

  <div class="max-w-4xl mx-auto p-3 space-y-4">
    <div id="error-banner-root" style="display: none;"></div>

    <section id="stepper-root" class="weave-stepper-scroll custom-scrollbar py-2.5 px-1 overflow-x-auto">
      <div id="stepper-track" class="weave-stepper-track relative my-2">
        <div id="stepper-line" class="stepper-line" style="display: none;"></div>
        <div id="stages-stepper-row" class="relative z-10 flex justify-between items-start"></div>
      </div>
    </section>

    <main id="agents-root"></main>
  </div>

  <script nonce="${nonce}">window.__WEAVEMX_BOOT__ = ${bootJson};</script>
  <script nonce="${nonce}" src="${bridgeJsUri}"></script>
  <script nonce="${nonce}" src="${headerBarJsUri}"></script>
  <script nonce="${nonce}" src="${runtimeTrackerJsUri}"></script>
  <script nonce="${nonce}" src="${agentPanelJsUri}"></script>
  <script nonce="${nonce}" src="${stagePanelJsUri}"></script>
  <script nonce="${nonce}" src="${appJsUri}"></script>
</body>
</html>`;
}

/**
 * Custom text editor provider for `weave.md` manifests, rendering the WeaveMX UI natively
 * in VS Code, Antigravity IDE, Cursor, and Windsurf with live `FileSystemWatcher` push updates.
 */
class WeaveCustomEditorProvider {
  /**
   * @param {{ extensionPath: string }} context
   * @param {{
   *   vscodeApi?: typeof import('vscode'),
   *   moduleLoader?: typeof loadPanelCoreModules,
   *   watcherDebounceMs?: number
   * }} [options={}]
   */
  constructor(context, options = {}) {
    if (!isPlainObject(context) || typeof context.extensionPath !== 'string' || !context.extensionPath.trim()) {
      throw new TypeError('CRITICAL: WeaveCustomEditorProvider requires a context with a non-empty extensionPath');
    }
    if (!isPlainObject(options)) {
      throw new TypeError('CRITICAL: WeaveCustomEditorProvider options must be a plain object');
    }
    for (const key of Object.keys(options)) {
      if (key !== 'vscodeApi' && key !== 'moduleLoader' && key !== 'watcherDebounceMs') {
        throw new TypeError(`CRITICAL: Unknown option '${key}' in WeaveCustomEditorProvider`);
      }
    }
    if (options.vscodeApi !== undefined && !isPlainObject(options.vscodeApi)) {
      throw new TypeError('CRITICAL: options.vscodeApi must be an object when provided');
    }
    if (options.moduleLoader !== undefined && typeof options.moduleLoader !== 'function') {
      throw new TypeError('CRITICAL: options.moduleLoader must be a function when provided');
    }
    if (
      options.watcherDebounceMs !== undefined &&
      (typeof options.watcherDebounceMs !== 'number' || !Number.isFinite(options.watcherDebounceMs) || options.watcherDebounceMs < 0)
    ) {
      throw new TypeError('CRITICAL: options.watcherDebounceMs must be a non-negative finite number');
    }

    this.context = context;
    this.vscode = options.vscodeApi ?? getHostVscode();
    this.moduleLoader = options.moduleLoader ?? loadPanelCoreModules;
    this.watcherDebounceMs = options.watcherDebounceMs ?? 50;
    this._modsPromise = null;
    this._activeTargetUri = null;
  }

  /**
   * Lazily loads and caches the ESM panel core modules.
   * @returns {Promise<Awaited<ReturnType<typeof loadPanelCoreModules>>>}
   */
  _getModules() {
    if (!this._modsPromise) {
      this._modsPromise = this.moduleLoader(this.context.extensionPath);
    }
    return this._modsPromise;
  }

  /**
   * Returns the most recently active `weave.md` URI across open WeaveMX Custom Editor panels.
   * @returns {import('vscode').Uri | null}
   */
  getActiveTargetUri() {
    return this._activeTargetUri;
  }

  /**
   * Resolves a custom editor session for an opened `weave.md` document.
   * @param {import('vscode').TextDocument} document
   * @param {import('vscode').WebviewPanel} webviewPanel
   * @returns {Promise<void>}
   */
  async resolveCustomTextEditor(document, webviewPanel) {
    if (!document || !document.uri || typeof document.uri.fsPath !== 'string' || !document.uri.fsPath.trim()) {
      throw new TypeError('CRITICAL: resolveCustomTextEditor requires a valid TextDocument with uri.fsPath');
    }
    if (
      !webviewPanel ||
      !webviewPanel.webview ||
      typeof webviewPanel.webview.postMessage !== 'function' ||
      typeof webviewPanel.webview.onDidReceiveMessage !== 'function'
    ) {
      throw new TypeError('CRITICAL: resolveCustomTextEditor requires a valid WebviewPanel');
    }

    const vscode = this.vscode;
    const mods = await this._getModules();

    const wsFolder = (vscode.workspace && typeof vscode.workspace.getWorkspaceFolder === 'function')
      ? vscode.workspace.getWorkspaceFolder(document.uri)
      : null;
    const vscodeWsRoot = wsFolder?.uri?.fsPath || vscode.workspace?.workspaceFolders?.[0]?.uri?.fsPath || null;

    const inferred = inferContextAndWorkspace(document.uri.fsPath, vscodeWsRoot, mods.inferLookupRoots);
    const workspaceRoot = inferred.workspaceRoot;
    let currentContextDir = inferred.contextDir;
    const initialFocusStageNum = inferred.focusStageNum;
    const initialFocusCardId = inferred.focusCardId;

    const localRoots = [
      vscode.Uri.file(this.context.extensionPath),
      vscode.Uri.file(mods.panelRoot),
      vscode.Uri.file(workspaceRoot)
    ];
    const effectiveInitialWs = mods.resolveEffectiveWorkspace(workspaceRoot, currentContextDir);
    if (effectiveInitialWs && path.resolve(effectiveInitialWs) !== path.resolve(workspaceRoot)) {
      localRoots.push(vscode.Uri.file(effectiveInitialWs));
    }

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: localRoots
    };

    this._activeTargetUri = document.uri;

    const toWebviewMediaUri = (absFilePath) =>
      webviewPanel.webview.asWebviewUri(vscode.Uri.file(absFilePath)).toString();

    const computePayload = (includeInitialFocus = false) =>
      buildPipelinePayload(mods, {
        workspaceRoot,
        contextDir: currentContextDir,
        focusStageNum: includeInitialFocus ? initialFocusStageNum : null,
        focusCardId: includeInitialFocus ? initialFocusCardId : null,
        toWebviewMediaUri
      });

    const resolveTargetWeaveUri = (requestedContextDir) => {
      if (typeof requestedContextDir === 'string' && requestedContextDir.trim()) {
        const candidateDir = path.resolve(requestedContextDir.trim());
        const isAllowed =
          mods.isPathWithinRoot(candidateDir, workspaceRoot, true) ||
          (effectiveInitialWs && mods.isPathWithinRoot(candidateDir, effectiveInitialWs, true));
        if (isAllowed) {
          const weaveCandidate = path.join(candidateDir, 'weave.md');
          if (fs.existsSync(weaveCandidate)) {
            return vscode.Uri.file(weaveCandidate);
          }
        }
      }
      return document.uri;
    };

    const colorKind = vscode.window?.activeColorTheme?.kind;
    const lightKind = vscode.ColorThemeKind?.Light ?? 1;
    const highContrastLightKind = vscode.ColorThemeKind?.HighContrastLight ?? 4;
    const initialTheme = (colorKind === lightKind || colorKind === highContrastLightKind) ? 'light' : 'dark';

    const initialPayload = computePayload(true);
    webviewPanel.webview.html = renderWebviewHtml({
      webview: webviewPanel.webview,
      vscodeApi: vscode,
      extensionPath: this.context.extensionPath,
      panelRoot: mods.panelRoot,
      initialPayload,
      initialContextDir: currentContextDir,
      initialTheme
    });

    let disposed = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let debounceTimer = null;

    const pushUpdateNow = async (includeInitialFocus = false) => {
      if (disposed) return;
      try {
        const payload = computePayload(includeInitialFocus);
        await webviewPanel.webview.postMessage({ type: 'pipelineUpdate', payload });
      } catch (err) {
        console.error('[weavemx-viewer] failed pushing pipeline update:', err);
      }
    };

    const schedulePushUpdate = () => {
      if (disposed) return;
      if (this.watcherDebounceMs === 0) {
        void pushUpdateNow(false);
        return;
      }
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void pushUpdateNow(false);
      }, this.watcherDebounceMs);
    };

    const msgSub = webviewPanel.webview.onDidReceiveMessage(async (msg) => {
      if (disposed || !isPlainObject(msg) || typeof msg.type !== 'string') return;

      if (msg.type === 'ready' || msg.type === 'requestPipeline') {
        if (typeof msg.contextDir === 'string' && msg.contextDir.trim()) {
          const candidate = path.resolve(msg.contextDir.trim());
          if (mods.isPathWithinRoot(candidate, workspaceRoot, true) && fs.existsSync(candidate)) {
            currentContextDir = candidate.replace(/\\/g, '/');
            this._activeTargetUri = resolveTargetWeaveUri(currentContextDir);
          }
        }
        await pushUpdateNow(msg.type === 'ready');
        return;
      }

      if (msg.type === 'selectContext') {
        if (typeof msg.contextDir !== 'string' || !msg.contextDir.trim()) return;
        const candidate = path.resolve(msg.contextDir.trim());
        const allowed =
          mods.isPathWithinRoot(candidate, workspaceRoot, false) ||
          (effectiveInitialWs && mods.isPathWithinRoot(candidate, effectiveInitialWs, false));
        if (!allowed || !fs.existsSync(candidate)) {
          return;
        }
        currentContextDir = candidate.replace(/\\/g, '/');
        this._activeTargetUri = resolveTargetWeaveUri(currentContextDir);
        await pushUpdateNow(false);
        return;
      }

      if (msg.type === 'viewRawMarkdown') {
        const targetUri = resolveTargetWeaveUri(
          typeof msg.contextDir === 'string' && msg.contextDir.trim() ? msg.contextDir : currentContextDir
        );
        await vscode.commands.executeCommand('vscode.openWith', targetUri, 'default');
        return;
      }

      if (msg.type === 'openConversation') {
        if (typeof msg.conversationId === 'string' && UUID_REGEX.test(msg.conversationId.trim())) {
          if (vscode.env && typeof vscode.env.openExternal === 'function' && typeof vscode.Uri?.parse === 'function') {
            await vscode.env.openExternal(vscode.Uri.parse(`conversation://${msg.conversationId.trim()}`));
          }
        }
      }
    });

    const disposables = [msgSub];

    if (typeof webviewPanel.onDidChangeViewState === 'function') {
      const viewStateSub = webviewPanel.onDidChangeViewState(() => {
        if (!disposed && webviewPanel.active) {
          this._activeTargetUri = resolveTargetWeaveUri(currentContextDir);
        }
      });
      if (viewStateSub && typeof viewStateSub.dispose === 'function') {
        disposables.push(viewStateSub);
      }
    }

    if (vscode.workspace && typeof vscode.workspace.createFileSystemWatcher === 'function') {
      const pattern = typeof vscode.RelativePattern === 'function'
        ? new vscode.RelativePattern(workspaceRoot, '**/weave.md')
        : '**/weave.md';
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      if (typeof watcher.onDidCreate === 'function') disposables.push(watcher.onDidCreate(schedulePushUpdate));
      if (typeof watcher.onDidChange === 'function') disposables.push(watcher.onDidChange(schedulePushUpdate));
      if (typeof watcher.onDidDelete === 'function') disposables.push(watcher.onDidDelete(schedulePushUpdate));
      disposables.push(watcher);
    }

    if (vscode.workspace && typeof vscode.workspace.onDidChangeTextDocument === 'function') {
      const docSub = vscode.workspace.onDidChangeTextDocument((e) => {
        if (disposed || !e || !e.document || !e.document.uri) return;
        const changedPath = e.document.uri.fsPath || '';
        if (path.basename(changedPath).toLowerCase() === 'weave.md') {
          schedulePushUpdate();
        }
      });
      if (docSub && typeof docSub.dispose === 'function') {
        disposables.push(docSub);
      }
    }

    webviewPanel.onDidDispose(() => {
      disposed = true;
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      for (const d of disposables) {
        if (d && typeof d.dispose === 'function') {
          d.dispose();
        }
      }
    });
  }
}

/**
 * Activates the WeaveMX Viewer extension, registering `weavemx.viewer` for `weave.md` files
 * and the two-way `"View Raw Markdown"` / `"Open WeaveMX"` editor title commands.
 * @param {import('vscode').ExtensionContext} context
 * @param {typeof import('vscode')} [vscodeOverride]
 * @returns {WeaveCustomEditorProvider}
 */
function activate(context, vscodeOverride) {
  if (!isPlainObject(context) || !Array.isArray(context.subscriptions)) {
    throw new TypeError('CRITICAL: activate requires a valid VS Code ExtensionContext');
  }
  const vscode = vscodeOverride ?? getHostVscode();
  const provider = new WeaveCustomEditorProvider(context, { vscodeApi: vscode });

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(CMD_VIEW_RAW_MARKDOWN, async (uri) => {
      const target = uri || provider.getActiveTargetUri() || vscode.window.activeTextEditor?.document?.uri;
      if (target) {
        await vscode.commands.executeCommand('vscode.openWith', target, 'default');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(CMD_OPEN_VIEWER, async (uri) => {
      const target = uri || vscode.window.activeTextEditor?.document?.uri || provider.getActiveTargetUri();
      if (target) {
        await vscode.commands.executeCommand('vscode.openWith', target, VIEW_TYPE);
      }
    })
  );

  return provider;
}

/**
 * Deactivates the WeaveMX Viewer extension.
 * @returns {void}
 */
function deactivate() {}

module.exports = {
  VIEW_TYPE,
  CMD_VIEW_RAW_MARKDOWN,
  CMD_OPEN_VIEWER,
  activate,
  deactivate,
  resolvePanelAssetsRoot,
  loadPanelCoreModules,
  inferContextAndWorkspace,
  buildPipelinePayload,
  renderWebviewHtml,
  serializeForInlineScript,
  WeaveCustomEditorProvider
};
