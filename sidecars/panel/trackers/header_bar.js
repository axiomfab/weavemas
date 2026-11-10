// Header Bar Component - WeaveMAS Panel
(function() {
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderOptionHtml(s, currentVal, norm) {
    const isSel = norm(s.path) === currentVal;
    const label = s.displayPath || s.title || (s.name ? `runs\\${s.name}` : s.path);
    return `<option value="${escapeHtml(s.path)}" ${isSel ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }

  function buildWorktreeBadgeHtml(activeItem) {
    if (!activeItem || (!activeItem.isWorktree && !activeItem.worktree)) {
      return '';
    }
    const wtName = String(activeItem.worktree || 'worktree').trim();
    const branchSvg = `<svg class="w-3 h-3 text-amber-300 fill-current inline-block shrink-0" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"></path></svg>`;
    return `<span id="worktree-badge" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0" title="Executing in Git Worktree: ${escapeHtml(wtName)}">${branchSvg}<span>${escapeHtml(wtName)}</span></span>`;
  }

  function render(container, options) {
    if (!container || typeof container !== 'object') {
      throw new TypeError('CRITICAL: container element is required and must be an object');
    }
    if (!options || typeof options !== 'object') {
      throw new TypeError('CRITICAL: options object is required and must be an object');
    }

    if (options.shows !== undefined && !Array.isArray(options.shows)) {
      throw new TypeError('CRITICAL: shows must be an array');
    }
    const { shows = [], contexts = shows, activePath = null, onSelectShow, onSelectContext = onSelectShow, onSync } = options;
    const availableItems = (Array.isArray(contexts) && contexts.length > 0) ? contexts : (Array.isArray(shows) ? shows : []);

    let headerEl = container.querySelector ? container.querySelector('header') : null;
    if (!headerEl) {
      container.innerHTML = `
        <header class="p-3.5 rounded-xl bg-[#0f172a] border border-[#1e293b] flex items-center justify-between">
          <div class="flex items-center space-x-2.5">
            <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 via-indigo-500 to-cyan-500 flex items-center justify-center shadow-md p-1">
              <svg class="w-4.5 h-4.5 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 7C7 7 8 17 12 17C16 17 17 7 21 7" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>
                <path d="M3 17C7 17 8 7 12 7C16 7 17 17 21 17" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
                <circle cx="3" cy="7" r="1.6" fill="#38bdf8"/>
                <circle cx="12" cy="17" r="1.6" fill="#38bdf8"/>
                <circle cx="21" cy="7" r="1.6" fill="#38bdf8"/>
                <circle cx="3" cy="17" r="1.6" fill="#ffffff"/>
                <circle cx="12" cy="7" r="1.6" fill="#ffffff"/>
                <circle cx="21" cy="17" r="1.6" fill="#ffffff"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0 pr-2">
              <div class="flex items-center gap-1.5">
                <h1 class="text-xs font-bold tracking-wide text-white">WeaveMAS UI</h1>
                <span class="pulsing-dot" title="Live Auto-Sync Active"></span>
              </div>
              <div class="mt-1 flex items-center gap-1.5 flex-wrap">
                <select id="show-select" class="bg-slate-900 border border-slate-700 text-slate-200 rounded px-1.5 py-0.5 text-[11px] max-w-[220px] md:max-w-[320px] truncate focus:outline-hidden focus:border-indigo-500">
                  <option value="">Detecting runs...</option>
                </select>
                <span id="worktree-badge-root"></span>
              </div>
            </div>
          </div>
          <button id="sync-btn" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-[11px] transition cursor-pointer">
            Sync
          </button>
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
