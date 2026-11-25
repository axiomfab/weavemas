// Header Bar Component - WeaveMAS Panel
(function() {
  const THEME_STORAGE_KEY = 'weavemas-ui-theme';
  const VALID_THEMES = ['dark', 'light'];
  const containerStates = new WeakMap();

  /**
   * Escapes special HTML characters in a string or primitive value.
   * @param {string|number|boolean|null|undefined} str - Value to escape for safe HTML interpolation.
   * @returns {string} Escaped HTML string, or empty string when null, undefined, or empty.
   */
  function escapeHtml(str) {
    if (str === null || str === undefined || str === '') return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Validates that a theme identifier is strictly 'light' or 'dark'.
   * @param {string} theme - Candidate theme value.
   * @returns {'light'|'dark'} Validated theme string.
   */
  function assertValidTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') {
      throw new TypeError("CRITICAL: theme must be 'light' or 'dark'");
    }
    return theme;
  }

  /**
   * Resolves the effective storage interface, validating explicit storage mocks strictly.
   * @param {{getItem?: (key: string) => string|null, setItem?: (key: string, val: string) => void}|null|undefined} storage - Optional storage implementation.
   * @param {'getItem'|'setItem'} requiredMethod - Required Web Storage method name.
   * @returns {{getItem?: (key: string) => string|null, setItem?: (key: string, val: string) => void}|null} Effective storage object or null when unavailable.
   */
  function resolveStorage(storage, requiredMethod) {
    if (storage !== undefined) {
      if (storage === null) return null;
      if (typeof storage !== 'object' || typeof storage[requiredMethod] !== 'function') {
        throw new TypeError(`CRITICAL: storage must provide a ${requiredMethod} function`);
      }
      return storage;
    }
    if (typeof window !== 'undefined') {
      try {
        const ls = window.localStorage;
        if (ls && typeof ls[requiredMethod] === 'function') return ls;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Reads the persisted user theme preference ('light' or 'dark') from storage.
   * @param {{getItem: (key: string) => string|null}|null|undefined} [storage] - Optional storage override.
   * @returns {'light'|'dark'|null} Stored theme value, or null if unset or unrecognized.
   */
  function getStoredTheme(storage) {
    const store = resolveStorage(storage, 'getItem');
    if (!store) return null;
    let raw = null;
    try {
      raw = store.getItem(THEME_STORAGE_KEY);
    } catch {
      return null;
    }
    return (raw === 'light' || raw === 'dark') ? raw : null;
  }

  /**
   * Persists the user theme preference ('light' or 'dark') to storage.
   * @param {'light'|'dark'} theme - Theme value to persist.
   * @param {{setItem: (key: string, val: string) => void}|null|undefined} [storage] - Optional storage override.
   * @returns {boolean} True when persisted to storage, false when storage is unavailable.
   */
  function setStoredTheme(theme, storage) {
    assertValidTheme(theme);
    const store = resolveStorage(storage, 'setItem');
    if (!store) return false;
    try {
      store.setItem(THEME_STORAGE_KEY, theme);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Applies the given theme ('light' or 'dark') to the target root element (or document.documentElement).
   * @param {'light'|'dark'} theme - Theme identifier to apply.
   * @param {object|null|undefined} [rootEl] - Optional root element override (defaults to document.documentElement).
   * @returns {'light'|'dark'} Applied theme identifier.
   */
  function applyTheme(theme, rootEl) {
    assertValidTheme(theme);
    if (rootEl !== undefined && rootEl !== null && typeof rootEl !== 'object') {
      throw new TypeError('CRITICAL: rootEl must be an object or null');
    }
    const target = rootEl !== undefined
      ? rootEl
      : (typeof document !== 'undefined' && document.documentElement ? document.documentElement : null);
    if (target) {
      if (typeof target.setAttribute === 'function') {
        target.setAttribute('data-theme', theme);
      }
      if (target.dataset && typeof target.dataset === 'object') {
        target.dataset.theme = theme;
      }
      if (target.style && typeof target.style === 'object') {
        target.style.colorScheme = theme;
      }
    }
    return theme;
  }

  /**
   * Reads a valid theme attribute from a root DOM element if present.
   * @param {object|null} target - Candidate DOM element.
   * @returns {'light'|'dark'|null} Theme on element or null.
   */
  function readElementTheme(target) {
    if (!target || typeof target !== 'object') return null;
    const attrVal = typeof target.getAttribute === 'function'
      ? target.getAttribute('data-theme')
      : (target.dataset ? target.dataset.theme : null);
    return (attrVal === 'light' || attrVal === 'dark') ? attrVal : null;
  }

  /**
   * Resolves the initial active theme from explicit option, persisted storage, DOM attribute, or 'dark' default.
   * @param {{
   *   theme?: 'light'|'dark',
   *   storage?: {getItem: (key: string) => string|null}|null,
   *   rootEl?: object|null
   * }} [options={}] - Resolution options.
   * @returns {'light'|'dark'} Resolved theme value.
   */
  function resolveInitialTheme(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('CRITICAL: options must be an object');
    }
    if (options.theme !== undefined) {
      assertValidTheme(options.theme);
    }
    if (options.rootEl !== undefined && options.rootEl !== null && typeof options.rootEl !== 'object') {
      throw new TypeError('CRITICAL: rootEl must be an object or null');
    }
    if (options.theme !== undefined) {
      return options.theme;
    }
    const stored = getStoredTheme(options.storage);
    if (stored) {
      return stored;
    }
    const target = options.rootEl !== undefined
      ? options.rootEl
      : (typeof document !== 'undefined' && document.documentElement ? document.documentElement : null);
    const domTheme = readElementTheme(target);
    return domTheme || 'dark';
  }

  /**
   * Toggles between 'dark' and 'light' themes, applying the new theme to rootEl and persisting it to storage.
   * @param {{
   *   currentTheme?: 'light'|'dark',
   *   storage?: {getItem: (key: string) => string|null, setItem: (key: string, val: string) => void}|null,
   *   rootEl?: object|null
   * }} [options={}] - Toggle configuration.
   * @returns {'light'|'dark'} Newly activated theme.
   */
  function toggleTheme(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('CRITICAL: options must be an object');
    }
    if (options.currentTheme !== undefined) {
      assertValidTheme(options.currentTheme);
    }
    if (options.rootEl !== undefined && options.rootEl !== null && typeof options.rootEl !== 'object') {
      throw new TypeError('CRITICAL: rootEl must be an object or null');
    }
    const target = options.rootEl !== undefined
      ? options.rootEl
      : (typeof document !== 'undefined' && document.documentElement ? document.documentElement : null);
    const current = options.currentTheme
      || readElementTheme(target)
      || getStoredTheme(options.storage)
      || 'dark';
    const nextTheme = current === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme, target);
    setStoredTheme(nextTheme, options.storage);
    return nextTheme;
  }

  /**
   * Builds the SVG icon HTML for the theme toggle button corresponding to the active theme.
   * @param {'light'|'dark'} currentTheme - Currently active theme ('dark' renders sun icon to switch to light; 'light' renders moon icon to switch to dark).
   * @returns {string} SVG markup string for the toggle button.
   */
  function buildThemeToggleInnerHtml(currentTheme) {
    assertValidTheme(currentTheme);
    if (currentTheme === 'dark') {
      return `<svg class="agy-theme-icon" data-theme-icon="sun" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.58 3.58l1.06 1.06M11.36 11.36l1.06 1.06M12.42 3.58l-1.06 1.06M4.64 11.36l-1.06 1.06" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
    }
    return `<svg class="agy-theme-icon" data-theme-icon="moon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.25 9.85A5.5 5.5 0 0 1 6.15 2.75a5.5 5.5 0 1 0 7.1 7.1Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  /**
   * Synchronizes the theme toggle button's attributes and icon with the active theme.
   * @param {object|null} btn - Theme toggle button element.
   * @param {'light'|'dark'} activeTheme - Active theme value.
   * @returns {void}
   */
  function syncThemeButtonState(btn, activeTheme) {
    if (!btn || typeof btn !== 'object') return;
    const nextLabel = activeTheme === 'dark' ? 'Switch to light layout' : 'Switch to dark layout';
    const isLight = activeTheme === 'light';
    btn.innerHTML = buildThemeToggleInnerHtml(activeTheme);
    btn.title = nextLabel;
    if (typeof btn.setAttribute === 'function') {
      btn.setAttribute('data-theme-state', activeTheme);
      btn.setAttribute('aria-label', nextLabel);
      btn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
    } else {
      btn.dataset = btn.dataset || {};
      btn.dataset.themeState = activeTheme;
      btn.ariaLabel = nextLabel;
      btn.ariaPressed = isLight ? 'true' : 'false';
    }
  }

  /**
   * Renders a single <option> element for a pipeline run entry.
   * @param {{path: string, displayPath?: string, title?: string, name?: string}} s - Run metadata item.
   * @param {string} currentVal - Normalized currently active path.
   * @param {(path: string) => string} norm - Path normalization helper.
   * @returns {string} HTML string for the option element.
   */
  function renderOptionHtml(s, currentVal, norm) {
    const isSel = norm(s.path) === currentVal;
    const label = s.displayPath || s.title || (s.name ? `runs\\${s.name}` : s.path);
    return `<option value="${escapeHtml(s.path)}" ${isSel ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }

  /**
   * Builds the git worktree badge HTML for an active run item when running inside a worktree.
   * @param {{isWorktree?: boolean, worktree?: string|null}|null|undefined} activeItem - Active run item metadata.
   * @returns {string} Worktree badge HTML string, or empty string when not in a worktree.
   */
  function buildWorktreeBadgeHtml(activeItem) {
    if (!activeItem || typeof activeItem !== 'object' || (!activeItem.isWorktree && !activeItem.worktree)) {
      return '';
    }
    const wtName = String(activeItem.worktree || 'worktree').trim();
    const branchSvg = `<svg class="w-3 h-3 fill-current shrink-0" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"></path></svg>`;
    return `<span id="worktree-badge" class="agy-worktree-badge" title="Executing in Git Worktree: ${escapeHtml(wtName)}">${branchSvg}<span>${escapeHtml(wtName)}</span></span>`;
  }

  /**
   * Renders or updates the flat native agy header section inside the given container.
   * @param {object} container - Host DOM container element supporting innerHTML/querySelector.
   * @param {{
   *   shows?: Array<object>,
   *   contexts?: Array<object>,
   *   activePath?: string|null,
   *   onSelectShow?: (path: string) => void,
   *   onSelectContext?: (path: string) => void,
   *   onSync?: () => void,
   *   theme?: 'light'|'dark',
   *   onToggleTheme?: (nextTheme: 'light'|'dark') => void,
   *   storage?: {getItem: (key: string) => string|null, setItem: (key: string, val: string) => void}|null,
   *   rootEl?: object|null
   * }} options - Header rendering options and callbacks.
   * @returns {void}
   */
  function render(container, options) {
    if (!container || typeof container !== 'object') {
      throw new TypeError('CRITICAL: container element is required and must be an object');
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('CRITICAL: options object is required and must be an object');
    }
    if (options.shows !== undefined && !Array.isArray(options.shows)) {
      throw new TypeError('CRITICAL: shows must be an array');
    }
    if (options.contexts !== undefined && !Array.isArray(options.contexts)) {
      throw new TypeError('CRITICAL: contexts must be an array');
    }
    if (options.activePath !== undefined && options.activePath !== null && typeof options.activePath !== 'string') {
      throw new TypeError('CRITICAL: activePath must be a string or null');
    }
    if (options.onSelectShow !== undefined && typeof options.onSelectShow !== 'function') {
      throw new TypeError('CRITICAL: onSelectShow must be a function');
    }
    if (options.onSelectContext !== undefined && typeof options.onSelectContext !== 'function') {
      throw new TypeError('CRITICAL: onSelectContext must be a function');
    }
    if (options.onSync !== undefined && typeof options.onSync !== 'function') {
      throw new TypeError('CRITICAL: onSync must be a function');
    }
    if (options.onViewRawMarkdown !== undefined && typeof options.onViewRawMarkdown !== 'function') {
      throw new TypeError('CRITICAL: onViewRawMarkdown must be a function');
    }
    if (options.theme !== undefined) {
      assertValidTheme(options.theme);
    }
    if (options.onToggleTheme !== undefined && typeof options.onToggleTheme !== 'function') {
      throw new TypeError('CRITICAL: onToggleTheme must be a function');
    }
    if (options.storage !== undefined && options.storage !== null) {
      if (typeof options.storage !== 'object' || typeof options.storage.getItem !== 'function' || typeof options.storage.setItem !== 'function') {
        throw new TypeError('CRITICAL: storage must provide getItem and setItem functions');
      }
    }
    if (options.rootEl !== undefined && options.rootEl !== null && typeof options.rootEl !== 'object') {
      throw new TypeError('CRITICAL: rootEl must be an object or null');
    }

    const {
      shows = [],
      contexts = shows,
      activePath = null,
      onSelectShow,
      onSelectContext = onSelectShow,
      onSync,
      onViewRawMarkdown,
      theme,
      onToggleTheme,
      storage,
      rootEl
    } = options;
    const availableItems = (Array.isArray(contexts) && contexts.length > 0) ? contexts : (Array.isArray(shows) ? shows : []);

    let state = containerStates.get(container);
    if (!state) {
      state = { currentTheme: null };
      containerStates.set(container, state);
    }
    state.onSelect = (typeof onSelectContext === 'function') ? onSelectContext : onSelectShow;
    state.onSync = onSync;
    state.onViewRawMarkdown = onViewRawMarkdown;
    state.onToggleTheme = onToggleTheme;
    state.storage = storage;
    state.rootEl = rootEl;

    const resolvedTheme = theme !== undefined
      ? theme
      : resolveInitialTheme({ storage, rootEl });
    const activeTheme = (theme === undefined && state.currentTheme && getStoredTheme(storage) === null && readElementTheme(rootEl !== undefined ? rootEl : (typeof document !== 'undefined' ? document.documentElement : null)) === null)
      ? state.currentTheme
      : resolvedTheme;

    state.currentTheme = activeTheme;
    applyTheme(activeTheme, rootEl);
    if (theme !== undefined) {
      setStoredTheme(theme, storage);
    }

    const toggleLabel = activeTheme === 'dark' ? 'Switch to light layout' : 'Switch to dark layout';
    const togglePressed = activeTheme === 'light' ? 'true' : 'false';
    const rawBtnHtml = (typeof onViewRawMarkdown === 'function')
      ? `<button id="raw-markdown-btn" type="button" class="agy-raw-btn" title="View Raw Markdown"><svg class="agy-sync-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5.25 5L2.25 8l3 3M10.75 5l3 3-3 3M9.25 3.25l-2.5 9.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span>View Raw Markdown</span></button>`
      : '';

    const headerEl = container.querySelector ? container.querySelector('header') : null;
    if (!headerEl) {
      container.innerHTML = `
        <header class="agy-header" data-weave-header="true">
          <div class="agy-header-left">
            <span class="agy-select-wrap">
              <select id="show-select" class="agy-select" aria-label="Select pipeline run">
                <option value="">Detecting runs...</option>
              </select>
              <svg class="agy-select-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4.5 6.25L8 9.75l3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span id="worktree-badge-root"></span>
          </div>
          <div class="agy-header-right">
            <span class="agy-live" role="status" title="Live Auto-Sync Active">
              <span class="pulsing-dot" aria-hidden="true"></span>
              <span class="agy-live-label">Live</span>
            </span>
            <button id="theme-toggle-btn" type="button" class="agy-theme-btn" data-theme-state="${activeTheme}" aria-pressed="${togglePressed}" aria-label="${toggleLabel}" title="${toggleLabel}">
              ${buildThemeToggleInnerHtml(activeTheme)}
            </button>
            ${rawBtnHtml}
            <button id="sync-btn" type="button" class="agy-sync-btn" title="Sync pipeline state">
              <svg class="agy-sync-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M13.5 8a5.5 5.5 0 1 1-1.38-3.65M13.5 2.5v2.75h-2.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>Sync</span>
            </button>
          </div>
        </header>
      `;

      const sel = container.querySelector ? container.querySelector('#show-select') : null;
      if (sel && sel.addEventListener) {
        sel.addEventListener('change', (e) => {
          const st = containerStates.get(container);
          if (st && typeof st.onSelect === 'function') st.onSelect(e.target.value);
        });
      }
      const themeBtn = container.querySelector ? container.querySelector('#theme-toggle-btn') : null;
      if (themeBtn && themeBtn.addEventListener) {
        themeBtn.addEventListener('click', () => {
          const st = containerStates.get(container);
          if (!st) return;
          const next = toggleTheme({
            currentTheme: st.currentTheme || 'dark',
            storage: st.storage,
            rootEl: st.rootEl
          });
          st.currentTheme = next;
          syncThemeButtonState(themeBtn, next);
          if (typeof st.onToggleTheme === 'function') {
            st.onToggleTheme(next);
          }
        });
      }
      const rawBtn = container.querySelector ? container.querySelector('#raw-markdown-btn') : null;
      if (rawBtn && rawBtn.addEventListener) {
        rawBtn.addEventListener('click', () => {
          const st = containerStates.get(container);
          if (st && typeof st.onViewRawMarkdown === 'function') st.onViewRawMarkdown();
        });
      }
      const syncBtn = container.querySelector ? container.querySelector('#sync-btn') : null;
      if (syncBtn && syncBtn.addEventListener) {
        syncBtn.addEventListener('click', () => {
          const st = containerStates.get(container);
          if (st && typeof st.onSync === 'function') st.onSync();
        });
      }
    } else {
      const themeBtn = container.querySelector ? container.querySelector('#theme-toggle-btn') : null;
      syncThemeButtonState(themeBtn, activeTheme);
    }

    const sel = container.querySelector ? container.querySelector('#show-select') : null;
    const norm = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
    const currentVal = norm(activePath || (sel ? sel.value : ''));

    if (sel) {
      if (availableItems.length === 0) {
        sel.innerHTML = '<option value="">No shows in output/ (or runs/)</option>';
      } else {
        const hasWorktreeItems = availableItems.some(s => Boolean(s && (s.isWorktree || s.worktree)));
        if (!hasWorktreeItems) {
          sel.innerHTML = availableItems.map(s => renderOptionHtml(s, currentVal, norm)).join('');
        } else {
          const mainItems = [];
          const worktreeGroups = new Map();
          for (const s of availableItems) {
            if (s && (s.isWorktree || s.worktree)) {
              const wtKey = String(s.worktree || 'worktree').trim();
              if (!worktreeGroups.has(wtKey)) worktreeGroups.set(wtKey, []);
              worktreeGroups.get(wtKey).push(s);
            } else {
              mainItems.push(s);
            }
          }
          const groupsHtml = [];
          if (mainItems.length > 0) {
            groupsHtml.push(`<optgroup label="Main Workspace">${mainItems.map(s => renderOptionHtml(s, currentVal, norm)).join('')}</optgroup>`);
          }
          for (const [wtName, items] of worktreeGroups.entries()) {
            groupsHtml.push(`<optgroup label="Worktree: ${escapeHtml(wtName)}">${items.map(s => renderOptionHtml(s, currentVal, norm)).join('')}</optgroup>`);
          }
          sel.innerHTML = groupsHtml.join('');
        }
      }
    }

    const badgeRoot = container.querySelector ? container.querySelector('#worktree-badge-root') : null;
    if (badgeRoot) {
      const activeItem = availableItems.find(s => norm(s.path) === currentVal) || availableItems[0] || null;
      badgeRoot.innerHTML = buildWorktreeBadgeHtml(activeItem);
    }
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.documentElement) {
    applyTheme(resolveInitialTheme());
  }

  const HeaderBar = {
    THEME_STORAGE_KEY,
    VALID_THEMES,
    render,
    escapeHtml,
    buildWorktreeBadgeHtml,
    getStoredTheme,
    setStoredTheme,
    applyTheme,
    resolveInitialTheme,
    toggleTheme,
    buildThemeToggleInnerHtml
  };

  if (typeof window !== 'undefined') {
    window.HeaderBar = HeaderBar;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HeaderBar;
  }
})();
