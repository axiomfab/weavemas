// Pipeline Agents Panel Frontend Module - Dynamic WeaveMX Discovery Across All Stages
(function() {
  const expandedCards = new Set(), expandedGroups = new Set(), collapsedStages = new Set();
  const cardViewModes = new Map(), pendingScrollBottom = new Set();
  const ICON_CHEVRON = '<svg class="weave-icon weave-chevron" data-weave-icon="chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.25 4.5L9.75 8l-3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_CLOCK = '<svg class="weave-icon weave-clock-icon" data-weave-icon="clock" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.75" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.75V8l2.25 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_FILE = '<svg class="weave-icon weave-file-icon" data-weave-icon="file" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.25 2.25h5.25L12.75 5.5v8.25a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75V3a.75.75 0 0 1 .75-.75Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.5 2.25V5.5h3.25" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_COPY = '<svg class="weave-icon weave-copy-icon" data-weave-icon="copy" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5.5" y="5.5" width="7.75" height="8.25" rx="1.25" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 5.5V3.5a1.25 1.25 0 0 0-1.25-1.25H4A1.25 1.25 0 0 0 2.75 3.5v6.25A1.25 1.25 0 0 0 4 11h1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_CHAT = '<svg class="weave-icon weave-chat-icon" data-weave-icon="chat" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.75 3.75a1.5 1.5 0 0 1 1.5-1.5h7.5a1.5 1.5 0 0 1 1.5 1.5v5.5a1.5 1.5 0 0 1-1.5 1.5H6.5l-2.75 2.25v-2.25h-.5a1.5 1.5 0 0 1-1.5-1.5v-5.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const ICON_CHECK = '<svg class="weave-icon weave-check-icon" data-weave-icon="check" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_ARROW_DOWN = '<svg class="weave-icon weave-arrow-icon" data-weave-icon="arrow-down" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3.25v9.5M4.5 9.25L8 12.75l3.5-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function escapeHtml(str) {
    return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;') : '';
  }
  function formatAgentTitle(id) {
    if (!id || typeof id !== 'string') return 'Agent';
    const clean = id.replace(/youtube/i, 'YouTube_').replace(/factchecker/i, 'Fact_Checker');
    return clean.split(/[_-]/).filter(Boolean).map(p => (p.toLowerCase() === 'youtube' ? 'YouTube' : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())).join(' ');
  }
  function getAgentIcon() { return ''; }
  function getStatusBadge(status, cardId = '') {
    const raw = (status || 'pending').toLowerCase(), [base, sub] = raw.split('/');
    const label = sub ? `${base.replace(/_/g, ' ')}: ${sub.replace(/_/g, ' ')}` : base.replace(/_/g, ' ');
    let cls = 'weave-badge weave-badge-neutral bg-slate-800 text-slate-400 border border-slate-700/50';
    if (base === 'in_progress' || base === 'revising' || base === 'running') cls = 'weave-badge vivid-pulse text-[10px] font-bold border font-mono';
    else if (base === 'awaiting_review' || base === 'awaiting_user_review') cls = 'weave-badge weave-badge-review bg-lime-500/20 text-lime-300 border border-lime-500/40 font-semibold font-mono';
    else if (base === 'waiting') cls = 'weave-badge weave-badge-waiting bg-amber-500/10 text-amber-300 border border-amber-500/30 font-medium font-mono';
    else if (base === 'completed' || base === 'approved') cls = 'weave-badge weave-badge-completed bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold font-mono';
    else if (base === 'blocked' || base === 'error' || base === 'failed') cls = 'weave-badge weave-badge-blocked bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold font-mono';
    return `<span class="${cls} inline-block max-w-full truncate whitespace-nowrap px-2 py-0.5 rounded text-[10px] ${cardId ? 'cursor-pointer hover:opacity-85' : ''} transition-all" title="${escapeHtml(label)}" ${cardId ? `data-status-toggle="${escapeHtml(cardId)}"` : ''}>${escapeHtml(label)}</span>`;
  }
  function getOutputsList(fm, outputItems = null) {
    if (Array.isArray(outputItems) && outputItems.length > 0) return outputItems.map(it => String(it.name));
    if (!fm) return [];
    const raw = fm.outputs !== undefined ? fm.outputs : fm.deliverable;
    if (!raw || raw === 'null' || raw === 'None') return [];
    return Array.isArray(raw) ? raw.map(s => String(s).trim()).filter(s => s && s !== 'null' && s !== 'None') : [String(raw).trim()];
  }
  function getAgentValueChip(fm, cardId = '', isDeliverableActive = false, outputItems = null) {
    if (!fm && (!Array.isArray(outputItems) || outputItems.length === 0)) return '';
    const outs = getOutputsList(fm, outputItems);
    if (outs.length > 0) {
      const chipLabel = outs.length === 1 ? outs[0] : `${outs.length} outputs`;
      const activeCls = isDeliverableActive
        ? 'weave-deliverable-chip weave-deliverable-chip-active'
        : 'weave-deliverable-chip';
      return `<button type="button" class="inline-flex items-center gap-1.5 font-mono text-[11px] border px-2 py-0.5 rounded cursor-pointer transition-all whitespace-nowrap min-w-0 ${activeCls}" title="${escapeHtml(chipLabel)}" data-deliverable-toggle="${escapeHtml(cardId)}">${ICON_FILE}<span class="truncate">${escapeHtml(chipLabel)}</span></button>`;
    }
    if (fm?.progress) return `${escapeHtml(fm.progress)} Verified`;
    if (fm?.total_acts != null && fm?.total_segments != null) return `${fm.total_acts} Acts • ${fm.total_segments} Segments`;
    return fm?.words != null ? `${fm.words} words` : '';
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
          if (curList && trimmed.startsWith('-')) { parsed[curList].push(trimmed.slice(1).trim().replace(/^["']|["']$/g, '')); continue; }
          curList = null;
          const cIdx = trimmed.indexOf(':');
          if (cIdx === -1) continue;
          const key = trimmed.slice(0, cIdx).trim(), val = trimmed.slice(cIdx + 1).trim();
          if (val === '' || val === '[]') { parsed[key] = []; curList = (val === '') ? key : null; }
          else parsed[key] = val.replace(/^["']|["']$/g, '');
        }
        if (Object.keys(parsed).length > 0) effectiveFm = Object.assign({}, parsed, effectiveFm);
      }
    }
    if (!effectiveFm || typeof effectiveFm !== 'object' || Object.keys(effectiveFm).length === 0) return 'No frontmatter available.';
    const inputStatusMap = new Map();
    if (Array.isArray(inputStatuses)) { for (const st of inputStatuses) { if (st && st.raw) inputStatusMap.set(st.raw.trim(), st); } }
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
            const cls = isW ? (info.count > 0 ? 'text-amber-300 bg-amber-500/10 border-amber-500/30 weave-input-warn' : 'text-rose-400 bg-rose-500/10 border-rose-500/30 weave-input-missing') : (info.exists ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30 weave-input-ok' : 'text-rose-400 bg-rose-500/10 border-rose-500/30 weave-input-missing');
            const badge = isW ? (info.count > 0 ? ` (${info.count})` : ' (0)') : '';
            lines.push(`  <span class="text-slate-500 font-mono">-</span> <span class="inline-flex items-center px-1.5 py-0.2 rounded border font-mono text-[11px] ${cls}">"${escapeHtml(itemStr)}"${badge}</span>`);
          }
        }
      } else if (k === 'outputs' || Array.isArray(v)) {
        const outArr = Array.isArray(v) ? v : (v && v !== 'null' ? [v] : []);
        if (outArr.length === 0) lines.push(`<span class="weave-fm-key text-indigo-300 font-mono">${escapeHtml(k)}</span>: <span class="text-slate-400 font-mono">[]</span>`);
        else { lines.push(`<span class="weave-fm-key text-indigo-300 font-mono">${escapeHtml(k)}</span>:`); for (const it of outArr) lines.push(`  <span class="text-slate-500 font-mono">-</span> <span class="text-emerald-300 font-mono">"${escapeHtml(String(it))}"</span>`); }
      } else if (v === null) lines.push(`<span class="weave-fm-key text-indigo-300 font-mono">${escapeHtml(k)}</span>: <span class="text-slate-500 font-mono">null</span>`);
      else if (typeof v === 'string') lines.push(`<span class="weave-fm-key text-indigo-300 font-mono">${escapeHtml(k)}</span>: <span class="weave-fm-str text-amber-200 font-mono">"${escapeHtml(v)}"</span>`);
      else lines.push(`<span class="weave-fm-key text-indigo-300 font-mono">${escapeHtml(k)}</span>: <span class="weave-fm-num text-cyan-300 font-mono">${escapeHtml(String(v))}</span>`);
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
    if (s.total > 0 && s.completed === s.total) return `<span class="weave-badge weave-badge-completed bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 whitespace-nowrap shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold font-mono" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
    if (s.inProgress > 0) return `<span class="weave-badge vivid-pulse whitespace-nowrap shrink-0 px-2 py-0.5 rounded text-[10px] font-bold border font-mono" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
    return `<span class="weave-badge weave-badge-neutral bg-slate-800 text-slate-400 border border-slate-700/50 whitespace-nowrap shrink-0 px-2 py-0.5 rounded text-[10px] font-mono" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
  }

  function detectMediaType(filename, explicitMediaType = null) {
    if (explicitMediaType === 'image' || explicitMediaType === 'audio' || explicitMediaType === 'video') return explicitMediaType;
    if (!filename || typeof filename !== 'string') return null;
    const clean = filename.trim().toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|ico|svg)$/.test(clean)) return 'image';
    if (/\.(mp3|wav|ogg|flac|m4a|aac)$/.test(clean)) return 'audio';
    if (/\.(mp4|mov|webm|avi|mkv)$/.test(clean)) return 'video';
    return null;
  }

  function renderMediaPreviewHtml(name, mediaType, filePath = null, webviewUri = null, mediaContext = null) {
    if (!name || typeof name !== 'string') throw new TypeError('CRITICAL: name must be a non-empty string');
    if (mediaType !== 'image' && mediaType !== 'audio' && mediaType !== 'video') {
      throw new TypeError(`CRITICAL: mediaType must be 'image', 'audio', or 'video', got '${mediaType}'`);
    }
    const target = (typeof filePath === 'string' && filePath.trim()) ? filePath.trim() : name.trim();
    const searchStr = (typeof window !== 'undefined' && typeof window.location?.search === 'string') ? window.location.search : '';
    const readQueryParam = (key) => {
      if (!searchStr) return null;
      const m = searchStr.match(new RegExp(`[?&]${key}=([^&]+)`));
      if (!m) return null;
      try { return decodeURIComponent(m[1]).trim() || null; } catch { return m[1].trim() || null; }
    };
    const tokVal = readQueryParam('token');
    const wsUri = (typeof mediaContext?.workspaceUri === 'string' && mediaContext.workspaceUri.trim())
      ? mediaContext.workspaceUri.trim()
      : readQueryParam('workspaceUri');
    const ctxDir = (typeof mediaContext?.contextDir === 'string' && mediaContext.contextDir.trim())
      ? mediaContext.contextDir.trim()
      : ((typeof mediaContext?.showDir === 'string' && mediaContext.showDir.trim())
        ? mediaContext.showDir.trim()
        : (readQueryParam('contextDir') || readQueryParam('showDir')));
    const directUri = (typeof webviewUri === 'string' && webviewUri.trim()) ? webviewUri.trim() : null;
    const queryParts = [`path=${encodeURIComponent(target)}`];
    if (wsUri) queryParts.push(`workspaceUri=${encodeURIComponent(wsUri)}`);
    if (ctxDir) queryParts.push(`contextDir=${encodeURIComponent(ctxDir)}`);
    if (tokVal) queryParts.push(`token=${encodeURIComponent(tokVal)}`);
    const src = directUri || `/api/media?${queryParts.join('&')}`;
    if (mediaType === 'image') return `<img src="${escapeHtml(src)}" alt="${escapeHtml(name)}" data-media-preview="image" data-media-src="${escapeHtml(src)}" class="my-1.5 max-w-full max-h-80 rounded object-contain block" loading="lazy" />`;
    if (mediaType === 'audio') return `<audio controls preload="metadata" src="${escapeHtml(src)}" data-media-preview="audio" data-media-src="${escapeHtml(src)}" class="my-1.5 w-full h-9 block"></audio>`;
    return `<video controls preload="metadata" src="${escapeHtml(src)}" data-media-preview="video" data-media-src="${escapeHtml(src)}" class="my-1.5 w-full max-h-80 rounded bg-black block"></video>`;
  }

  function formatDeliverableHtml(agentData, delivLabel, outs, mediaContext = null) {
    const rawDeliv = agentData?.deliverableContent;
    const outputItems = Array.isArray(agentData?.outputItems) ? agentData.outputItems : [];
    const itemMap = new Map();
    for (const it of outputItems) { if (it && it.name) itemMap.set(String(it.name), it); }
    const hasText = rawDeliv != null && rawDeliv.trim() !== '';
    const hasExistingItem = outputItems.some(it => it && it.exists);
    if (!hasText && !hasExistingItem) return rawDeliv === '' ? 'Deliverable is empty.' : `Deliverable (${escapeHtml(delivLabel)}) has not been generated yet.`;
    if (outs.length === 1) {
      const singleName = outs[0], item = itemMap.get(singleName) || outputItems[0] || null;
      const mType = (item && item.exists === false) ? null : detectMediaType(singleName, item?.mediaType);
      const preview = mType ? renderMediaPreviewHtml(singleName, mType, item?.filePath || singleName, item?.webviewUri || null, mediaContext) : '';
      const escapedText = hasText ? escapeHtml(rawDeliv) : '';
      return preview ? (escapedText ? `${preview}\n${escapedText}` : preview) : escapedText;
    }
    const baseText = hasText ? rawDeliv : outputItems.map(it => `── ${it.name} ──\n${it.exists ? (it.content || '') : `Output (${it.name}) has not been generated yet.`}`).join('\n\n');
    return escapeHtml(baseText).replace(/^── (?:\uD83D\uDCC4 )?(.+?) ──$/gm, (_, escapedName) => {
      const item = itemMap.get(escapedName);
      const mType = (item && item.exists === false) ? null : detectMediaType(escapedName, item?.mediaType);
      const preview = mType ? `\n${renderMediaPreviewHtml(escapedName, mType, item?.filePath || escapedName, item?.webviewUri || null, mediaContext)}` : '';
      return `<span class="inline-flex items-center gap-1.5 text-slate-300 font-bold">── ${ICON_FILE} ${escapedName} ──</span>${preview}`;
    });
  }

  function renderAgentCard(cardId, title, ...args) {
    const [agentData, customChip, mediaContext] = (args.length >= 2 && typeof args[0] === 'string') ? [args[1], args[2], args[3]] : [args[0], args[1], args[2]];
    const isOpen = expandedCards.has(cardId), viewMode = cardViewModes.get(cardId) || 'updates';
    const fm = agentData?.frontmatter || {}, body = agentData?.body || '', status = fm.status || 'pending', convId = fm.conversation_id;
    const rtTracker = (typeof window !== 'undefined' && window.RuntimeTracker) || (typeof RuntimeTracker !== 'undefined' ? RuntimeTracker : null);
    const runtimeBadge = rtTracker ? rtTracker.getRuntimeBadgeHtml(body, status) : '';
    let updatedLabelHtml = '';
    if (fm.updated_at) {
      const rel = rtTracker?.formatRelativeTime ? rtTracker.formatRelativeTime(fm.updated_at) : new Date(fm.updated_at).toLocaleTimeString();
      updatedLabelHtml = `<span class="whitespace-nowrap" title="${escapeHtml(new Date(fm.updated_at).toLocaleTimeString())}" data-relative-time="${escapeHtml(fm.updated_at)}">Updated: ${escapeHtml(rel)}</span>`;
    }
    const chatBtn = convId ? `<button type="button" class="weave-chat-btn inline-flex items-center gap-1.5 px-2 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 font-medium whitespace-nowrap shrink-0 transition-colors" title="Open Subagent Chat" aria-label="Open Subagent Chat" data-conv-id="${escapeHtml(convId)}">${ICON_CHAT}<span class="weave-btn-label">Open Subagent Chat</span></button><span class="weave-conv-short text-slate-600 whitespace-nowrap" title="${escapeHtml(convId)}">(${escapeHtml(convId.slice(0, 8))}...)</span>` : '';
    const outs = getOutputsList(fm, agentData?.outputItems);
    const isDeliverableMode = viewMode === 'deliverable' && outs.length > 0;
    const delivLabel = outs.length === 1 ? outs[0] : `${outs.length} outputs`;
    let headerActionHtml = '', mainContentHtml = '';
    if (isDeliverableMode) {
      const copyBtn = `<button type="button" class="weave-copy-btn inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-mono whitespace-nowrap shrink-0 transition-colors" title="Copy deliverable" aria-label="Copy deliverable" data-copy-deliverable="${escapeHtml(cardId)}">${ICON_COPY}<span>Copy</span></button>`;
      headerActionHtml = `<div class="weave-toolbar-left flex items-center gap-2 font-mono min-w-0 flex-1"><span class="weave-deliv-title inline-flex items-center gap-1.5 min-w-0 text-slate-200 text-[11px] font-semibold" title="${escapeHtml(delivLabel)}">${ICON_FILE}<span class="truncate">${escapeHtml(delivLabel)}</span></span><span class="weave-deliv-tag text-slate-500 text-[11px] whitespace-nowrap shrink-0">(Deliverable)</span>${copyBtn}${runtimeBadge}${chatBtn}</div><button type="button" class="weave-view-updates-btn inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 font-mono underline whitespace-nowrap shrink-0" title="View Updates" aria-label="View Updates" data-status-toggle="${escapeHtml(cardId)}"><span class="weave-btn-label">View Updates</span>${ICON_ARROW_DOWN}</button>`;
      mainContentHtml = `<div data-agent-body="${escapeHtml(cardId)}" class="weave-code-box custom-scrollbar p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed select-text selection:bg-indigo-500/30">${formatDeliverableHtml(agentData, delivLabel, outs, mediaContext)}</div>`;
    } else {
      headerActionHtml = `<div class="weave-toolbar-left flex items-center gap-2 font-mono min-w-0 shrink-0">${runtimeBadge}${chatBtn}</div><div class="weave-toolbar-right text-[11px] text-slate-500 font-mono whitespace-nowrap truncate min-w-0">${updatedLabelHtml}</div>`;
      const fmContent = formatFrontmatterOnly(fm, agentData?.statusContent, agentData?.inputStatuses);
      const hasFm = fmContent && fmContent !== 'No frontmatter available.';
      const formattedLog = formatHumanLogBody(body);
      if (hasFm || formattedLog) {
        const logSection = formattedLog || `<span class="text-slate-500 italic">No logs recorded yet. Agent is pending or starting up...</span>`;
        mainContentHtml = `<div data-agent-body="${escapeHtml(cardId)}" class="weave-code-box custom-scrollbar p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed select-text selection:bg-indigo-500/30">${hasFm ? `${fmContent}\n\n${logSection}` : formattedLog}</div>`;
      } else {
        mainContentHtml = `<div data-agent-body="${escapeHtml(cardId)}" class="py-6 text-center text-xs text-slate-500 italic font-mono select-text">No frontmatter available. No logs recorded yet. Agent is pending or starting up...</div>`;
      }
    }
    const wrappedChip = customChip ? (String(customChip).trimStart().startsWith('<') ? customChip : `<span class="weave-plain-chip truncate whitespace-nowrap" title="${escapeHtml(customChip)}">${customChip}</span>`) : '';
    return `<div class="weave-card rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm transition-all"><div class="weave-card-header p-3 bg-slate-900/80 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-800/50 transition-colors" data-concept-toggle="${escapeHtml(cardId)}"><div class="weave-card-title-wrap flex items-center gap-2.5 min-w-0"><span class="inline-flex items-center justify-center shrink-0 text-slate-400 transform transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}">${ICON_CHEVRON}</span><span class="weave-card-title font-bold text-xs text-slate-200 tracking-wide truncate" title="${escapeHtml(title)}">${escapeHtml(title)}</span></div><div class="weave-card-meta flex items-center gap-2 font-mono text-[11px] min-w-0">${wrappedChip ? `<span class="weave-card-chip-group inline-flex items-center gap-2 text-slate-400 mr-1 min-w-0">${wrappedChip}<span class="weave-sep-dot" aria-hidden="true"></span></span>` : ''}${getStatusBadge(status, cardId)}</div></div>${isOpen ? `<div class="weave-card-expanded p-4 border-t border-slate-800/70 bg-slate-950/40 space-y-3"><div class="weave-card-toolbar flex items-center justify-between gap-2 text-xs text-slate-400 border-b border-slate-800/60 pb-2 min-w-0">${headerActionHtml}</div>${mainContentHtml}</div>` : ''}</div>`;
  }

  function getNodeCreationTime(node) {
    if (!node) return 0;
    if (typeof node.createdAt === 'number' && node.createdAt > 0) return node.createdAt;
    if (node.type === 'group' && Array.isArray(node.children) && node.children.length > 0) return Math.min(...node.children.map(getNodeCreationTime));
    return 0;
  }

  function renderNode(node, stageNum, mediaContext = null) {
    if (node.type === 'group') {
      const groupId = (stageNum != null) ? `grp_s${stageNum}_${node.id}` : `grp_${node.id}`;
      const isExpanded = expandedGroups.has(groupId), title = formatAgentTitle(node.name || node.id);
      const sortedChildren = (node.children || []).slice().sort((a, b) => {
        const ta = getNodeCreationTime(a), tb = getNodeCreationTime(b);
        return (ta && tb && ta !== tb) ? (ta - tb) : (a.name || a.id).localeCompare(b.name || b.id);
      });
      return `<div class="weave-group rounded-xl border border-slate-800/80 bg-slate-900/30 p-2.5 space-y-2 transition-all"><div class="weave-group-header flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-800/40 p-1 rounded-lg transition-colors" data-group-toggle="${escapeHtml(groupId)}"><div class="flex items-center gap-2 min-w-0"><span class="inline-flex items-center justify-center shrink-0 text-slate-400 transform transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}">${ICON_CHEVRON}</span><span class="weave-group-title font-bold text-xs text-white tracking-wide truncate" title="${escapeHtml(title)}">${escapeHtml(title)}</span></div>${getGroupSummaryChip(node)}</div>${isExpanded ? `<div class="space-y-2 mt-1.5">${sortedChildren.map(child => renderNode(child, stageNum, mediaContext)).join('')}</div>` : ''}</div>`;
    }
    const cardId = (stageNum != null) ? `card_s${stageNum}_${node.id}` : `card_${node.id}`;
    const chip = getAgentValueChip(node.frontmatter, cardId, cardViewModes.get(cardId) === 'deliverable', node.outputItems);
    return renderAgentCard(cardId, formatAgentTitle(node.name || node.id), node, chip, mediaContext);
  }

  function render(container, data, filterStageNum = null) {
    if (!container) return;
    const mediaContext = {
      workspaceUri: (typeof data?.workspaceUri === 'string' && data.workspaceUri.trim()) ? data.workspaceUri.trim() : null,
      contextDir: (typeof data?.contextDir === 'string' && data.contextDir.trim())
        ? data.contextDir.trim()
        : ((typeof data?.showDir === 'string' && data.showDir.trim()) ? data.showDir.trim() : null)
    };
    let stageList = Array.isArray(data?.stages) ? data.stages : (data?.agents ? [{ num: 2, name: 'Concept & Outline', agents: data.agents }] : []);
    if (filterStageNum !== null && filterStageNum !== undefined) stageList = stageList.filter(s => s.num === filterStageNum);
    let totalAgents = 0;
    stageList.forEach(st => { (st.nodes || Object.values(st.agents || {})).forEach(n => { totalAgents += countLeaves(n); }); });
    let contentHtml = '';
    if (stageList.length === 0 || totalAgents === 0) {
      contentHtml = `<div class="weave-empty-state p-6 rounded-xl border border-slate-800 bg-slate-900/30 text-center text-xs text-slate-500 font-mono">No subagents discovered across pipeline stages yet.</div>`;
    } else {
      contentHtml = stageList.map(st => {
        const nodeList = (st.nodes || Object.values(st.agents || {})).filter(n => n.type === 'group' || !n.frontmatter?.type || n.frontmatter.type === 'agent');
        nodeList.sort((a, b) => {
          const ta = getNodeCreationTime(a), tb = getNodeCreationTime(b);
          return (ta && tb && ta !== tb) ? (ta - tb) : (a.name || a.id).localeCompare(b.name || b.id);
        });
        const activeCount = nodeList.reduce((acc, n) => acc + countLeaves(n), 0);
        if (nodeList.length === 0 || activeCount === 0) return '';
        const rtTracker = (typeof window !== 'undefined' && window.RuntimeTracker) || null;
        const stageRt = rtTracker?.calculateStageRuntime ? rtTracker.calculateStageRuntime(nodeList) : null;
        const timerHtml = (stageRt && (stageRt.seconds > 0 || stageRt.isRunning))
          ? `<span class="inline-flex items-center gap-1 text-[11px] font-mono whitespace-nowrap shrink-0 ${stageRt.isRunning ? 'text-slate-400' : 'text-slate-500'}">${ICON_CLOCK}${stageRt.isRunning ? `<span data-running-timer data-start-ms="${stageRt.lastStartMs || 0}" data-prior-ms="${stageRt.priorActiveMs || 0}" data-base-seconds="${stageRt.seconds || 0}" data-calc-time="${Date.now()}">${escapeHtml(stageRt.formatted)}</span>` : escapeHtml(stageRt.formatted)}</span>`
          : '';
        const stageId = (st.num != null) ? `stage_${st.num}` : (st.name ? `stage_${st.name}` : 'stage_unknown');
        const isExpanded = !collapsedStages.has(stageId);
        const stageHeader = (st.num != null && st.num > 0)
          ? `<div class="flex items-center gap-1.5 min-w-0"><span class="inline-flex items-center justify-center shrink-0 text-slate-400 transform transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}">${ICON_CHEVRON}</span><span class="weave-stage-title text-xs font-bold text-white tracking-wide group-hover:text-indigo-300 transition-colors whitespace-nowrap shrink-0">Stage ${st.num}</span><span class="text-xs font-normal text-slate-400 truncate min-w-0" title="${escapeHtml(st.name)}">- ${escapeHtml(st.name)}</span>${timerHtml ? `<span class="weave-sep-dot" aria-hidden="true"></span>${timerHtml}` : ''}</div>`
          : (st.name ? `<div class="flex items-center gap-1.5 min-w-0"><span class="inline-flex items-center justify-center shrink-0 text-slate-400 transform transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}">${ICON_CHEVRON}</span><span class="weave-stage-title text-xs font-bold text-white tracking-wide group-hover:text-indigo-300 transition-colors truncate min-w-0" title="${escapeHtml(st.name)}">${escapeHtml(st.name)}</span>${timerHtml ? `<span class="weave-sep-dot" aria-hidden="true"></span>${timerHtml}` : ''}</div>` : '');
        return `<div class="space-y-2.5"><div class="weave-stage-row flex items-center gap-3 my-2 cursor-pointer select-none group hover:opacity-90 transition-opacity min-w-0" data-stage-toggle="${escapeHtml(stageId)}">${stageHeader}<div class="weave-stage-divider flex-1 min-w-[12px] h-px bg-slate-800"></div><span class="text-[11px] text-slate-500 font-mono whitespace-nowrap shrink-0">${activeCount} Agent${activeCount === 1 ? '' : 's'}</span></div>${isExpanded ? `<div class="space-y-2 pl-0.5">${nodeList.map(node => renderNode(node, st.num, mediaContext)).join('')}</div>` : ''}</div>`;
      }).filter(Boolean).join('');
    }
    const prevScrolls = new Map(), activeMediaEls = new Map();
    container.querySelectorAll('[data-agent-body]').forEach(el => {
      const cid = el.getAttribute('data-agent-body');
      prevScrolls.set(cid, { scrollTop: el.scrollTop, wasAtBottom: (el.scrollHeight - el.scrollTop - el.clientHeight) < 30, text: el.textContent });
    });
    container.querySelectorAll('[data-media-src]').forEach(el => {
      const src = el.getAttribute('data-media-src');
      if (src && (el.currentTime > 0 || (typeof el.paused === 'boolean' && !el.paused))) activeMediaEls.set(src, el);
    });
    container.innerHTML = `<div class="space-y-4">${contentHtml}</div>`;
    if (activeMediaEls.size > 0) {
      container.querySelectorAll('[data-media-src]').forEach(newEl => {
        const oldEl = activeMediaEls.get(newEl.getAttribute('data-media-src'));
        if (oldEl && typeof newEl.replaceWith === 'function') newEl.replaceWith(oldEl);
      });
    }
    container.querySelectorAll('[data-media-src]').forEach(el => {
      if (typeof el.addEventListener !== 'function') return;
      el.addEventListener('error', async () => {
        const rawSrc = el.getAttribute('data-media-src');
        if (rawSrc && el.getAttribute('data-blob-loaded') !== '1' && typeof window !== 'undefined' && window.sidecar?.fetch) {
          el.setAttribute('data-blob-loaded', '1');
          try {
            const res = await window.sidecar.fetch(rawSrc);
            if (res.ok && typeof URL !== 'undefined' && URL.createObjectURL) {
              el.src = URL.createObjectURL(await res.blob());
              return;
            }
          } catch {}
        }
        if (typeof document !== 'undefined' && typeof document.createElement === 'function' && typeof el.replaceWith === 'function') {
          const fb = document.createElement('div');
          fb.className = 'weave-media-fallback';
          fb.textContent = `Preview unavailable: ${el.getAttribute('alt') || 'media output'}`;
          el.replaceWith(fb);
        }
      }, { once: true });
    });
    container.querySelectorAll('[data-stage-toggle]').forEach(el => el.addEventListener('click', () => {
      const id = el.getAttribute('data-stage-toggle');
      if (!id) return;
      if (collapsedStages.has(id)) collapsedStages.delete(id); else collapsedStages.add(id);
      render(container, data, filterStageNum);
    }));
    container.querySelectorAll('[data-group-toggle]').forEach(el => el.addEventListener('click', () => {
      const id = el.getAttribute('data-group-toggle');
      if (expandedGroups.has(id)) expandedGroups.delete(id); else expandedGroups.add(id);
      render(container, data, filterStageNum);
    }));
    container.querySelectorAll('[data-concept-toggle]').forEach(el => el.addEventListener('click', () => {
      const id = el.getAttribute('data-concept-toggle');
      if (expandedCards.has(id)) expandedCards.delete(id); else { expandedCards.add(id); pendingScrollBottom.add(id); }
      render(container, data, filterStageNum);
    }));
    container.querySelectorAll('[data-deliverable-toggle]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation(); const id = btn.getAttribute('data-deliverable-toggle');
      expandedCards.add(id); cardViewModes.set(id, 'deliverable'); render(container, data, filterStageNum);
    }));
    container.querySelectorAll('[data-copy-deliverable]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation(); const id = btn.getAttribute('data-copy-deliverable');
      if (!id) return;
      let textToCopy = '';
      container.querySelectorAll('[data-agent-body]').forEach(el => { if (el.getAttribute('data-agent-body') === id) textToCopy = el.textContent || ''; });
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) navigator.clipboard.writeText(textToCopy);
      if ('innerHTML' in btn) btn.innerHTML = `${ICON_CHECK}<span>Copied</span>`;
      else btn.textContent = 'Copied';
      if ('title' in btn) btn.title = 'Copied';
      if (typeof setTimeout === 'function') {
        const t = setTimeout(() => {
          if ('innerHTML' in btn) btn.innerHTML = `${ICON_COPY}<span>Copy</span>`;
          else btn.textContent = 'Copy';
          if ('title' in btn) btn.title = 'Copy deliverable';
        }, 1800);
        if (t && typeof t.unref === 'function') t.unref();
      }
    }));
    container.querySelectorAll('[data-status-toggle]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation(); const id = btn.getAttribute('data-status-toggle');
      expandedCards.add(id); cardViewModes.set(id, 'updates'); pendingScrollBottom.add(id); render(container, data, filterStageNum);
    }));
    container.querySelectorAll('[data-conv-id]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const convId = btn.getAttribute('data-conv-id');
      if (window.sidecar?.ui?.toggleConversation) window.sidecar.ui.toggleConversation(convId);
      else if (window.WeaveHostBridge?.openConversation) window.WeaveHostBridge.openConversation(convId);
    }));
    container.querySelectorAll('[data-agent-body]').forEach(el => {
      const cid = el.getAttribute('data-agent-body'), prev = prevScrolls.get(cid);
      if ((cardViewModes.get(cid) || 'updates') === 'updates') {
        if (pendingScrollBottom.has(cid) || Boolean(prev && prev.text !== el.textContent) || (prev ? prev.wasAtBottom : true)) el.scrollTop = el.scrollHeight;
        else if (prev) el.scrollTop = prev.scrollTop;
      } else {
        el.scrollTop = (prev && prev.text === el.textContent) ? prev.scrollTop : 0;
      }
    });
    pendingScrollBottom.clear();
  }

  const trackerApi = {
    render, renderAllAgents: render, formatAgentTitle, formatFrontmatterOnly, formatHumanLogBody,
    getAgentIcon, getStatusBadge, getAgentValueChip, getShowrunnerChip, getSourcerChip,
    getGroupSummary, getGroupSummaryChip, detectMediaType, renderMediaPreviewHtml, formatDeliverableHtml,
    expandedCards, expandedGroups, collapsedStages, cardViewModes, pendingScrollBottom
  };
  if (typeof window !== 'undefined') window.AgentPanel = window.ConceptTracker = window.AgentsTracker = trackerApi;
  if (typeof module !== 'undefined' && module.exports) module.exports = trackerApi;
})();
