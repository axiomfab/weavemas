import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const headerBarPath = path.resolve(__dirname, '..', 'sidecars', 'panel', 'trackers', 'header_bar.js');
const code = fs.readFileSync(headerBarPath, 'utf-8');

function createMockContainer() {
  const listeners = {};
  const elements = {};

  const container = {
    innerHTML: '',
    querySelector(selector) {
      if (selector === 'header') {
        return container.innerHTML.includes('<header') ? elements['header'] : null;
      }
      if (selector === '#show-select') {
        return elements['#show-select'];
      }
      if (selector === '#sync-btn') {
        return elements['#sync-btn'];
      }
      if (selector === '#theme-toggle-btn') {
        return elements['#theme-toggle-btn'];
      }
      if (selector === '#worktree-badge-root') {
        return elements['#worktree-badge-root'];
      }
      return null;
    }
  };

  const showSelect = {
    value: '',
    innerHTML: '',
    addEventListener(event, fn) {
      listeners[`select_${event}`] = fn;
    },
    dispatch(event, val) {
      this.value = val;
      if (listeners[`select_${event}`]) {
        listeners[`select_${event}`]({ target: { value: val } });
      }
    }
  };

  const syncBtn = {
    addEventListener(event, fn) {
      listeners[`sync_${event}`] = fn;
    },
    dispatch(event) {
      if (listeners[`sync_${event}`]) {
        listeners[`sync_${event}`]({});
      }
    }
  };

  const themeBtn = {
    innerHTML: '',
    title: '',
    attrs: {},
    setAttribute(name, val) {
      this.attrs[name] = String(val);
    },
    getAttribute(name) {
      return this.attrs[name] ?? null;
    },
    addEventListener(event, fn) {
      listeners[`theme_${event}`] = fn;
    },
    dispatch(event) {
      if (listeners[`theme_${event}`]) {
        listeners[`theme_${event}`]({});
      }
    }
  };

  const badgeRoot = {
    innerHTML: ''
  };

  elements['header'] = { tagName: 'HEADER' };
  elements['#show-select'] = showSelect;
  elements['#sync-btn'] = syncBtn;
  elements['#theme-toggle-btn'] = themeBtn;
  elements['#worktree-badge-root'] = badgeRoot;

  return { container, showSelect, syncBtn, themeBtn, badgeRoot };
}

function createMockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, val) {
      map.set(key, String(val));
    }
  };
}

function createMockRootEl(initialTheme = null) {
  const attrs = {};
  if (initialTheme !== null) {
    attrs['data-theme'] = initialTheme;
  }
  return {
    dataset: initialTheme !== null ? { theme: initialTheme } : {},
    style: {},
    setAttribute(name, val) {
      attrs[name] = String(val);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    }
  };
}

function loadHeaderBar() {
  const context = { window: {}, module: { exports: {} }, console };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.window.HeaderBar || context.module.exports;
}

