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

  function render(container, options) {
    if (!container || typeof container !== 'object') {
      throw new TypeError('CRITICAL: container element is required and must be an object');
    }
    if (!options || typeof options !== 'object') {
      throw new TypeError('CRITICAL: options object is required and must be an object');
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
              <div class="mt-1 flex items-center">
                <select id="show-select" class="bg-slate-900 border border-slate-700 text-slate-200 rounded px-1.5 py-0.5 text-[11px] max-w-[220px] md:max-w-[320px] truncate focus:outline-hidden focus:border-indigo-500">
                  <option value="">Detecting runs...</option>
                </select>
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
    if (sel) {
      const norm = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
      const currentVal = norm(activePath || sel.value);

      if (availableItems.length === 0) {
        sel.innerHTML = '<option value="">No runs in output/</option>';
      } else {
        sel.innerHTML = availableItems.map(s => {
          const isSel = norm(s.path) === currentVal;
          const label = s.displayPath || s.title || (s.name ? `output\\${s.name}` : s.path);
          return `<option value="${escapeHtml(s.path)}" ${isSel ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        }).join('');
      }
    }
  }

  const HeaderBar = { render, escapeHtml };

  if (typeof window !== 'undefined') {
    window.HeaderBar = HeaderBar;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HeaderBar;
  }
})();
