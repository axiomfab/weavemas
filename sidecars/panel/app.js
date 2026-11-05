// Main Frontend Controller
(function() {
  let pipelineData = null;
  let selectedStageNum = null;
  let selectedContextDir = null;
  let pollInterval = null;

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

  async function refreshData() {
    try {
      pipelineData = await fetchJSON('/api/pipeline');
      
      const activeDir = pipelineData ? (pipelineData.contextDir || pipelineData.showDir) : null;
      if (!selectedContextDir && activeDir) {
        selectedContextDir = activeDir;
      }

      renderUI();
    } catch (err) {
      console.error('Error refreshing pipeline panel:', err);
    }
  }

  function renderUI() {
    if (!pipelineData) return;

    // Header component
    const headerContainer = document.getElementById('header-root');
    if (headerContainer && window.HeaderBar) {
      const runs = pipelineData.availableContexts || pipelineData.availableShows || [];
      const activeDir = selectedContextDir || pipelineData.contextDir || pipelineData.showDir;
      window.HeaderBar.render(headerContainer, {
        shows: runs,
        contexts: runs,
        activePath: activeDir,
        onSelectShow: (dirPath) => {
          selectedContextDir = dirPath;
          refreshData();
        },
        onSelectContext: (dirPath) => {
          selectedContextDir = dirPath;
          refreshData();
        },
        onSync: refreshData
      });
    }

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
        else if (st.status === 'in_progress') dotClass = 'stage-dot-in-progress';
        if (isSelected) dotClass += ' stage-dot-selected';

        stepperHtml += `
          <div class="flex-1 flex flex-col items-center group cursor-pointer text-center" onclick="App.selectStage(${st.num})">
            <div class="stage-dot ${dotClass}"></div>
            <span class="mt-2 text-[11px] font-bold ${isSelected ? 'text-white' : 'text-slate-300'} text-center">Stage ${st.num}</span>
            <span class="text-[10px] text-slate-500 text-center truncate max-w-[70px]" title="${st.name}">${st.name}</span>
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
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    refreshData();
    pollInterval = setInterval(() => {
      if (typeof window.getSelection === 'function' && window.getSelection().toString().trim().length > 0) {
        return;
      }
      refreshData();
    }, 4000);
  });
})();
