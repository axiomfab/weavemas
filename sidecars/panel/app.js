// Main Frontend Controller
(function() {
  let pipelineData = null;
  let selectedStageNum = null;
  let selectedContextDir = null;
  let pollInterval = null;

  function escapeHtml(str) {
    if (str === null || str === undefined || str === '') return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function getParams() {
    const parts = [];
    if (window.sidecar && window.sidecar.getWorkspaceUris) {
      try {
        const uris = await window.sidecar.getWorkspaceUris();
        if (uris && uris.length > 0) parts.push(`workspaceUri=${encodeURIComponent(uris[0])}`);
      } catch (e) {
        console.warn('Workspace URI lookup failed:', e);
      }
    }
    if (selectedContextDir) {
      parts.push(`contextDir=${encodeURIComponent(selectedContextDir)}`);
      parts.push(`showDir=${encodeURIComponent(selectedContextDir)}`);
    }
    return parts.length > 0 ? `?${parts.join('&')}` : '';
  }

  async function fetchJSON(url) {
    const params = await getParams();
    const fullUrl = url + params;
    const fetchFn = (window.sidecar && window.sidecar.fetch) ? window.sidecar.fetch.bind(window.sidecar) : window.fetch;
    const res = await fetchFn(fullUrl);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  }

  function getHostBridge() {
    return (typeof window !== 'undefined' && window.WeaveHostBridge && typeof window.WeaveHostBridge === 'object')
      ? window.WeaveHostBridge
      : null;
  }

  function applyPipelinePayload(nextPayload) {
    if (!nextPayload || typeof nextPayload !== 'object') return;
    pipelineData = nextPayload;
    const errRoot = typeof document !== 'undefined' ? document.getElementById('error-banner-root') : null;
    if (errRoot) {
      errRoot.style.display = 'none';
      errRoot.innerHTML = '';
    }
    if (typeof nextPayload.selectedContextDir === 'string' && nextPayload.selectedContextDir) {
      selectedContextDir = nextPayload.selectedContextDir;
    } else {
      const activeDir = nextPayload.contextDir || nextPayload.showDir || null;
      if (!selectedContextDir && activeDir) {
        selectedContextDir = activeDir;
      }
    }
    if (typeof nextPayload.focusStageNum === 'number' && selectedStageNum === null) {
      selectedStageNum = nextPayload.focusStageNum;
    }
    if (typeof nextPayload.focusCardId === 'string' && nextPayload.focusCardId && window.AgentPanel?.expandedCards) {
      window.AgentPanel.expandedCards.add(nextPayload.focusCardId);
    }
    renderUI();
  }

  async function refreshData() {
    const bridge = getHostBridge();
    if (bridge && typeof bridge.requestPipeline === 'function') {
      bridge.requestPipeline(selectedContextDir);
      return;
    }
    try {
      const nextPayload = await fetchJSON('/api/pipeline');
      applyPipelinePayload(nextPayload);
    } catch (err) {
      console.error('Error refreshing pipeline panel:', err);
      const errRoot = typeof document !== 'undefined' ? document.getElementById('error-banner-root') : null;
      if (errRoot) {
        const msg = err && err.message ? err.message : 'Connection failed';
        errRoot.style.display = 'block';
        errRoot.innerHTML = `<div class="weave-error-banner" role="alert"><span>Unable to sync pipeline (${escapeHtml(msg)}).</span><button type="button" class="agy-sync-btn" onclick="App.retrySync()"><span>Retry</span></button></div>`;
      }
    }
  }

  function renderHeader() {
    const headerContainer = document.getElementById('header-root');
    if (headerContainer && window.HeaderBar) {
      const bridge = getHostBridge();
      const runs = pipelineData ? (pipelineData.availableContexts || pipelineData.availableShows || []) : [];
      const activeDir = selectedContextDir || (pipelineData ? (pipelineData.contextDir || pipelineData.showDir) : null);
      const headerOptions = {
        shows: runs,
        contexts: runs,
        activePath: activeDir,
        onSelectShow: (dirPath) => {
          selectedContextDir = dirPath;
          if (bridge && typeof bridge.selectContext === 'function') {
            bridge.selectContext(dirPath);
          } else {
            refreshData();
          }
        },
        onSelectContext: (dirPath) => {
          selectedContextDir = dirPath;
          if (bridge && typeof bridge.selectContext === 'function') {
            bridge.selectContext(dirPath);
          } else {
            refreshData();
          }
        },
        onSync: refreshData
      };
      if (bridge) {
        if (typeof bridge.viewRawMarkdown === 'function') {
          headerOptions.onViewRawMarkdown = () => bridge.viewRawMarkdown(selectedContextDir || activeDir);
        }
        if (bridge.storage) {
          headerOptions.storage = bridge.storage;
        }
      }
      window.HeaderBar.render(headerContainer, headerOptions);
    }
  }

  function renderUI() {
    if (!pipelineData) return;

    // Header component
    renderHeader();

    // Stepper row
    const stepperRoot = document.getElementById('stepper-root');
    const stepperRow = document.getElementById('stages-stepper-row');
    const stepperLine = document.getElementById('stepper-line');
    if (!stepperRow) return;

    const stages = pipelineData.stages || {};
    const stageList = pipelineData.stageList || Object.values(stages);

    if (selectedStageNum && !stages[selectedStageNum]) {
      selectedStageNum = null;
    }

    if (stageList.length === 0) {
      if (stepperRoot) stepperRoot.style.display = 'none';
      if (stepperLine) stepperLine.style.display = 'none';
      stepperRow.innerHTML = '';
    } else {
      if (stepperRoot) stepperRoot.style.display = '';

      if (stepperLine) {
        if (stageList.length <= 1) {
          stepperLine.style.display = 'none';
        } else {
          stepperLine.style.display = 'block';
          const offsetPct = (100 / (2 * stageList.length)).toFixed(2);
          stepperLine.style.left = `${offsetPct}%`;
          stepperLine.style.right = `${offsetPct}%`;
        }
      }

      function hasAgentInProgress(nodes) {
        if (!nodes || !Array.isArray(nodes)) return false;
        for (const node of nodes) {
          if (!node) continue;
          if (node.type === 'agent') {
            const status = (node.frontmatter?.status || '').toLowerCase();
            const base = status.split('/')[0];
            if (base === 'in_progress' || base === 'revising' || base === 'running') return true;
          } else if (node.type === 'group' && node.children) {
            if (hasAgentInProgress(node.children)) return true;
          }
        }
        return false;
      }

      let stepperHtml = '';
      const stageAgentsList = pipelineData.stageAgents || [];
      for (const st of stageList) {
        const isSelected = (st.num === selectedStageNum);
        const stageAgentEntry = stageAgentsList.find(sa => sa.num === st.num);
        const hasAgentActive = stageAgentEntry ? hasAgentInProgress(stageAgentEntry.nodes || []) : false;

        let dotClass = 'stage-dot-pending';
        if (hasAgentActive) dotClass = 'stage-dot-flashing';
        else if (st.isCompleted) dotClass = 'stage-dot-completed';
        else if (st.isAwaitingReview || st.status === 'awaiting_review') dotClass = 'stage-dot-awaiting-review';
        else if (st.status === 'in_progress') dotClass = 'stage-dot-in-progress';
        else if (st.status === 'blocked') dotClass = 'stage-dot-blocked';
        if (isSelected) dotClass += ' stage-dot-selected';

        const safeNum = Number(st.num);
        stepperHtml += `
          <div class="weave-stepper-item flex-1 flex flex-col items-center group cursor-pointer text-center" role="button" tabindex="0" aria-pressed="${isSelected ? 'true' : 'false'}" onclick="App.selectStage(${safeNum})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.selectStage(${safeNum});}">
            <div class="stage-dot ${dotClass}" title="${escapeHtml(st.tag || st.name)}"></div>
            <span class="mt-2 text-[11px] font-bold ${isSelected ? 'weave-stepper-title-active text-white' : 'weave-stepper-title text-slate-300'} text-center">Stage ${safeNum}</span>
            <span class="text-[10px] text-slate-500 text-center truncate max-w-[70px]" title="${escapeHtml(st.name)}">${escapeHtml(st.name)}</span>
          </div>
        `;
      }
      stepperRow.innerHTML = stepperHtml;
    }

    // Mount all discovered pipeline agents panel (filtered if a stage is selected)
    // Mount all discovered pipeline agents panel (filtered if a stage is selected)
    const agentsContainer = document.getElementById('agents-root') || document.getElementById('pipeline-agents-container');
    const panel = window.AgentPanel || window.ConceptTracker;
    if (agentsContainer && panel) {
      panel.render(agentsContainer, { stages: pipelineData.stageAgents || [] }, selectedStageNum);
    }
  }

  window.App = {
    selectStage(num) {
      if (selectedStageNum === num) {
        selectedStageNum = null; // Toggle filter off
      } else {
        selectedStageNum = num;
        if (window.AgentPanel?.collapsedStages) {
          window.AgentPanel.collapsedStages.delete(`stage_${num}`);
        }
      }
      renderUI();
    },
    refresh() {
      renderUI();
    },
    retrySync() {
      refreshData();
    },
    applyPayload: applyPipelinePayload,
    isPollingActive() {
      return pollInterval !== null;
    }
  };

  function bootApp() {
    const bridge = getHostBridge();
    if (bridge) {
      if (typeof bridge.initialContextDir === 'string' && bridge.initialContextDir) {
        selectedContextDir = bridge.initialContextDir;
      }
      if (typeof bridge.onPipelineUpdate === 'function') {
        bridge.onPipelineUpdate((payload) => {
          applyPipelinePayload(payload);
        });
      }
      renderHeader();
      if (bridge.initialPayload && typeof bridge.initialPayload === 'object') {
        applyPipelinePayload(bridge.initialPayload);
      }
      if (typeof bridge.notifyReady === 'function') {
        bridge.notifyReady(selectedContextDir);
      }
      return;
    }

    renderHeader();
    const agentsContainer = document.getElementById('agents-root');
    if (agentsContainer && !pipelineData) {
      agentsContainer.innerHTML = '<div class="weave-empty-state p-6 rounded-xl border border-slate-800 bg-slate-900/30 text-center text-xs text-slate-500 font-mono">Loading pipeline status...</div>';
    }
    refreshData();
    pollInterval = setInterval(() => {
      if (typeof window.getSelection === 'function' && window.getSelection().toString().trim().length > 0) {
        return;
      }
      refreshData();
    }, 4000);
  }

  if (typeof document !== 'undefined') {
    if (typeof document.readyState === 'string' && document.readyState !== 'loading') {
      bootApp();
    } else if (typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', bootApp);
    }
  }
})();
