// Header Bar Component - WeaveMAS Panel
(function() {
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
   *   onSync?: () => void
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

    const { shows = [], contexts = shows, activePath = null, onSelectShow, onSelectContext = onSelectShow, onSync } = options;
    const availableItems = (Array.isArray(contexts) && contexts.length > 0) ? contexts : (Array.isArray(shows) ? shows : []);

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
      const selectCallback = (typeof onSelectContext === 'function') ? onSelectContext : onSelectShow;
      if (sel && typeof selectCallback === 'function' && sel.addEventListener) {
        sel.addEventListener('change', (e) => selectCallback(e.target.value));
      }
      const syncBtn = container.querySelector ? container.querySelector('#sync-btn') : null;
      if (syncBtn && typeof onSync === 'function' && syncBtn.addEventListener) {
        syncBtn.addEventListener('click', () => onSync());
      }
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

  const HeaderBar = { render, escapeHtml, buildWorktreeBadgeHtml };

  if (typeof window !== 'undefined') {
    window.HeaderBar = HeaderBar;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HeaderBar;
  }
})();
