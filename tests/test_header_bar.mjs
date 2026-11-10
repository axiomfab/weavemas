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

  const badgeRoot = {
    innerHTML: ''
  };

  elements['header'] = { tagName: 'HEADER' };
  elements['#show-select'] = showSelect;
  elements['#sync-btn'] = syncBtn;
  elements['#worktree-badge-root'] = badgeRoot;

  return { container, showSelect, syncBtn, badgeRoot };
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

  await t.test('Happy Path 1: renders complete header with SVG icon, title, pulse dot, dropdown, and sync button', () => {
    const { container, showSelect } = createMockContainer();
    const shows = [
      { path: 'c:/output/show_01', displayPath: 'output\\show_01' },
      { path: 'c:/output/show_02', displayPath: 'output\\show_02' }
    ];

    HeaderBar.render(container, {
      shows,
      activePath: 'c:/output/show_01'
    });

    assert.match(container.innerHTML, /<h1[^>]*>WeaveMAS UI<\/h1>/);
    assert.match(container.innerHTML, /<svg class="w-4\.5 h-4\.5 text-white"/);
    assert.match(container.innerHTML, /<span class="pulsing-dot"/);
    assert.match(container.innerHTML, /<button id="sync-btn"/);
    assert.match(showSelect.innerHTML, /value="c:\/output\/show_01" selected/);
    assert.match(showSelect.innerHTML, /output\\show_02/);
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

  await t.test('Failure Path 2: throws TypeError on invalid or missing options and non-array shows', () => {
    const { container } = createMockContainer();
    assert.throws(() => {
      HeaderBar.render(container, null);
    }, /CRITICAL: options object is required/);

    assert.throws(() => {
      HeaderBar.render(container, { shows: 'not-an-array' });
    }, /CRITICAL: shows must be an array/);
  });

  await t.test('Failure Path 3: handles empty shows array with fallback option without throwing', () => {
    const { container, showSelect, badgeRoot } = createMockContainer();
    HeaderBar.render(container, { shows: [] });
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

  await t.test('Failure Path 4: buildWorktreeBadgeHtml returns empty string for null, undefined, or non-worktree items', () => {
    assert.equal(HeaderBar.buildWorktreeBadgeHtml(null), '');
    assert.equal(HeaderBar.buildWorktreeBadgeHtml(undefined), '');
    assert.equal(HeaderBar.buildWorktreeBadgeHtml({ path: 'c:/runs/a', isWorktree: false, worktree: null }), '');
  });
});