test('HeaderBar Component Unit Tests', async (t) => {
  const HeaderBar = loadHeaderBar();
  assert.ok(HeaderBar, 'HeaderBar must be exported');

  await t.test('Happy Path 1: renders flat native agy header with selector, worktree slot, live dot, and sync button without card chrome', () => {
    const { container, showSelect } = createMockContainer();
    const shows = [
      { path: 'c:/output/show_01', displayPath: 'output\\show_01' },
      { path: 'c:/output/show_02', displayPath: 'output\\show_02' }
    ];

    HeaderBar.render(container, {
      shows,
      activePath: 'c:/output/show_01'
    });

    assert.match(container.innerHTML, /<header class="agy-header" data-weave-header="true">/);
    assert.match(container.innerHTML, /<span class="agy-select-wrap">/);
    assert.match(container.innerHTML, /<select id="show-select" class="agy-select"/);
    assert.match(container.innerHTML, /<span id="worktree-badge-root"><\/span>/);
    assert.match(container.innerHTML, /<span class="agy-live"/);
    assert.match(container.innerHTML, /<span class="pulsing-dot"/);
    assert.match(container.innerHTML, /<span class="agy-live-label">Live<\/span>/);
    assert.match(container.innerHTML, /<button id="sync-btn" type="button" class="agy-sync-btn"/);
    assert.match(showSelect.innerHTML, /value="c:\/output\/show_01" selected/);
    assert.match(showSelect.innerHTML, /output\\show_02/);

    // Ensure old floating card chrome, gradient icon, and duplicate heading are removed
    assert.doesNotMatch(container.innerHTML, /rounded-xl/);
    assert.doesNotMatch(container.innerHTML, /bg-\[#0f172a\]/);
    assert.doesNotMatch(container.innerHTML, /border-\[#1e293b\]/);
    assert.doesNotMatch(container.innerHTML, /bg-gradient-to-br/);
    assert.doesNotMatch(container.innerHTML, /<h1/);
  });

  await t.test('Happy Path 2: fires onSelectShow and onSync event callbacks', () => {
    const { container, showSelect, syncBtn } = createMockContainer();
    let selectedPath = null;
    let syncCalled = false;

    HeaderBar.render(container, {
      shows: [{ path: 'c:/output/show_01', displayPath: 'output\\show_01' }],
      activePath: 'c:/output/show_01',
      onSelectShow: (val) => { selectedPath = val; },
      onSync: () => { syncCalled = true; }
    });

    showSelect.dispatch('change', 'c:/output/show_new');
    assert.equal(selectedPath, 'c:/output/show_new');

    syncBtn.dispatch('click');
    assert.equal(syncCalled, true);
  });

  await t.test('Failure Path 1: throws TypeError on invalid or missing container', () => {
    assert.throws(() => {
      HeaderBar.render(null, { shows: [] });
    }, /CRITICAL: container element is required/);

    assert.throws(() => {
      HeaderBar.render(undefined, { shows: [] });
    }, /CRITICAL: container element is required/);

    assert.throws(() => {
      HeaderBar.render('not-an-object', { shows: [] });
    }, /CRITICAL: container element is required/);
  });

  await t.test('Failure Path 2: throws TypeError on invalid options object or malformed option properties', () => {
    const { container } = createMockContainer();
    assert.throws(() => {
      HeaderBar.render(container, null);
    }, /CRITICAL: options object is required/);

    assert.throws(() => {
      HeaderBar.render(container, []);
    }, /CRITICAL: options object is required/);

    assert.throws(() => {
      HeaderBar.render(container, { shows: 'not-an-array' });
    }, /CRITICAL: shows must be an array/);

    assert.throws(() => {
      HeaderBar.render(container, { contexts: 'not-an-array' });
    }, /CRITICAL: contexts must be an array/);

    assert.throws(() => {
      HeaderBar.render(container, { shows: [], activePath: 123 });
    }, /CRITICAL: activePath must be a string or null/);

    assert.throws(() => {
      HeaderBar.render(container, { shows: [], onSelectShow: 'bad' });
    }, /CRITICAL: onSelectShow must be a function/);

    assert.throws(() => {
      HeaderBar.render(container, { shows: [], onSelectContext: 99 });
    }, /CRITICAL: onSelectContext must be a function/);

    assert.throws(() => {
      HeaderBar.render(container, { shows: [], onSync: 42 });
    }, /CRITICAL: onSync must be a function/);
  });

  await t.test('Failure Path 3: handles empty shows array and undefined activePath with fallback option without throwing', () => {
    const { container, showSelect, badgeRoot } = createMockContainer();
    HeaderBar.render(container, { shows: [], activePath: undefined });
    assert.match(showSelect.innerHTML, /No shows in output\//);
    assert.equal(badgeRoot.innerHTML, '');
  });

  await t.test('Happy Path 3: renders <optgroup> sections and worktree badge when worktree runs exist and a worktree run is active', () => {
    const { container, showSelect, badgeRoot } = createMockContainer();
    const shows = [
      { path: 'c:/ws/runs/show_main', displayPath: 'runs\\show_main', isWorktree: false, worktree: null },
      { path: 'c:/ws/.solony/worktrees/feat-jazz/runs/show_wt', displayPath: 'runs\\show_wt', isWorktree: true, worktree: 'feat-jazz' }
    ];

    HeaderBar.render(container, {
      shows,
      activePath: 'c:/ws/.solony/worktrees/feat-jazz/runs/show_wt'
    });

    assert.match(showSelect.innerHTML, /<optgroup label="Main Workspace">/);
    assert.match(showSelect.innerHTML, /<optgroup label="Worktree: feat-jazz">/);
    assert.match(badgeRoot.innerHTML, /id="worktree-badge"/);
    assert.match(badgeRoot.innerHTML, /class="agy-worktree-badge"/);
    assert.match(badgeRoot.innerHTML, /viewBox="0 0 16 16"/);
    assert.match(badgeRoot.innerHTML, /feat-jazz/);
    assert.doesNotMatch(badgeRoot.innerHTML, /🌿/);

    // Switching activePath back to main workspace clears the badge
    HeaderBar.render(container, {
      shows,
      activePath: 'c:/ws/runs/show_main'
    });
    assert.equal(badgeRoot.innerHTML, '');
  });

  await t.test('Failure Path 4: buildWorktreeBadgeHtml returns empty string for null, undefined, primitive, or non-worktree items', () => {
    assert.equal(HeaderBar.buildWorktreeBadgeHtml(null), '');
    assert.equal(HeaderBar.buildWorktreeBadgeHtml(undefined), '');
    assert.equal(HeaderBar.buildWorktreeBadgeHtml('str'), '');
    assert.equal(HeaderBar.buildWorktreeBadgeHtml({ path: 'c:/runs/a', isWorktree: false, worktree: null }), '');
  });

  await t.test('Happy & Failure Paths: escapeHtml escapes special characters and handles null, undefined, empty, and numeric zero', () => {
    assert.equal(HeaderBar.escapeHtml('<script>"\'&'), '&lt;script&gt;&quot;&#039;&amp;');
    assert.equal(HeaderBar.escapeHtml(null), '');
    assert.equal(HeaderBar.escapeHtml(undefined), '');
    assert.equal(HeaderBar.escapeHtml(''), '');
    assert.equal(HeaderBar.escapeHtml(0), '0');
  });

  await t.test('Theme Toggle Happy Path 1: renders #theme-toggle-btn, restores persisted preference, toggles light/dark on click, and persists to storage', () => {
    const { container, themeBtn } = createMockContainer();
    const storage = createMockStorage({ [HeaderBar.THEME_STORAGE_KEY]: 'light' });
    const rootEl = createMockRootEl();
    const toggledThemes = [];

    HeaderBar.render(container, {
      shows: [{ path: 'c:/output/show_01', displayPath: 'output\\show_01' }],
      activePath: 'c:/output/show_01',
      storage,
      rootEl,
      onToggleTheme: (next) => toggledThemes.push(next)
    });

    assert.match(container.innerHTML, /<button id="theme-toggle-btn" type="button" class="agy-theme-btn"/);
    assert.match(container.innerHTML, /data-theme-state="light"/);
    assert.match(container.innerHTML, /data-theme-icon="moon"/);
    assert.equal(rootEl.getAttribute('data-theme'), 'light');
    assert.equal(rootEl.style.colorScheme, 'light');

    // Click 1: light -> dark
    themeBtn.dispatch('click');
    assert.equal(rootEl.getAttribute('data-theme'), 'dark');
    assert.equal(storage.getItem(HeaderBar.THEME_STORAGE_KEY), 'dark');
    assert.equal(themeBtn.getAttribute('data-theme-state'), 'dark');
    assert.equal(themeBtn.getAttribute('aria-pressed'), 'false');
    assert.match(themeBtn.innerHTML, /data-theme-icon="sun"/);

    // Click 2: dark -> light
    themeBtn.dispatch('click');
    assert.equal(rootEl.getAttribute('data-theme'), 'light');
    assert.equal(storage.getItem(HeaderBar.THEME_STORAGE_KEY), 'light');
    assert.equal(themeBtn.getAttribute('data-theme-state'), 'light');
    assert.equal(themeBtn.getAttribute('aria-pressed'), 'true');
    assert.match(themeBtn.innerHTML, /data-theme-icon="moon"/);
    assert.deepEqual(toggledThemes, ['dark', 'light']);
  });

  await t.test('Theme Toggle Happy Path 2: auto-initializes document.documentElement on script load from window.localStorage', () => {
    const rootEl = createMockRootEl();
    const storage = createMockStorage({ 'weavemx-ui-theme': 'light' });
    const browserCtx = {
      window: { localStorage: storage },
      document: { documentElement: rootEl },
      module: { exports: {} },
      console
    };
    vm.createContext(browserCtx);
    vm.runInContext(code, browserCtx);

    assert.equal(rootEl.getAttribute('data-theme'), 'light');
    assert.equal(rootEl.style.colorScheme, 'light');
  });

  await t.test('Theme Helpers: applyTheme happy path and 2+ failure paths', () => {
    const rootEl = createMockRootEl();
    assert.equal(HeaderBar.applyTheme('light', rootEl), 'light');
    assert.equal(rootEl.getAttribute('data-theme'), 'light');
    assert.equal(rootEl.dataset.theme, 'light');
    assert.equal(rootEl.style.colorScheme, 'light');
    assert.equal(HeaderBar.applyTheme('dark', null), 'dark');

    // Failure Path 1: invalid theme value
    assert.throws(() => HeaderBar.applyTheme('sepia', rootEl), /CRITICAL: theme must be 'light' or 'dark'/);
    assert.throws(() => HeaderBar.applyTheme('', rootEl), /CRITICAL: theme must be 'light' or 'dark'/);
    assert.throws(() => HeaderBar.applyTheme(null, rootEl), /CRITICAL: theme must be 'light' or 'dark'/);

    // Failure Path 2: non-object rootEl
    assert.throws(() => HeaderBar.applyTheme('light', 'html'), /CRITICAL: rootEl must be an object or null/);
    assert.throws(() => HeaderBar.applyTheme('dark', 42), /CRITICAL: rootEl must be an object or null/);
  });

  await t.test('Theme Helpers: getStoredTheme & setStoredTheme happy path and 2+ failure paths', () => {
    const storage = createMockStorage();
    assert.equal(HeaderBar.getStoredTheme(storage), null);
    assert.equal(HeaderBar.setStoredTheme('light', storage), true);
    assert.equal(HeaderBar.getStoredTheme(storage), 'light');
    assert.equal(HeaderBar.setStoredTheme('dark', storage), true);
    assert.equal(HeaderBar.getStoredTheme(storage), 'dark');

    // Failure Path 1: invalid explicit storage object throws TypeError
    assert.throws(() => HeaderBar.getStoredTheme({}), /CRITICAL: storage must provide a getItem function/);
    assert.throws(() => HeaderBar.getStoredTheme('bad-storage'), /CRITICAL: storage must provide a getItem function/);
    assert.throws(() => HeaderBar.setStoredTheme('light', {}), /CRITICAL: storage must provide a setItem function/);

    // Failure Path 2: invalid theme or corrupted/unavailable storage handled deterministically
    assert.throws(() => HeaderBar.setStoredTheme('solarized', storage), /CRITICAL: theme must be 'light' or 'dark'/);
    assert.equal(HeaderBar.setStoredTheme('light', null), false);
    assert.equal(HeaderBar.getStoredTheme(null), null);
    const corrupted = createMockStorage({ [HeaderBar.THEME_STORAGE_KEY]: 'corrupted-value' });
    assert.equal(HeaderBar.getStoredTheme(corrupted), null);
    const throwingStorage = {
      getItem() { throw new Error('SecurityError'); },
      setItem() { throw new Error('QuotaExceededError'); }
    };
    assert.equal(HeaderBar.getStoredTheme(throwingStorage), null);
    assert.equal(HeaderBar.setStoredTheme('dark', throwingStorage), false);
  });

  await t.test('Theme Helpers: resolveInitialTheme & toggleTheme & buildThemeToggleInnerHtml happy and failure paths', () => {
    const storage = createMockStorage({ [HeaderBar.THEME_STORAGE_KEY]: 'light' });
    const rootEl = createMockRootEl('dark');

    // Priority: explicit theme > storage > rootEl > 'dark'
    assert.equal(HeaderBar.resolveInitialTheme({ theme: 'dark', storage, rootEl }), 'dark');
    assert.equal(HeaderBar.resolveInitialTheme({ storage, rootEl }), 'light');
    assert.equal(HeaderBar.resolveInitialTheme({ storage: null, rootEl }), 'dark');
    assert.equal(HeaderBar.resolveInitialTheme({ storage: null, rootEl: createMockRootEl() }), 'dark');

    // toggleTheme flips and persists
    const toggleStore = createMockStorage();
    const toggleRoot = createMockRootEl('dark');
    assert.equal(HeaderBar.toggleTheme({ storage: toggleStore, rootEl: toggleRoot }), 'light');
    assert.equal(toggleStore.getItem(HeaderBar.THEME_STORAGE_KEY), 'light');
    assert.equal(HeaderBar.toggleTheme({ storage: toggleStore, rootEl: toggleRoot }), 'dark');
    assert.equal(toggleStore.getItem(HeaderBar.THEME_STORAGE_KEY), 'dark');

    // buildThemeToggleInnerHtml happy paths
    assert.match(HeaderBar.buildThemeToggleInnerHtml('dark'), /data-theme-icon="sun"/);
    assert.match(HeaderBar.buildThemeToggleInnerHtml('light'), /data-theme-icon="moon"/);

    // Failure Paths for resolveInitialTheme, toggleTheme, buildThemeToggleInnerHtml, and render theme options
    assert.throws(() => HeaderBar.resolveInitialTheme(null), /CRITICAL: options must be an object/);
    assert.throws(() => HeaderBar.resolveInitialTheme([]), /CRITICAL: options must be an object/);
    assert.throws(() => HeaderBar.resolveInitialTheme({ theme: 'neon' }), /CRITICAL: theme must be 'light' or 'dark'/);
    assert.throws(() => HeaderBar.resolveInitialTheme({ rootEl: 'bad' }), /CRITICAL: rootEl must be an object or null/);

    assert.throws(() => HeaderBar.toggleTheme(null), /CRITICAL: options must be an object/);
    assert.throws(() => HeaderBar.toggleTheme({ currentTheme: 'auto' }), /CRITICAL: theme must be 'light' or 'dark'/);
    assert.throws(() => HeaderBar.toggleTheme({ rootEl: 99 }), /CRITICAL: rootEl must be an object or null/);

    assert.throws(() => HeaderBar.buildThemeToggleInnerHtml(''), /CRITICAL: theme must be 'light' or 'dark'/);
    assert.throws(() => HeaderBar.buildThemeToggleInnerHtml(null), /CRITICAL: theme must be 'light' or 'dark'/);

    const { container } = createMockContainer();
    assert.throws(() => HeaderBar.render(container, { shows: [], theme: 'invalid' }), /CRITICAL: theme must be 'light' or 'dark'/);
    assert.throws(() => HeaderBar.render(container, { shows: [], onToggleTheme: 'not-fn' }), /CRITICAL: onToggleTheme must be a function/);
    assert.throws(() => HeaderBar.render(container, { shows: [], storage: { getItem() {} } }), /CRITICAL: storage must provide getItem and setItem functions/);
    assert.throws(() => HeaderBar.render(container, { shows: [], rootEl: 'bad' }), /CRITICAL: rootEl must be an object or null/);
  });
});
