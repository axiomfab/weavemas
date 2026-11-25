import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  resolveHostTheme,
  normalizeHostFontSize,
  serializeHostCssVariables
} from '../sidecars/panel/lib/host_theme.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PANEL_ROOT = path.resolve(__dirname, '..', 'sidecars', 'panel');

test('Host Theme Resolution (Issue #27) - Happy Path: resolves Onyx Dark, Onyx Light, High Contrast, and named presets', () => {
  const darkRes = resolveHostTheme({ userSettings: { themeMode: 'dark' } }, null);
  assert.equal(darkRes.mode, 'dark');
  assert.equal(darkRes.isDark, true);
  assert.equal(darkRes.contrast, 'normal');
  assert.equal(darkRes.cssVariables['--background'], '#131316');
  assert.equal(darkRes.cssVariables['--card'], '#1A1B20');

  const lightRes = resolveHostTheme({ userSettings: { themeMode: 'THEME_MODE_LIGHT' } }, null);
  assert.equal(lightRes.mode, 'light');
  assert.equal(lightRes.isDark, false);
  assert.equal(lightRes.cssVariables['--background'], '#FFFFFF');
  assert.equal(lightRes.cssVariables['--foreground'], '#0A0A0C');

  const hcRes = resolveHostTheme({ userSettings: { themeMode: 'dark', contrast: 'CONTRAST_HIGH' } }, null);
  assert.equal(hcRes.contrast, 'high');
  assert.equal(hcRes.cssVariables['--background'], '#050507');

  const catRes = resolveHostTheme({ userSettings: { themeMode: 'dark', preset: 'Catppuccin' } }, null);
  assert.equal(catRes.theme, 'Catppuccin');
  assert.equal(catRes.cssVariables['--background'], '#24273A');
  assert.equal(catRes.cssVariables['--primary'], '#C6A0F6');
});

test('Host Theme Resolution (Issue #27) - Custom seeds, font scale, and missing config fallback', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-theme-'));
  try {
    const missingCfg = path.join(tmp, 'does_not_exist.json');
    const fallback = resolveHostTheme(missingCfg, missingCfg);
    assert.equal(fallback.mode, 'dark');
    assert.equal(fallback.fontScale, 1);

    const cfgPath = path.join(tmp, 'config.json');
    const storagePath = path.join(tmp, 'app_storage.json');
    fs.writeFileSync(cfgPath, JSON.stringify({
      userSettings: {
        themeMode: 'light',
        customThemeSeedsLight: { background: '#FAF4E5', foregroundOverride: '#435155', primary: '#CB4B16' }
      }
    }));
    fs.writeFileSync(storagePath, JSON.stringify({ 'jetski.fontSize': 'large', 'jetski.contrast': 2 }));

    const resolved = resolveHostTheme(cfgPath, storagePath);
    assert.equal(resolved.mode, 'light');
    assert.equal(resolved.contrast, 'high');
    assert.equal(resolved.fontSizePx, 16);
    assert.ok(resolved.fontScale > 1.1);
    assert.equal(resolved.cssVariables['--background'], '#FAF4E5');
    assert.equal(resolved.cssVariables['--primary'], '#CB4B16');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  assert.equal(normalizeHostFontSize('small').fontSizePx, 12);
  assert.equal(normalizeHostFontSize(undefined).fontScale, 1);
  assert.equal(normalizeHostFontSize(-5).fontScale, 1);
});

test('Host Theme Serialization (Issue #27) - Escapes/drops unsafe CSS values', () => {
  const safe = serializeHostCssVariables({
    '--background': '#131316',
    '--primary': '#2F71E3',
    'not-a-var': '#fff',
    '--injected': 'red; } body { display: none'
  });
  assert.match(safe, /--background: #131316;/);
  assert.match(safe, /--primary: #2F71E3;/);
  assert.doesNotMatch(safe, /not-a-var/);
  assert.doesNotMatch(safe, /display: none/);
});

test('Live theme-change postMessage Listener (Issue #27) - Updates dataset.theme, CSS variables, and HeaderBar button without reload', () => {
  const headerCode = fs.readFileSync(path.join(PANEL_ROOT, 'trackers', 'header_bar.js'), 'utf8');
  const messageListeners = [];
  const cssVars = { '--onyx-well': '#111114', '--secondary-foreground': '#CBD5E1' };
  let seedRemoved = false;
  const attrs = { 'data-theme': 'dark', 'data-theme-override': 'dark' };
  const rootEl = {
    dataset: { theme: 'dark' },
    style: {
      colorScheme: 'dark',
      setProperty(k, v) { cssVars[k] = v; },
      removeProperty(k) { delete cssVars[k]; }
    },
    setAttribute(k, v) {
      attrs[k] = String(v);
      if (k === 'data-theme') this.dataset.theme = String(v);
    },
    getAttribute(k) { return attrs[k] ?? null; },
    removeAttribute(k) { delete attrs[k]; }
  };

  const themeBtn = {
    innerHTML: '',
    title: '',
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener() {}
  };
  const container = {
    innerHTML: '',
    querySelector(sel) {
      if (sel === 'header') return this.innerHTML.includes('<header') ? {} : null;
      if (sel === '#theme-toggle-btn') return themeBtn;
      if (sel === '#show-select') return { innerHTML: '', value: '', addEventListener() {} };
      if (sel === '#sync-btn') return { addEventListener() {} };
      if (sel === '#worktree-badge-root') return { innerHTML: '' };
      return null;
    }
  };

  const ctx = {
    window: {
      __WEAVEMAS_HOST_THEME__: { mode: 'dark' },
      addEventListener(ev, fn) { if (ev === 'message') messageListeners.push(fn); }
    },
    document: {
      documentElement: rootEl,
      getElementById(id) {
        if (id === 'agy-host-theme-seed') {
          return { remove() { seedRemoved = true; } };
        }
        return null;
      }
    },
    module: { exports: {} },
    console
  };
  vm.createContext(ctx);
  vm.runInContext(headerCode, ctx);
  const HeaderBar = ctx.window.HeaderBar;

  HeaderBar.render(container, { shows: [], rootEl });
  assert.ok(messageListeners.length >= 1, 'HeaderBar must register a window message listener');

  // Dispatch live theme-change to light with custom host CSS variables
  messageListeners.forEach((fn) => fn({
    data: {
      type: 'theme-change',
      theme: 'light',
      cssVariables: { '--background': '#FAF4E5', '--primary': '#CB4B16' }
    }
  }));

  assert.equal(rootEl.dataset.theme, 'light');
  assert.equal(rootEl.style.colorScheme, 'light');
  assert.equal(attrs['data-theme-override'], undefined, 'Host theme-change must clear manual override');
  assert.equal(seedRemoved, true, 'Host theme-change with cssVariables must remove stale #agy-host-theme-seed');
  assert.equal(cssVars['--onyx-well'], undefined, 'Omitted derived vars must be cleared so color-mix recomputes');
  assert.equal(cssVars['--secondary-foreground'], undefined, 'Omitted derived vars must be cleared so color-mix recomputes');
  assert.equal(cssVars['--background'], '#FAF4E5');
  assert.equal(cssVars['--primary'], '#CB4B16');
  assert.equal(themeBtn.getAttribute('data-theme-state'), 'light');
  assert.match(themeBtn.innerHTML, /data-theme-icon="moon"/);

  // Unrelated messages are ignored safely
  assert.equal(HeaderBar.handleThemeMessage({ data: { type: 'other-event' } }, { rootEl }), null);
  assert.equal(HeaderBar.handleThemeMessage(null, { rootEl }), null);
});
