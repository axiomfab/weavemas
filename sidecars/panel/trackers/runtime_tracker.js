// Runtime Tracker Module - Calculates Active Execution Time from weave.md Event Logs
(function() {
  function escapeHtml(str) {
    if (str === null || str === undefined || str === '') return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatRuntime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    if (s < 60) return `${s}s`;
    const mins = Math.floor(s / 60);
    const remSecs = s % 60;
    if (mins < 60) {
      return `${mins}m ${remSecs}s`;
    }
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m ${remSecs}s`;
  }

  function calculateActiveRuntime(body, currentStatus, nowMs = Date.now()) {
    if (!body || typeof body !== 'string') {
      return { seconds: 0, isRunning: false, formatted: '0s' };
    }

    const regex = /-\s+([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z):(?:\s+.*?\(`([^`]+)`\)|(?:\s*`([^`]+)`))/g;
    const entries = [];
    let match;
    while ((match = regex.exec(body)) !== null) {
      const timestamp = Date.parse(match[1]);
      const slug = match[2] || match[3];
      if (!isNaN(timestamp) && slug) {
        entries.push({ timestamp, slug });
      }
    }

    if (entries.length === 0) {
      return { seconds: 0, isRunning: false, formatted: '0s' };
    }

    let priorActiveMs = 0;
    for (let i = 0; i < entries.length - 1; i++) {
      const curr = entries[i];
      const next = entries[i + 1];
      if (curr.slug.startsWith('in_progress')) {
        const delta = Math.max(0, next.timestamp - curr.timestamp);
        priorActiveMs += delta;
      }
    }

    const lastEntry = entries[entries.length - 1];
    const effectiveStatus = currentStatus || lastEntry.slug;
    const isRunning = effectiveStatus.startsWith('in_progress');

    let totalActiveMs = priorActiveMs;
    const lastStartMs = lastEntry.timestamp;
    if (isRunning) {
      const liveDelta = Math.max(0, nowMs - lastStartMs);
      totalActiveMs += liveDelta;
    }

    const seconds = Math.floor(totalActiveMs / 1000);
    return {
      seconds,
      isRunning,
      formatted: formatRuntime(seconds),
      priorActiveMs,
      lastStartMs
    };
  }

  function formatRelativeTime(dateInput, nowMs = Date.now()) {
    if (!dateInput) return '';
    const dateMs = typeof dateInput === 'number' ? dateInput : Date.parse(dateInput);
    if (isNaN(dateMs)) return '';
    const diffSec = Math.floor((nowMs - dateMs) / 1000);
    if (diffSec < 15) return 'just now';
    if (diffSec < 60) return 'a few moments ago';
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return mins === 1 ? '1 minute ago' : `${mins} minutes ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }

  function getRuntimeBadgeHtml(body, currentStatus, nowMs = Date.now()) {
    const res = calculateActiveRuntime(body, currentStatus, nowMs);
    if (res.isRunning) {
      return `<span class="weave-runtime-badge inline-flex items-center gap-1 text-[11px] font-mono text-slate-500" title="Active execution time (counting while in_progress)"><span class="text-[10px]">⏱️</span> <span data-running-timer data-start-ms="${res.lastStartMs}" data-prior-ms="${res.priorActiveMs}" data-base-seconds="${res.seconds}" data-calc-time="${nowMs}">${res.formatted}</span> <span class="text-[10px] text-slate-500 font-medium">(running)</span></span>`;
    }
    return `<span class="weave-runtime-badge inline-flex items-center gap-1 text-[11px] font-mono text-slate-500" title="Total active execution time"><span class="text-[10px]">⏱️</span> ${res.formatted}</span>`;
  }

  function tickTimers(root = (typeof document !== 'undefined' ? document : null), now = Date.now()) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const elements = root.querySelectorAll('[data-running-timer]');
    if (elements && elements.length > 0) {
      elements.forEach(el => {
        const startMs = parseInt(el.getAttribute('data-start-ms'), 10) || 0;
        const priorMs = parseInt(el.getAttribute('data-prior-ms'), 10) || 0;
        let totalMs = priorMs;
        if (startMs > 0) {
          totalMs += Math.max(0, now - startMs);
        } else {
          const base = parseInt(el.getAttribute('data-base-seconds'), 10) || 0;
          const calcTime = parseInt(el.getAttribute('data-calc-time'), 10) || now;
          totalMs = (base * 1000) + Math.max(0, now - calcTime);
        }
        const formatted = formatRuntime(Math.floor(totalMs / 1000));
        if (el.textContent !== formatted) {
          el.textContent = formatted;
        }
      });
    }
    const relElements = root.querySelectorAll('[data-relative-time]');
    if (relElements && relElements.length > 0) {
      relElements.forEach(el => {
        const ts = el.getAttribute('data-relative-time');
        if (ts) {
          const rel = formatRelativeTime(ts, now);
          const formatted = `Updated: ${rel}`;
          if (rel && el.textContent !== formatted) {
            el.textContent = formatted;
          }
        }
      });
    }
  }

  function formatHumanLogTime(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return String(dateInput);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function calculateStageRuntime(nodes, nowMs = Date.now()) {
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return { seconds: 0, isRunning: false, formatted: '0s', minStartMs: nowMs, priorActiveMs: 0, lastStartMs: 0 };
    }

    function getLeaves(list) {
      const leaves = [];
      for (const n of list) {
        if (!n) continue;
        if (n.type === 'agent' || n.type === 'orchestrator' || (!n.type && n.frontmatter)) leaves.push(n);
        else if (n.type === 'group' && Array.isArray(n.children)) leaves.push(...getLeaves(n.children));
      }
      return leaves;
    }

    const agents = getLeaves(nodes);
    if (agents.length === 0) return { seconds: 0, isRunning: false, formatted: '0s', minStartMs: nowMs, priorActiveMs: 0, lastStartMs: 0 };

    function isActiveSlug(slug) {
      if (!slug || typeof slug !== 'string') return false;
      const base = slug.toLowerCase().split('/')[0];
      return base === 'in_progress' || base === 'running' || base === 'revising';
    }

    const rawIntervals = [];
    let isRunning = false;
    let minStartMs = Infinity;

    const regex = /-\s+([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z):(?:\s+.*?\(`([^`]+)`\)|(?:\s*`([^`]+)`))/g;

    for (const ag of agents) {
      const body = ag.body || '';
      const st = (ag.frontmatter?.status || '').toLowerCase();
      const entries = [];
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(body)) !== null) {
        const timestamp = Date.parse(match[1]);
        const slug = (match[2] || match[3] || '').toLowerCase();
        if (!isNaN(timestamp) && slug) {
          entries.push({ timestamp, slug });
        }
      }

      if (entries.length > 0) {
        for (let i = 0; i < entries.length - 1; i++) {
          const curr = entries[i];
          const next = entries[i + 1];
          if (isActiveSlug(curr.slug) && next.timestamp > curr.timestamp) {
            rawIntervals.push({ start: curr.timestamp, end: next.timestamp });
            if (curr.timestamp < minStartMs) minStartMs = curr.timestamp;
          }
        }
        const lastEntry = entries[entries.length - 1];
        const effectiveStatus = st || lastEntry.slug;
        if (isActiveSlug(effectiveStatus)) {
          isRunning = true;
          if (nowMs > lastEntry.timestamp) {
            rawIntervals.push({ start: lastEntry.timestamp, end: nowMs });
            if (lastEntry.timestamp < minStartMs) minStartMs = lastEntry.timestamp;
          }
        }
      } else {
        const startMs = ag.createdAt || 0;
        const updatedMs = Date.parse(ag.frontmatter?.updated_at);
        if (isActiveSlug(st) && startMs > 0 && nowMs > startMs) {
          isRunning = true;
          rawIntervals.push({ start: startMs, end: nowMs });
          if (startMs < minStartMs) minStartMs = startMs;
        } else if ((st === 'completed' || st.startsWith('completed/') || st === 'awaiting_review' || st.startsWith('awaiting_review/')) && startMs > 0 && !isNaN(updatedMs) && updatedMs > startMs) {
          rawIntervals.push({ start: startMs, end: updatedMs });
          if (startMs < minStartMs) minStartMs = startMs;
        }
      }
    }

    if (rawIntervals.length === 0) {
      return { seconds: 0, isRunning, formatted: '0s', minStartMs: minStartMs !== Infinity ? minStartMs : nowMs, priorActiveMs: 0, lastStartMs: 0 };
    }

    rawIntervals.sort((a, b) => a.start - b.start);
    const merged = [rawIntervals[0]];
    for (let i = 1; i < rawIntervals.length; i++) {
      const curr = rawIntervals[i];
      const prev = merged[merged.length - 1];
      if (curr.start <= prev.end) {
        prev.end = Math.max(prev.end, curr.end);
      } else {
        merged.push(curr);
      }
    }

    let totalActiveMs = 0;
    for (const interval of merged) {
      totalActiveMs += Math.max(0, interval.end - interval.start);
    }

    const stageSeconds = Math.max(0, Math.floor(totalActiveMs / 1000));
    const lastStartMs = isRunning && merged.length > 0 ? merged[merged.length - 1].start : 0;
    const priorActiveMs = isRunning ? merged.slice(0, -1).reduce((acc, intv) => acc + Math.max(0, intv.end - intv.start), 0) : totalActiveMs;

    return {
      seconds: stageSeconds,
      isRunning,
      formatted: formatRuntime(stageSeconds),
      minStartMs: minStartMs !== Infinity ? minStartMs : nowMs,
      priorActiveMs,
      lastStartMs
    };
  }

  function getStatusColorClass(slug) {
    if (!slug) return 'text-slate-400 font-medium';
    const [base] = slug.toLowerCase().split('/');
    if (base === 'in_progress' || base === 'running' || base === 'revising') {
      return 'text-amber-400 font-bold';
    }
    if (base === 'awaiting_review' || base === 'awaiting_user_review') {
      return 'text-lime-400 font-semibold';
    }
    if (base === 'waiting') {
      return 'text-amber-300 font-medium';
    }
    if (base === 'completed' || base === 'approved') {
      return 'text-emerald-400 font-semibold';
    }
    if (base === 'blocked' || base === 'error' || base === 'failed') {
      return 'text-rose-400 font-semibold';
    }
    return 'text-slate-400 font-medium';
  }

  function formatHumanLogBody(rawBody, nowMs = Date.now()) {
    if (!rawBody || typeof rawBody !== 'string') return '';
    const lines = rawBody.split(/\r?\n/);
    const parsedEntries = [];
    const logRegex = /^-\s+([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z):(?:\s+`([^`]+)`|\s*([^\s-]+(?:\/[^\s-]+)?))(?:\s*-\s*(.*))?$/;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '# Status Log') continue;
      const m = trimmed.match(logRegex);
      if (m) {
        parsedEntries.push({
          rawLine: trimmed,
          iso: m[1],
          timestamp: Date.parse(m[1]),
          slug: m[2] || m[3] || '',
          progress: m[4] || ''
        });
      } else {
        parsedEntries.push({ rawLine: trimmed, isPlain: true });
      }
    }

    const formatted = [];
    for (let i = 0; i < parsedEntries.length; i++) {
      const entry = parsedEntries[i];
      if (entry.isPlain) {
        formatted.push(`<div class="weave-log-plain text-slate-400 font-mono">${escapeHtml(entry.rawLine)}</div>`);
        continue;
      }
      const timeStr = escapeHtml(formatHumanLogTime(entry.iso));
      let durationHtml = '';
      if (entry.slug && entry.slug.startsWith('in_progress')) {
        let nextTimestamp = null;
        for (let j = i + 1; j < parsedEntries.length; j++) {
          if (!parsedEntries[j].isPlain && !isNaN(parsedEntries[j].timestamp)) {
            nextTimestamp = parsedEntries[j].timestamp;
            break;
          }
        }
        const endMs = (nextTimestamp !== null) ? nextTimestamp : nowMs;
        if (!isNaN(entry.timestamp)) {
          const deltaSec = Math.max(0, Math.floor((endMs - entry.timestamp) / 1000));
          durationHtml = ` <span class="text-slate-400 font-normal">(${formatRuntime(deltaSec)})</span>`;
        }
      }
      const colorCls = getStatusColorClass(entry.slug);
      const badgeHtml = entry.slug
        ? ` <span class="font-mono text-[11px] ${colorCls}">[${escapeHtml(entry.slug)}]</span>`
        : '';
      const noteHtml = entry.progress ? ` <span class="text-slate-300 font-sans">— ${escapeHtml(entry.progress)}</span>` : '';
      formatted.push(`<div class="weave-log-entry leading-relaxed py-0.5"><span class="text-slate-600 font-mono mr-1.5">•</span><strong class="text-slate-200 font-bold font-mono">${timeStr}</strong>${durationHtml} ${badgeHtml}${noteHtml}</div>`);
    }
    return formatted.join('\n');
  }

  // Smooth local live ticker (200ms resolution for sub-second precision without layout thrashing)
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    setInterval(() => {
      tickTimers(document, Date.now());
    }, 200);
  }

  const api = {
    formatRuntime,
    calculateActiveRuntime,
    calculateStageRuntime,
    formatHumanLogTime,
    formatHumanLogBody,
    getRuntimeBadgeHtml,
    formatRelativeTime,
    tickTimers
  };

  if (typeof window !== 'undefined') {
    window.RuntimeTracker = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
