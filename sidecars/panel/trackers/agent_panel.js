// Pipeline Agents Panel Frontend Module - Dynamic WeaveMAS Discovery Across All Stages
(function() {
  const expandedCards = new Set();
  const expandedGroups = new Set();
  const cardViewModes = new Map();
  const pendingScrollBottom = new Set();

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function formatAgentTitle(id) {
    if (!id || typeof id !== 'string') return 'Agent';
    const clean = id.replace(/youtube/i, 'YouTube_').replace(/factchecker/i, 'Fact_Checker');
    return clean.split(/[_-]/).filter(Boolean).map(p => (p.toLowerCase() === 'youtube' ? 'YouTube' : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())).join(' ');
  }

  function getAgentIcon() { return ''; }

  function getStatusBadge(status, cardId = '') {
    const raw = (status || 'pending').toLowerCase();
    const [base, sub] = raw.split('/');
    const label = sub ? `${base.replace(/_/g, ' ')}: ${sub.replace(/_/g, ' ')}` : base.replace(/_/g, ' ');
    let cls = 'bg-slate-800 text-slate-400 border border-slate-700/50';
    if (base === 'in_progress' || base === 'revising' || base === 'running') cls = 'vivid-pulse text-[10px] font-bold border font-mono';
    else if (base === 'waiting') cls = 'bg-amber-500/10 text-amber-300 border border-amber-500/30 font-medium font-mono';
    else if (base === 'completed' || base === 'approved') cls = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold font-mono';
    else if (base === 'blocked' || base === 'error' || base === 'failed') cls = 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold font-mono';
    const cursor = cardId ? 'cursor-pointer hover:opacity-85' : '';
    const attr = cardId ? `data-status-toggle="${escapeHtml(cardId)}"` : '';
    return `<span class="${cls} px-2 py-0.5 rounded text-[10px] ${cursor} transition-all" ${attr}>${escapeHtml(label)}</span>`;
  }

  function getOutputsList(fm) {
    if (!fm) return [];
    const raw = fm.outputs !== undefined ? fm.outputs : fm.deliverable;
    if (!raw || raw === 'null' || raw === 'None') return [];
    if (Array.isArray(raw)) return raw.map(s => String(s).trim()).filter(s => s && s !== 'null' && s !== 'None');
    return [String(raw).trim()];
  }

  function getAgentValueChip(fm, cardId = '', isDeliverableActive = false) {
    if (!fm) return '';
    const outs = getOutputsList(fm);
    if (outs.length > 0) {
      const activeCls = isDeliverableActive
        ? 'bg-indigo-500/30 text-white border-indigo-400 ring-1 ring-indigo-400'
        : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20 hover:bg-indigo-500/25 hover:text-white';
      return `<button type="button" class="font-mono text-[11px] border px-1.5 py-0.5 rounded cursor-pointer transition-all ${activeCls}" data-deliverable-toggle="${escapeHtml(cardId)}">📄 ${escapeHtml(outs.join(', '))}</button>`;
    }
    if (fm.progress) return `${escapeHtml(fm.progress)} Verified`;
    if (fm.total_acts != null && fm.total_segments != null) return `${fm.total_acts} Acts • ${fm.total_segments} Segments`;
    if (fm.words != null) return `${fm.words} words`;
    return '';
  }

  function formatFrontmatterOnly(fm, statusContent, inputStatuses = []) {
    let effectiveFm = fm;
    if ((!effectiveFm || typeof effectiveFm !== 'object' || Object.keys(effectiveFm).length === 0) && statusContent && typeof statusContent === 'string') {
      const match = statusContent.replace(/^\uFEFF/, '').trimStart().match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (match) return `<pre class="font-mono text-xs">${escapeHtml(`---\n${match[1].trim()}\n---`)}</pre>`;
    }
    if (statusContent && typeof statusContent === 'string') {
      const match = statusContent.replace(/^\uFEFF/, '').trimStart().match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (match) {
        const parsed = {};
        let curList = null;
        for (const line of match[1].split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          if (curList && trimmed.startsWith('-')) {
            parsed[curList].push(trimmed.slice(1).trim().replace(/^["']|["']$/g, ''));
            continue;
          }
          curList = null;
          const cIdx = trimmed.indexOf(':');
          if (cIdx === -1) continue;
          const key = trimmed.slice(0, cIdx).trim();
          const val = trimmed.slice(cIdx + 1).trim();
          if (val === '' || val === '[]') { parsed[key] = []; curList = (val === '') ? key : null; }
          else parsed[key] = val.replace(/^["']|["']$/g, '');
        }
        if (Object.keys(parsed).length > 0) effectiveFm = Object.assign({}, parsed, effectiveFm);
      }
    }
    if (!effectiveFm || typeof effectiveFm !== 'object' || Object.keys(effectiveFm).length === 0) return 'No frontmatter available.';

    const inputStatusMap = new Map();
    if (Array.isArray(inputStatuses)) {
      for (const st of inputStatuses) {
        if (st && st.raw) inputStatusMap.set(st.raw.trim(), st);
      }
    }

    const lines = ['<span class="text-slate-500 font-mono">---</span>'];
    for (const [k, v] of Object.entries(effectiveFm)) {
      if (v === undefined) continue;
      if (k === 'inputs' && Array.isArray(v)) {
        if (v.length === 0) lines.push(`<span class="text-indigo-300 font-mono">inputs</span>: <span class="text-slate-400 font-mono">[]</span>`);
        else {
          lines.push(`<span class="text-indigo-300 font-mono">inputs</span>:`);
          for (const rawItem of v) {
            const itemStr = String(rawItem).trim();
            const info = inputStatusMap.get(itemStr) || { isWildcard: itemStr.includes('*'), exists: false, count: 0 };
            const isW = info.isWildcard;
            const cls = isW ? (info.count > 0 ? 'text-amber-300 bg-amber-500/10 border-amber-500/30' : 'text-rose-400 bg-rose-500/10 border-rose-500/30') : (info.exists ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : 'text-rose-400 bg-rose-500/10 border-rose-500/30');
            const badge = isW ? (info.count > 0 ? ` (${info.count})` : ' (0)') : '';
            lines.push(`  <span class="text-slate-500 font-mono">-</span> <span class="inline-flex items-center px-1.5 py-0.2 rounded border font-mono text-[11px] ${cls}">"${escapeHtml(itemStr)}"${badge}</span>`);
          }
        }
      } else if (k === 'outputs') {
        const outArr = Array.isArray(v) ? v : (v && v !== 'null' ? [v] : []);
        if (outArr.length === 0) lines.push(`<span class="text-indigo-300 font-mono">outputs</span>: <span class="text-slate-400 font-mono">[]</span>`);
        else { lines.push(`<span class="text-indigo-300 font-mono">outputs</span>:`); for (const it of outArr) lines.push(`  <span class="text-slate-500 font-mono">-</span> <span class="text-emerald-300 font-mono">"${escapeHtml(String(it))}"</span>`); }
      } else if (v === null) lines.push(`<span class="text-indigo-300 font-mono">${escapeHtml(k)}</span>: <span class="text-slate-500 font-mono">null</span>`);
      else if (Array.isArray(v)) {
        if (v.length === 0) lines.push(`<span class="text-indigo-300 font-mono">${escapeHtml(k)}</span>: <span class="text-slate-400 font-mono">[]</span>`);
        else { lines.push(`<span class="text-indigo-300 font-mono">${escapeHtml(k)}</span>:`); for (const it of v) lines.push(`  <span class="text-slate-500 font-mono">-</span> <span class="text-emerald-300 font-mono">"${escapeHtml(String(it))}"</span>`); }
      } else if (typeof v === 'string') lines.push(`<span class="text-indigo-300 font-mono">${escapeHtml(k)}</span>: <span class="text-amber-200 font-mono">"${escapeHtml(v)}"</span>`);
      else lines.push(`<span class="text-indigo-300 font-mono">${escapeHtml(k)}</span>: <span class="text-cyan-300 font-mono">${escapeHtml(String(v))}</span>`);
    }
    lines.push('<span class="text-slate-500 font-mono">---</span>');
    return lines.join('\n');
  }

  function formatHumanLogBody(rawBody) {
    const rt = (typeof window !== 'undefined' && window.RuntimeTracker) || (typeof RuntimeTracker !== 'undefined' ? RuntimeTracker : null);
    return rt?.formatHumanLogBody ? rt.formatHumanLogBody(rawBody) : rawBody;
  }

  function getShowrunnerChip(fm) { return (fm?.total_acts != null && fm?.total_segments != null) ? `${fm.total_acts} Acts • ${fm.total_segments} Segments` : ''; }
  function getSourcerChip(fm) { return fm?.progress ? `${fm.progress} Verified` : ''; }

  function getGroupSummary(node) {
    if (!node) return { total: 0, completed: 0, inProgress: 0 };
    if (node.type === 'agent') {
      const [base] = (node.frontmatter?.status || 'pending').toLowerCase().split('/');
      return { total: 1, completed: (base === 'completed' || base === 'approved') ? 1 : 0, inProgress: (base === 'in_progress' || base === 'revising' || base === 'running') ? 1 : 0 };
    }
    if (node.type === 'group' && Array.isArray(node.children)) {
      return node.children.reduce((acc, c) => { const s = getGroupSummary(c); return { total: acc.total + s.total, completed: acc.completed + s.completed, inProgress: acc.inProgress + s.inProgress }; }, { total: 0, completed: 0, inProgress: 0 });
    }
    return { total: 1, completed: 0, inProgress: 0 };
  }

  function countLeaves(node) { return getGroupSummary(node).total; }

  function getGroupSummaryChip(node) {
    const s = getGroupSummary(node);
    const label = `${s.completed}/${s.total} completed`;
    if (s.total > 0 && s.completed === s.total) return `<span class="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded text-[10px] font-semibold font-mono">${escapeHtml(label)}</span>`;
    if (s.inProgress > 0) return `<span class="vivid-pulse px-2 py-0.5 rounded text-[10px] font-bold border font-mono">${escapeHtml(label)}</span>`;
    return `<span class="bg-slate-800 text-slate-400 border border-slate-700/50 px-2 py-0.5 rounded text-[10px] font-mono">${escapeHtml(label)}</span>`;
  }

  function renderAgentCard(cardId, title, ...args) {
    const [agentData, customChip] = (args.length >= 2 && typeof args[0] === 'string') ? [args[1], args[2]] : [args[0], args[1]];
    const isOpen = expandedCards.has(cardId);
    const viewMode = cardViewModes.get(cardId) || 'updates';
    const fm = agentData?.frontmatter || {};
    const body = agentData?.body || '';
    const status = fm.status || 'pending';
    const convId = fm.conversation_id;
    const rtTracker = (typeof window !== 'undefined' && window.RuntimeTracker) || (typeof RuntimeTracker !== 'undefined' ? RuntimeTracker : null);
    const runtimeBadge = rtTracker ? rtTracker.getRuntimeBadgeHtml(body, status) : '';
    let updatedLabelHtml = '';
    if (fm.updated_at) {
      const rel = rtTracker?.formatRelativeTime ? rtTracker.formatRelativeTime(fm.updated_at) : new Date(fm.updated_at).toLocaleTimeString();
      const exactTime = new Date(fm.updated_at).toLocaleTimeString();
      updatedLabelHtml = `<span title="${escapeHtml(exactTime)}" data-relative-time="${escapeHtml(fm.updated_at)}">Updated: ${escapeHtml(rel)}</span>`;
    }
    const chatBtn = convId ? `<button type="button" class="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 font-medium transition-colors" data-conv-id="${escapeHtml(convId)}">💬 Open Subagent Chat</button><span class="text-slate-600">(${escapeHtml(convId.slice(0, 8))}...)</span>` : '';

    const outs = getOutputsList(fm);
    const isDeliverableMode = viewMode === 'deliverable' && outs.length > 0;
    const delivLabel = outs.join(', ');

    let headerActionHtml = '', mainContentHtml = '';
    if (isDeliverableMode) {
      headerActionHtml = `<div class="flex items-center gap-2 font-mono"><span class="text-indigo-300 text-[11px] font-semibold">📄 ${escapeHtml(delivLabel)}</span><span class="text-slate-500 text-[11px]">(Deliverable)</span>${runtimeBadge}${chatBtn}</div><button type="button" class="text-[11px] text-slate-400 hover:text-indigo-300 font-mono underline" data-status-toggle="${escapeHtml(cardId)}">View Updates &darr;</button>`;
      const delivContent = (agentData?.deliverableContent != null && agentData.deliverableContent.trim() !== '') ? agentData.deliverableContent : (agentData?.deliverableContent === '' ? 'Deliverable is empty.' : `Deliverable (${escapeHtml(delivLabel)}) has not been generated yet.`);
      mainContentHtml = `<div data-agent-body="${escapeHtml(cardId)}" class="p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed selection:bg-indigo-500/30">${escapeHtml(delivContent)}</div>`;
    } else {
      headerActionHtml = `<div class="flex items-center gap-2 font-mono">${runtimeBadge}${chatBtn}</div><div class="text-[11px] text-slate-500 font-mono">${updatedLabelHtml}</div>`;
      const fmContent = formatFrontmatterOnly(fm, agentData?.statusContent, agentData?.inputStatuses);
      const hasFm = fmContent && fmContent !== 'No frontmatter available.';
      const formattedLog = formatHumanLogBody(body);
      if (hasFm || formattedLog) {
        const logSection = formattedLog || `<span class="text-slate-500 italic">No logs recorded yet. Agent is pending or starting up...</span>`;
        const combined = hasFm ? `${fmContent}\n\n${logSection}` : formattedLog;
        mainContentHtml = `<div data-agent-body="${escapeHtml(cardId)}" class="p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed selection:bg-indigo-500/30">${combined}</div>`;
      } else {
        mainContentHtml = `<div data-agent-body="${escapeHtml(cardId)}" class="py-6 text-center text-xs text-slate-500 italic font-mono">No frontmatter available. No logs recorded yet. Agent is pending or starting up...</div>`;
      }
    }

    return `<div class="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm transition-all"><div class="p-3 bg-slate-900/80 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 transition-colors" data-concept-toggle="${escapeHtml(cardId)}"><div class="flex items-center gap-2.5"><span class="text-slate-400 text-xs transform transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}">▶</span><span class="font-bold text-xs text-slate-200 tracking-wide">${escapeHtml(title)}</span></div><div class="flex items-center gap-2 font-mono text-[11px]">${customChip ? `<span class="text-slate-400 mr-1">${customChip} &bull;</span>` : ''}${getStatusBadge(status, cardId)}</div></div>${isOpen ? `<div class="p-4 border-t border-slate-800/70 bg-slate-950/40 space-y-3"><div class="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/60 pb-2">${headerActionHtml}</div>${mainContentHtml}</div>` : ''}</div>`;
  }

  function getNodeCreationTime(node) {
    if (!node) return 0;
    if (typeof node.createdAt === 'number' && node.createdAt > 0) return node.createdAt;
    if (node.type === 'group' && Array.isArray(node.children) && node.children.length > 0) {
      return Math.min(...node.children.map(getNodeCreationTime));
    }
    return 0;
  }

  function renderNode(node, stageNum) {
    if (node.type === 'group') {
      const groupId = (stageNum != null) ? `grp_s${stageNum}_${node.id}` : `grp_${node.id}`;
      const isExpanded = expandedGroups.has(groupId);
      const title = formatAgentTitle(node.name || node.id);
      const sortedChildren = (node.children || []).slice().sort((a, b) => {
        const ta = getNodeCreationTime(a);
        const tb = getNodeCreationTime(b);
        if (ta && tb && ta !== tb) return ta - tb;
        return (a.name || a.id).localeCompare(b.name || b.id);
      });
      return `<div class="rounded-xl border border-slate-800/80 bg-slate-900/30 p-2.5 space-y-2 transition-all"><div class="flex items-center justify-between cursor-pointer hover:bg-slate-800/40 p-1 rounded-lg transition-colors" data-group-toggle="${escapeHtml(groupId)}"><div class="flex items-center gap-2"><span class="text-slate-400 text-xs transform transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}">▶</span><span class="font-bold text-xs text-white tracking-wide">${escapeHtml(title)}</span></div>${getGroupSummaryChip(node)}</div>${isExpanded ? `<div class="space-y-2 mt-1.5">${sortedChildren.map(child => renderNode(child, stageNum)).join('')}</div>` : ''}</div>`;
    }
    const cardId = (stageNum != null) ? `card_s${stageNum}_${node.id}` : `card_${node.id}`;
    const title = formatAgentTitle(node.name || node.id);
    const isDelivActive = cardViewModes.get(cardId) === 'deliverable';
    const chip = getAgentValueChip(node.frontmatter, cardId, isDelivActive);
    return renderAgentCard(cardId, title, node, chip);
  }

  function render(container, data, filterStageNum = null) {
    if (!container) return;
    let stageList = Array.isArray(data?.stages) ? data.stages : (data?.agents ? [{ num: 2, name: 'Concept & Outline', agents: data.agents }] : []);
    if (filterStageNum !== null && filterStageNum !== undefined) stageList = stageList.filter(s => s.num === filterStageNum);

    let totalAgents = 0;
    stageList.forEach(st => { (st.nodes || Object.values(st.agents || {})).forEach(n => { totalAgents += countLeaves(n); }); });

    let contentHtml = '';
    if (stageList.length === 0 || totalAgents === 0) {
      contentHtml = `<div class="p-6 rounded-xl border border-slate-800 bg-slate-900/30 text-center text-xs text-slate-500 font-mono">No subagents discovered across pipeline stages yet.</div>`;
    } else {
      contentHtml = stageList.map(st => {
        const nodeList = (st.nodes || Object.values(st.agents || {})).filter(n => n.type === 'group' || !n.frontmatter?.type || n.frontmatter.type === 'agent');
        nodeList.sort((a, b) => {
          const ta = getNodeCreationTime(a);
          const tb = getNodeCreationTime(b);
          if (ta && tb && ta !== tb) return ta - tb;
          return (a.name || a.id).localeCompare(b.name || b.id);
        });
        const activeCount = nodeList.reduce((acc, n) => acc + countLeaves(n), 0);
        if (nodeList.length === 0 || activeCount === 0) return '';
        const rtTracker = (typeof window !== 'undefined' && window.RuntimeTracker) || null;
        const stageRt = rtTracker?.calculateStageRuntime ? rtTracker.calculateStageRuntime(nodeList) : null;
        const timerHtml = (stageRt && stageRt.seconds > 0)
          ? `<span class="inline-flex items-center gap-1 text-[11px] font-mono ${stageRt.isRunning ? 'text-slate-400' : 'text-slate-500'}"><span class="text-[10px]">⏱️</span> ${escapeHtml(stageRt.formatted)}</span>`
          : '';
        const stageHeader = (st.num != null && st.num > 0)
          ? `<div class="flex items-center gap-1.5 shrink-0"><span class="text-xs font-bold text-white tracking-wide">Stage ${st.num}</span><span class="text-xs font-normal text-slate-400">- ${escapeHtml(st.name)}</span>${timerHtml ? `<span class="text-slate-600">•</span>${timerHtml}` : ''}</div>`
          : (st.name ? `<div class="flex items-center gap-1.5 shrink-0"><span class="text-xs font-bold text-white tracking-wide">${escapeHtml(st.name)}</span>${timerHtml ? `<span class="text-slate-600">•</span>${timerHtml}` : ''}</div>` : '');
        return `<div class="space-y-2.5"><div class="flex items-center gap-3 my-2">${stageHeader}<div class="flex-1 h-px bg-slate-800"></div><span class="text-[11px] text-slate-500 font-mono shrink-0">${activeCount} Agent${activeCount === 1 ? '' : 's'}</span></div><div class="space-y-2 pl-0.5">${nodeList.map(node => renderNode(node, st.num)).join('')}</div></div>`;
      }).filter(Boolean).join('');
    }

    const prevScrolls = new Map();
    container.querySelectorAll('[data-agent-body]').forEach(el => {
      const cid = el.getAttribute('data-agent-body');
      const wasAtBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 30;
      prevScrolls.set(cid, { scrollTop: el.scrollTop, wasAtBottom, text: el.textContent });
    });

    container.innerHTML = `<div class="space-y-4">${contentHtml}</div>`;

    container.querySelectorAll('[data-group-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-group-toggle');
        if (expandedGroups.has(id)) expandedGroups.delete(id); else expandedGroups.add(id);
        render(container, data, filterStageNum);
      });
    });

    container.querySelectorAll('[data-concept-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-concept-toggle');
        if (expandedCards.has(id)) expandedCards.delete(id);
        else { expandedCards.add(id); pendingScrollBottom.add(id); }
        render(container, data, filterStageNum);
      });
    });

    container.querySelectorAll('[data-deliverable-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-deliverable-toggle');
        expandedCards.add(id);
        cardViewModes.set(id, 'deliverable');
        render(container, data, filterStageNum);
      });
    });

    container.querySelectorAll('[data-status-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-status-toggle');
        expandedCards.add(id);
        cardViewModes.set(id, 'updates');
        pendingScrollBottom.add(id);
        render(container, data, filterStageNum);
      });
    });

    container.querySelectorAll('[data-conv-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const convId = btn.getAttribute('data-conv-id');
        if (window.sidecar?.ui?.toggleConversation) window.sidecar.ui.toggleConversation(convId);
      });
    });

    container.querySelectorAll('[data-agent-body]').forEach(el => {
      const cid = el.getAttribute('data-agent-body');
      const isUpdates = (cardViewModes.get(cid) || 'updates') === 'updates';
      const prev = prevScrolls.get(cid);
      if (isUpdates) {
        const hasNewText = Boolean(prev && prev.text !== el.textContent);
        const wasAtBottom = prev ? prev.wasAtBottom : true;
        if (pendingScrollBottom.has(cid) || hasNewText || wasAtBottom) {
          el.scrollTop = el.scrollHeight;
        } else if (prev) {
          el.scrollTop = prev.scrollTop;
        }
      } else {
        if (prev && prev.text === el.textContent) el.scrollTop = prev.scrollTop;
        else el.scrollTop = 0;
      }
    });
    pendingScrollBottom.clear();
  }

  const trackerApi = {
    render, renderAllAgents: render, formatAgentTitle, formatFrontmatterOnly, formatHumanLogBody,
    getAgentIcon, getStatusBadge, getAgentValueChip, getShowrunnerChip, getSourcerChip,
    getGroupSummary, getGroupSummaryChip, expandedCards, expandedGroups, cardViewModes, pendingScrollBottom
  };

  if (typeof window !== 'undefined') {
    window.AgentPanel = window.ConceptTracker = window.AgentsTracker = trackerApi;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = trackerApi;
})();
