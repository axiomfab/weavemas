/**
 * Antigravity (agy) Host Theme Resolver for WeaveMAS Sidecar Panel.
 * Resolves live theme mode, contrast, font scale, and CSS custom property seeds
 * from ~/.gemini/config/config.json and OS-aware Antigravity app_storage.json,
 * following arthurcavallari/antigravity-sidecar-kit conventions with safe fallbacks.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const GLOBAL_CONFIG_DIR = join(homedir(), '.gemini', 'config');
export const CONFIG_JSON_PATH = join(GLOBAL_CONFIG_DIR, 'config.json');

export const APP_STORAGE_PATH =
  process.platform === 'win32'
    ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Antigravity', 'app_storage.json')
    : process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support', 'Antigravity', 'app_storage.json')
      : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'Antigravity', 'app_storage.json');

export const BUILT_IN_THEMES = Object.freeze({
  light: Object.freeze({
    'Default Light': Object.freeze({ background: '#F9F9F9', foregroundOverride: '#101010', primary: '#007acc' }),
    'Legacy Light': Object.freeze({ background: '#F9F9F9', foregroundOverride: '#101010', primary: '#007acc' }),
    'Onyx Light': Object.freeze({ background: '#FFFFFF', foregroundOverride: '#0A0A0C', primary: '#2F75C3' }),
    Catppuccin: Object.freeze({ background: '#EAECF0', foregroundOverride: '#4C4F69', primary: '#8839EF' }),
    'Gruvbox Material': Object.freeze({ background: '#f9f5d7', foregroundOverride: '#4f3829', primary: '#c35e0a' }),
    'One Light': Object.freeze({ background: '#F5F5F5', foregroundOverride: '#383A42', primary: '#4078F2' }),
    'Solarized Light': Object.freeze({ background: '#FAF4E5', foregroundOverride: '#435155', primary: '#CB4B16' }),
  }),
  dark: Object.freeze({
    'Default Dark': Object.freeze({ background: '#101010', foregroundOverride: '#cccccc', primary: '#007acc' }),
    'Legacy Dark': Object.freeze({ background: '#101010', foregroundOverride: '#cccccc', primary: '#007acc' }),
    'Onyx Dark': Object.freeze({ background: '#070708', foregroundOverride: '#FFFFFF', primary: '#2F71E3' }),
    Catppuccin: Object.freeze({ background: '#24273A', foregroundOverride: '#CAD3F5', primary: '#C6A0F6' }),
    Dracula: Object.freeze({ background: '#282A36', foregroundOverride: '#F8F8F2', primary: '#BD93F9' }),
    'Gruvbox Material': Object.freeze({ background: '#141617', foregroundOverride: '#d4be98', primary: '#e78a4e' }),
    Monokai: Object.freeze({ background: '#272822', foregroundOverride: '#F8F8F2', primary: '#F92672' }),
    'One Dark Pro': Object.freeze({ background: '#282C34', foregroundOverride: '#ABB2BF', primary: '#61AFEF' }),
    'Tokyo Night': Object.freeze({ background: '#1A1B26', foregroundOverride: '#A9B1D6', primary: '#7AA2F7' }),
    'Solarized Dark': Object.freeze({ background: '#002B36', foregroundOverride: '#93A1A1', primary: '#268BD2' }),
    Vesper: Object.freeze({ background: '#101010', foregroundOverride: '#FFFFFF', primary: '#FFC799' }),
  }),
});

export const ONYX_TOKENS = Object.freeze({
  light: Object.freeze({
    normal: Object.freeze({
      '--background': '#FFFFFF',
      '--foreground': '#0A0A0C',
      '--primary': '#2F75C3',
      '--shell': '#FAFAFA',
      '--secondary': 'rgb(10 10 12 / 0.06)',
      '--secondary-foreground': '#3F3F46',
      '--muted': 'rgb(10 10 12 / 0.038)',
      '--muted-foreground': '#71717A',
      '--placeholder': '#8E8E95',
      '--card': '#FFFFFF',
      '--card-border': 'rgb(10 10 12 / 0.08)',
      '--border': 'rgb(10 10 12 / 0.07)',
      '--onyx-well': 'rgb(10 10 12 / 0.05)',
      '--error': '#f05151',
      '--warning': '#ac830b',
      '--success': '#58983f',
      '--link': '#3e8ed1',
    }),
    high: Object.freeze({
      '--background': '#FFFFFF',
      '--foreground': '#000000',
      '--primary': '#2560A3',
      '--shell': '#F3F3F3',
      '--secondary': 'rgb(10 10 12 / 0.095)',
      '--secondary-foreground': '#27272A',
      '--muted': 'rgb(10 10 12 / 0.06)',
      '--muted-foreground': '#52525B',
      '--placeholder': '#71717A',
      '--card': '#FFFFFF',
      '--card-border': 'rgb(10 10 12 / 0.14)',
      '--border': 'rgb(10 10 12 / 0.12)',
      '--onyx-well': 'rgb(10 10 12 / 0.06)',
      '--error': '#d92d20',
      '--warning': '#935f05',
      '--success': '#2e7d32',
      '--link': '#2560A3',
    }),
  }),
  dark: Object.freeze({
    normal: Object.freeze({
      '--background': '#131316',
      '--foreground': '#E5E7EB',
      '--primary': '#2F71E3',
      '--shell': '#16171C',
      '--secondary': 'rgb(255 255 255 / 0.065)',
      '--secondary-foreground': '#CBD5E1',
      '--muted': 'rgb(255 255 255 / 0.042)',
      '--muted-foreground': '#9CA3AF',
      '--placeholder': '#71717A',
      '--card': '#1A1B20',
      '--card-border': 'rgb(255 255 255 / 0.09)',
      '--border': 'rgb(255 255 255 / 0.09)',
      '--onyx-well': '#111114',
      '--error': '#f43f5e',
      '--warning': '#f59e0b',
      '--success': '#10b981',
      '--link': '#6a9fcb',
    }),
    high: Object.freeze({
      '--background': '#050507',
      '--foreground': '#FFFFFF',
      '--primary': '#2F71E3',
      '--shell': '#121216',
      '--secondary': 'rgb(255 255 255 / 0.115)',
      '--secondary-foreground': '#EAEBF1',
      '--muted': 'rgb(255 255 255 / 0.068)',
      '--muted-foreground': '#A8A9B2',
      '--placeholder': '#888990',
      '--card': '#17171C',
      '--card-border': 'rgb(255 255 255 / 0.15)',
      '--border': 'rgb(255 255 255 / 0.13)',
      '--onyx-well': '#0D0D11',
      '--error': '#fb7185',
      '--warning': '#fbbf24',
      '--success': '#34d399',
      '--link': '#6a9fcb',
    }),
  }),
});

export function readJsonSafe(filePath, fallback = null) {
  if (!filePath || typeof filePath !== 'string' || !existsSync(filePath)) return fallback;
  try {
    const raw = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim();
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeHostFontSize(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { fontSizePx: 14, fontScale: 1 };
  }
  if (typeof raw === 'string') {
    const lower = raw.trim().toLowerCase();
    if (lower === 'small' || lower === 'sm') return { fontSizePx: 12, fontScale: +(12 / 14).toFixed(4) };
    if (lower === 'default' || lower === 'normal' || lower === 'md') return { fontSizePx: 14, fontScale: 1 };
    if (lower === 'large' || lower === 'lg') return { fontSizePx: 16, fontScale: +(16 / 14).toFixed(4) };
  }
  const num = Number(typeof raw === 'string' ? raw.replace(/px$/i, '').trim() : raw);
  if (!Number.isFinite(num) || num <= 0) return { fontSizePx: 14, fontScale: 1 };
  if (num < 4) {
    const scale = +Math.max(0.75, Math.min(1.5, num)).toFixed(4);
    return { fontSizePx: +(scale * 14).toFixed(2), fontScale: scale };
  }
  const clampedPx = Math.max(10.5, Math.min(21, num));
  return { fontSizePx: +clampedPx.toFixed(2), fontScale: +(clampedPx / 14).toFixed(4) };
}

export function resolveHostTheme(configInput = CONFIG_JSON_PATH, appStoragePath = APP_STORAGE_PATH) {
  let userSettings = {};
  if (typeof configInput === 'string') {
    const parsed = readJsonSafe(configInput, {});
    userSettings = parsed?.userSettings || parsed || {};
  } else if (configInput && typeof configInput === 'object' && !Array.isArray(configInput)) {
    userSettings = configInput.userSettings || configInput;
  }

  const storageData = typeof appStoragePath === 'string' ? readJsonSafe(appStoragePath, null) : null;

  const rawMode = userSettings?.themeMode;
  const isLight =
    rawMode === 1 ||
    rawMode === '1' ||
    rawMode === 'THEME_MODE_LIGHT' ||
    rawMode === 'light' ||
    rawMode === 'hcLight';
  const mode = isLight ? 'light' : 'dark';
  const isDark = !isLight;

  const rawContrast =
    userSettings?.contrast !== undefined
      ? userSettings.contrast
      : storageData && storageData['jetski.contrast'] !== undefined
        ? storageData['jetski.contrast']
        : 1;
  const highContrast =
    rawContrast === 2 ||
    rawContrast === '2' ||
    rawContrast === 'CONTRAST_HIGH' ||
    rawMode === 'hcDark' ||
    rawMode === 'hcLight';

  const storagePresetKey = isLight ? 'theme-preset-light' : 'theme-preset-dark';
  const storagePreset = storageData && typeof storageData[storagePresetKey] === 'string'
    ? storageData[storagePresetKey].trim()
    : '';
  const explicitPreset =
    userSettings?.preset ||
    (isLight
      ? userSettings?.themePresetLight || userSettings?.['theme-preset-light']
      : userSettings?.themePresetDark || userSettings?.['theme-preset-dark']) ||
    storagePreset;

  const rawUserSeeds = (isLight ? userSettings?.customThemeSeedsLight : userSettings?.customThemeSeedsDark) || {};
  const hasCustomSeeds = Boolean(rawUserSeeds && typeof rawUserSeeds === 'object' && Object.keys(rawUserSeeds).length > 0);
  const normalizedPreset =
    !explicitPreset || explicitPreset === 'Default' || explicitPreset === 'Onyx' || explicitPreset === 'onyx'
      ? (isLight ? 'Onyx Light' : 'Onyx Dark')
      : explicitPreset;

  const presetTable = BUILT_IN_THEMES[mode] || {};
  const builtInSeeds = presetTable[normalizedPreset] || null;
  const isOnyx = (normalizedPreset === 'Onyx Light' || normalizedPreset === 'Onyx Dark') && !hasCustomSeeds;
  const onyxTokens = isOnyx ? ONYX_TOKENS[mode][highContrast ? 'high' : 'normal'] : null;

  const baseFallback = isLight ? ONYX_TOKENS.light.normal : ONYX_TOKENS.dark.normal;
  const mergedSeeds = {
    background: builtInSeeds?.background || baseFallback['--background'],
    foreground: builtInSeeds?.foregroundOverride || baseFallback['--foreground'],
    primary: builtInSeeds?.primary || baseFallback['--primary'],
    ...(hasCustomSeeds ? {
      ...(rawUserSeeds.background ? { background: rawUserSeeds.background } : {}),
      ...((rawUserSeeds.foregroundOverride || rawUserSeeds.foreground) ? { foreground: rawUserSeeds.foregroundOverride || rawUserSeeds.foreground } : {}),
      ...(rawUserSeeds.primary ? { primary: rawUserSeeds.primary } : {}),
    } : {}),
  };

  const fontSans =
    userSettings?.['font.family'] ||
    userSettings?.fontFamily ||
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const fontMono =
    userSettings?.['editor.font.family'] ||
    userSettings?.['editor.fontFamily'] ||
    userSettings?.editorFontFamily ||
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

  const rawFontSize =
    userSettings?.['jetski.fontSize'] ??
    userSettings?.fontSize ??
    (storageData ? storageData['jetski.fontSize'] : 14);
  const { fontSizePx, fontScale } = normalizeHostFontSize(rawFontSize);

  const bg = onyxTokens ? onyxTokens['--background'] : mergedSeeds.background;
  const fg = onyxTokens ? onyxTokens['--foreground'] : mergedSeeds.foreground;
  const primary = onyxTokens ? onyxTokens['--primary'] : mergedSeeds.primary;
  const c = highContrast
    ? { borderPct: isLight ? '14%' : '13%', cardPct: '7%', secPct: isLight ? '9%' : '12%', mutedPct: '5%' }
    : { borderPct: isLight ? '9%' : '9%', cardPct: '5%', secPct: isLight ? '6%' : '7%', mutedPct: '3%' };

  const cssVariables = {
    '--background': bg,
    '--foreground': fg,
    '--primary': primary,
    '--shell': onyxTokens ? onyxTokens['--shell'] : `color-mix(in srgb, ${fg} ${c.mutedPct}, ${bg})`,
    '--card': onyxTokens ? onyxTokens['--card'] : (isLight ? '#ffffff' : `color-mix(in srgb, ${fg} ${c.cardPct}, ${bg})`),
    '--card-border': onyxTokens ? onyxTokens['--card-border'] : `color-mix(in srgb, ${fg} ${c.borderPct}, transparent)`,
    '--border': onyxTokens ? onyxTokens['--border'] : `color-mix(in srgb, ${fg} ${c.borderPct}, transparent)`,
    '--onyx-well': onyxTokens ? onyxTokens['--onyx-well'] : `color-mix(in srgb, ${fg} ${c.mutedPct}, ${bg})`,
    '--secondary': onyxTokens ? onyxTokens['--secondary'] : `color-mix(in srgb, ${fg} ${c.secPct}, transparent)`,
    '--secondary-foreground': onyxTokens ? onyxTokens['--secondary-foreground'] : `color-mix(in srgb, ${fg} 78%, ${bg})`,
    '--muted': onyxTokens ? onyxTokens['--muted'] : `color-mix(in srgb, ${fg} ${c.mutedPct}, transparent)`,
    '--muted-foreground': onyxTokens ? onyxTokens['--muted-foreground'] : `color-mix(in srgb, ${fg} 58%, ${bg})`,
    '--placeholder': onyxTokens ? onyxTokens['--placeholder'] : `color-mix(in srgb, ${fg} 40%, ${bg})`,
    '--success': onyxTokens ? onyxTokens['--success'] : (isDark ? '#10b981' : '#16a34a'),
    '--warning': onyxTokens ? onyxTokens['--warning'] : (isDark ? '#f59e0b' : '#d97706'),
    '--error': onyxTokens ? onyxTokens['--error'] : (isDark ? '#f43f5e' : '#e11d48'),
    '--link': onyxTokens ? onyxTokens['--link'] : (isDark ? '#6a9fcb' : '#3e8ed1'),
    '--app-font-scale': String(fontScale),
    '--font-size': `${fontSizePx}px`,
    '--vscode-font-family': fontSans,
    '--editor-font-family': fontMono,
  };

  return {
    theme: builtInSeeds ? normalizedPreset : (isDark ? 'Antigravity Dark' : 'Antigravity Light'),
    mode,
    contrast: highContrast ? 'high' : 'normal',
    isDark,
    fontSizePx,
    fontScale,
    cssVariables,
  };
}

/**
 * Serializes resolved host CSS custom properties into a safe CSS `:root` declaration block.
 * Rejects any value containing `{`, `}`, `;`, or `<` to prevent style/HTML injection.
 * @param {Record<string, string>} cssVariables
 * @returns {string}
 */
export function serializeHostCssVariables(cssVariables) {
  if (!cssVariables || typeof cssVariables !== 'object') return '';
  const pairs = [];
  for (const [key, val] of Object.entries(cssVariables)) {
    if (!/^--[a-z0-9-]+$/i.test(key)) continue;
    const strVal = String(val ?? '').trim();
    if (!strVal || /[{};<>]/.test(strVal)) continue;
    pairs.push(`${key}: ${strVal};`);
  }
  return pairs.join(' ');
}
