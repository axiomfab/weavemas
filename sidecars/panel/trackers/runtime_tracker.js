// Runtime Tracker Module - Calculates Active Execution Time from status.md Event Logs
(function() {
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
      return `<span class="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500" title="Active execution time (counting while in_progress)"><span class="text-[10px]">⏱️</span> <span data-running-timer data-start-ms="${res.lastStartMs}" data-prior-ms="${res.priorActiveMs}" data-base-seconds="${res.seconds}" data-calc-time="${nowMs}">${res.formatted}</span> <span class="text-[10px] text-slate-500 font-medium">(running)</span></span>`;
    }
    return `<span class="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500" title="Total active execution time"><span class="text-[10px]">⏱️</span> ${res.formatted}</span>`;
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
      return { seconds: 0, isRunning: false, formatted: '0s', minStartMs: nowMs };
    }

    function getLeaves(list) {
      const leaves = [];
      for (const n of list) {
        if (!n) continue;
        if (n.type === 'agent' || (!n.type && n.frontmatter)) leaves.push(n);
        else if (n.type === 'group' && Array.isArray(n.children)) leaves.push(...getLeaves(n.children));
      }
      return leaves;
    }

    const agents = getLeaves(nodes);
    if (agents.length === 0) return { seconds: 0, isRunning: false, formatted: '0s', minStartMs: nowMs };

    let isRunning = false;
    let minStartMs = Infinity;
    let maxEndMs = 0;

    for (const ag of agents) {
      const body = ag.body || '';
      const st = ag.frontmatter?.status || '';
      const rt = calculateActiveRuntime(body, st, nowMs);
      if (rt.isRunning) isRunning = true;
      if (rt.lastStartMs && rt.lastStartMs < minStartMs) minStartMs = rt.lastStartMs;
      if (ag.createdAt && ag.createdAt < minStartMs) minStartMs = ag.createdAt;

      const updatedMs = Date.parse(ag.frontmatter?.updated_at);
      if (!isNaN(updatedMs) && updatedMs > maxEndMs) maxEndMs = updatedMs;
      if (ag.createdAt && ag.createdAt > maxEndMs) maxEndMs = ag.createdAt;
    }

    let stageSeconds = 0;
    if (minStartMs !== Infinity) {
      const endMs = isRunning ? nowMs : Math.max(maxEndMs, minStartMs);
      stageSeconds = Math.max(0, Math.floor((endMs - minStartMs) / 1000));
    }

    return {
      seconds: stageSeconds,
      isRunning,
      formatted: formatRuntime(stageSeconds),
      minStartMs: minStartMs !== Infinity ? minStartMs : nowMs
    };
  }

  function formatHumanLogBody(rawBody) {
    if (!rawBody || typeof rawBody !== 'string') return '';
    const lines = rawBody.split(/\r?\n/);
    const formatted = [];
    const logRegex = /^-\s+([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z):(?:\s+`([^`]+)`|\s*([^\s-]+(?:\/[^\s-]+)?))(?:\s*-\s*(.*))?$/;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '# Status Log') continue;
      const m = trimmed.match(logRegex);
      if (m) {
        const iso = m[1];
        const slug = m[2] || m[3] || '';
        const progress = m[4] || '';
        const timeStr = formatHumanLogTime(iso);
        const relStr = formatRelativeTime(iso);
        const badge = slug ? `[${slug}]` : '';
        const note = progress ? ` — ${progress}` : '';
        const rel = relStr ? ` (${relStr})` : '';
        formatted.push(`• ${timeStr}${rel}  ${badge}${note}`);
      } else {
        formatted.push(trimmed);
      }
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
