// Stage Panel Frontend Module
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

  function render(container, stageInfo) {
    if (!container || !stageInfo) return;
    const isCompleted = stageInfo.isCompleted;
    const isAwaitingReview = Boolean(stageInfo.isAwaitingReview || stageInfo.status === 'awaiting_review');
    const isInProgress = stageInfo.status === 'in_progress';
    const isBlocked = stageInfo.status === 'blocked';

    let badgeClass = 'weave-badge weave-badge-neutral bg-slate-800 text-slate-400 border border-slate-700';
    if (isCompleted) {
      badgeClass = 'weave-badge weave-badge-completed bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    } else if (isAwaitingReview) {
      badgeClass = 'weave-badge weave-badge-review bg-lime-500/15 text-lime-300 border border-lime-500/30';
    } else if (isBlocked) {
      badgeClass = 'weave-badge weave-badge-blocked bg-rose-500/15 text-rose-300 border border-rose-500/30';
    } else if (isInProgress) {
      badgeClass = 'weave-badge vivid-pulse';
    }

    const stateColorClass = isCompleted
      ? 'text-emerald-400'
      : (isAwaitingReview
        ? 'text-lime-400'
        : (isInProgress
          ? 'text-amber-400'
          : (isBlocked ? 'text-rose-400' : 'text-slate-400')));

    const html = `
      <div class="weave-stage-panel-wrap mt-4 pt-4 border-t border-slate-800/80">
        <div class="weave-stage-panel p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div class="flex items-center justify-between">
            <span class="px-2 py-0.5 rounded text-xs font-mono font-bold ${badgeClass}">${escapeHtml(stageInfo.tag)}</span>
            <span class="text-xs font-mono text-slate-400">${escapeHtml(stageInfo.outputFile)}</span>
          </div>
          <div>
            <h3 class="text-sm font-bold text-white">${escapeHtml(stageInfo.title)}</h3>
            <p class="text-xs text-slate-400 mt-1 leading-relaxed">${escapeHtml(stageInfo.desc)}</p>
          </div>
          <div class="weave-card-toolbar pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-500">
            <span>Primary Output: <strong class="text-slate-300">${escapeHtml(stageInfo.outputFile)}</strong></span>
            <span>State: <strong class="${stateColorClass}">${escapeHtml(stageInfo.status)}</strong></span>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  const stageApi = { render };
  if (typeof window !== 'undefined') {
    window.StagePanel = stageApi;
    window.GenericTracker = stageApi;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = stageApi;
  }
})();
