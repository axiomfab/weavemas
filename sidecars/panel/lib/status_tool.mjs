import fs from 'node:fs';
import path from 'node:path';

function parseScalarValue(raw) {
  const val = raw.trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) return val.slice(1, -1);
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null' || val === '~') return null;
  if (val === '[]') return [];
  if (!isNaN(Number(val)) && val !== '') return Number(val);
  return val;
}

function parseFrontmatter(content) {
  if (typeof content !== 'string') throw new TypeError('CRITICAL: content must be a string to parse frontmatter');
  const clean = content.replace(/^\uFEFF/, '').trimStart();
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: clean };
  const frontmatter = {};
  let currentListKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (currentListKey && trimmed.startsWith('-')) {
      frontmatter[currentListKey].push(String(parseScalarValue(trimmed.slice(1))));
      continue;
    }
    currentListKey = null;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const rawVal = trimmed.slice(colonIdx + 1).trim();
    if (rawVal === '') {
      frontmatter[key] = [];
      currentListKey = key;
    } else {
      frontmatter[key] = parseScalarValue(rawVal);
    }
  }
  return { frontmatter, body: match[2] || '' };
}

function serializeFrontmatter(frontmatter, body) {
  if (!frontmatter || typeof frontmatter !== 'object') throw new TypeError('CRITICAL: frontmatter must be a valid object');
  const lines = ['---'];
  for (const [key, val] of Object.entries(frontmatter)) {
    if (Array.isArray(val)) {
      if (val.length === 0) lines.push(`${key}: []`);
      else {
        lines.push(`${key}:`);
        for (const item of val) lines.push(`  - "${String(item)}"`);
      }
    } else {
      lines.push(typeof val === 'string' ? `${key}: "${val}"` : `${key}: ${val}`);
    }
  }
  lines.push('---');
  return body ? `${lines.join('\n')}\n\n${body.trim()}\n` : `${lines.join('\n')}\n`;
}

export function executeStatusUpdate(params, workspaceRoot) {
  if (!params || typeof params !== 'object') throw new TypeError('CRITICAL: params must be a non-null object');
  const { show, stage, agent, status, metadata, content, mode = 'append' } = params;
  if (!show || typeof show !== 'string') throw new TypeError('CRITICAL: show parameter is required and must be a string');
  if (!stage || typeof stage !== 'string') throw new TypeError('CRITICAL: stage parameter is required and must be a string');
  if (!agent || typeof agent !== 'string') throw new TypeError('CRITICAL: agent parameter is required and must be a string');
  if (mode !== 'append' && mode !== 'overwrite') throw new TypeError(`CRITICAL: mode must be 'append' or 'overwrite', got '${mode}'`);
  if (!workspaceRoot || typeof workspaceRoot !== 'string') throw new TypeError('CRITICAL: workspaceRoot parameter is required and must be a string');

  const agentsDir = path.join(workspaceRoot, 'output', show, stage, 'agents');
  const agentDir = path.join(agentsDir, agent);
  if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });

  const filePath = path.join(agentDir, 'status.md');
  let currentFm = {}, currentBody = '';
  if (fs.existsSync(filePath)) {
    const parsed = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'));
    currentFm = parsed.frontmatter;
    currentBody = parsed.body.trim();
  } else {
    const legacyPath = path.join(agentsDir, `${agent}.md`);
    if (fs.existsSync(legacyPath)) {
      const parsed = parseFrontmatter(fs.readFileSync(legacyPath, 'utf-8'));
      currentFm = parsed.frontmatter;
      currentBody = parsed.body.trim();
    }
  }

  if (status !== undefined) {
    if (typeof status !== 'string') throw new TypeError('CRITICAL: status must be a string if provided');
    currentFm.status = status;
  } else if (!currentFm.status) {
    currentFm.status = 'in_progress';
  }
  delete currentFm.conversation_id;
  if (metadata && typeof metadata === 'object') Object.assign(currentFm, metadata);

  const nowIso = new Date().toISOString();
  currentFm.updated_at = nowIso;
  let finalBody = currentBody;
  if (mode === 'overwrite') {
    finalBody = (content || '').trim();
  } else if (content && typeof content === 'string' && content.trim()) {
    const utcTimestamp = nowIso.replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
    const newEntry = `### ⏱️ Update — ${utcTimestamp}\n\n${content.trim()}`;
    finalBody = currentBody ? `${currentBody}\n\n${newEntry}` : newEntry;
  }

  fs.writeFileSync(filePath, serializeFrontmatter(currentFm, finalBody), 'utf-8');
  return { filePath, frontmatter: currentFm, body: finalBody };
}

function readDeliverableContent(dir, deliverable, workspaceRoot, showDir, stageName) {
  if (!deliverable || typeof deliverable !== 'string' || deliverable === 'null' || deliverable === 'None') return null;
  const showFullPath = (path.isAbsolute(showDir) && fs.existsSync(showDir))
    ? showDir
    : path.join(workspaceRoot, 'output', showDir);
  const candidates = [
    path.join(dir, deliverable),
    stageName ? path.join(showFullPath, stageName, deliverable) : null,
    path.join(showFullPath, deliverable)
  ].filter(Boolean);
  for (const cand of candidates) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
      try { return fs.readFileSync(cand, 'utf-8'); } catch { /* continue */ }
    }
  }
  return null;
}

function scanAgentsDir(agentsDir, workspaceRoot, showDir, stageName) {
  function getNodeTime(n) {
    if (!n) return 0;
    if (typeof n.createdAt === 'number' && n.createdAt > 0) return n.createdAt;
    if (n.type === 'group' && Array.isArray(n.children) && n.children.length > 0) {
      return Math.min(...n.children.map(getNodeTime));
    }
    return 0;
  }

  function scanDir(dir, rel = '') {
    const statusFile = path.join(dir, 'status.md');
    if (rel && fs.existsSync(statusFile)) {
      const raw = fs.readFileSync(statusFile, 'utf-8');
      const parsed = parseFrontmatter(raw);
      const fm = parsed.frontmatter;
      if (fm && (!fm.type || fm.type === 'agent')) {
        const deliverableContent = readDeliverableContent(dir, fm.deliverable, workspaceRoot, showDir, stageName);
        let createdAt = 0;
        try {
          const stat = fs.statSync(statusFile);
          const dirStat = fs.statSync(dir);
          const candidates = [stat.birthtimeMs, dirStat.birthtimeMs, stat.ctimeMs, dirStat.ctimeMs].filter(t => typeof t === 'number' && t > 0);
          createdAt = candidates.length > 0 ? Math.min(...candidates) : 0;
        } catch {
          // fallback
        }
        return {
          type: 'agent',
          id: rel.replace(/\//g, '_'),
          name: path.basename(dir),
          filename: 'status.md',
          frontmatter: fm,
          body: parsed.body.trim(),
          deliverableContent,
          createdAt
        };
      }
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const children = [];

    if (!rel) {
      for (const ent of entries) {
        if (ent.isFile() && ent.name.endsWith('.md') && ent.name !== 'status.md') {
          const filePath = path.join(dir, ent.name);
          const raw = fs.readFileSync(filePath, 'utf-8');
          const parsed = parseFrontmatter(raw);
          const fm = parsed.frontmatter;
          if (fm && (fm.type === 'agent' || fm.status)) {
            const key = path.basename(ent.name, '.md');
            const deliverableContent = readDeliverableContent(dir, fm.deliverable, workspaceRoot, showDir, stageName);
            let createdAt = 0;
            try {
              const stat = fs.statSync(filePath);
              createdAt = stat.birthtimeMs || stat.ctimeMs || 0;
            } catch {
              // fallback
            }
            children.push({
              type: 'agent',
              id: key,
              name: key,
              filename: ent.name,
              frontmatter: fm,
              body: parsed.body.trim(),
              deliverableContent,
              createdAt
            });
          }
        }
      }
    }

    for (const ent of entries) {
      if (ent.isDirectory()) {
        const subDir = path.join(dir, ent.name);
        const subRel = rel ? `${rel}/${ent.name}` : ent.name;
        const child = scanDir(subDir, subRel);
        if (child) children.push(child);
      }
    }

    if (children.length === 0) return null;
    children.sort((a, b) => {
      const ta = getNodeTime(a);
      const tb = getNodeTime(b);
      if (ta && tb && ta !== tb) return ta - tb;
      return (a.name || a.id).localeCompare(b.name || b.id);
    });
    if (!rel) return children;

    return {
      type: 'group',
      id: rel.replace(/\//g, '_'),
      name: path.basename(dir),
      children,
      createdAt: getNodeTime({ children })
    };
  }

  const rootNodes = (scanDir(agentsDir) || []).sort((a, b) => {
    const ta = getNodeTime(a);
    const tb = getNodeTime(b);
    if (ta && tb && ta !== tb) return ta - tb;
    return (a.name || a.id).localeCompare(b.name || b.id);
  });
  const map = {};
  function indexNode(node) {
    map[node.id] = node;
    if (node.type === 'group' && node.children) {
      node.children.forEach(indexNode);
    }
  }
  rootNodes.forEach(indexNode);
  map._nodes = rootNodes;
  return map;
}

export function readStageAgents(showDir, stageName, workspaceRoot) {
  if (!showDir || !stageName || !workspaceRoot) {
    throw new TypeError('CRITICAL: showDir, stageName, and workspaceRoot are required strings');
  }
  const showFullPath = (path.isAbsolute(showDir) && fs.existsSync(showDir))
    ? showDir
    : path.join(workspaceRoot, 'output', showDir);
  let agentsDir = path.join(showFullPath, stageName, 'agents');
  if (!fs.existsSync(agentsDir)) {
    const altStage = stageName.startsWith('stage') ? stageName.replace(/^stage/, '') : `stage${stageName}`;
    const altDir = path.join(showFullPath, altStage, 'agents');
    if (fs.existsSync(altDir)) {
      agentsDir = altDir;
    } else {
      return {};
    }
  }
  return scanAgentsDir(agentsDir, workspaceRoot, showDir, stageName);
}

export function readDirectAgents(showDir, workspaceRoot) {
  if (!showDir || typeof showDir !== 'string' || !workspaceRoot || typeof workspaceRoot !== 'string') {
    throw new TypeError('CRITICAL: showDir and workspaceRoot are required strings');
  }
  const showFullPath = (path.isAbsolute(showDir) && fs.existsSync(showDir))
    ? showDir
    : path.join(workspaceRoot, 'output', showDir);
  const agentsDir = path.join(showFullPath, 'agents');
  if (!fs.existsSync(agentsDir)) {
    return {};
  }
  return scanAgentsDir(agentsDir, workspaceRoot, showDir, null);
}

export function readAllStagesAgents(showDir, workspaceRoot) {
  if (!showDir || typeof showDir !== 'string' || !workspaceRoot || typeof workspaceRoot !== 'string') {
    throw new TypeError('CRITICAL: showDir and workspaceRoot are required strings');
  }
  const showFullPath = (path.isAbsolute(showDir) && fs.existsSync(showDir))
    ? showDir
    : path.join(workspaceRoot, 'output', showDir);
  if (!fs.existsSync(showFullPath)) {
    return [];
  }

  const STAGE_REGEX = /^stage(\d{2})_(.+)$/i;
  const entries = fs.readdirSync(showFullPath, { withFileTypes: true })
    .filter(d => d.isDirectory() && STAGE_REGEX.test(d.name))
    .map(d => {
      const match = d.name.match(STAGE_REGEX);
      const num = parseInt(match[1], 10);
      const name = match[2]
        .split(/[-_]+/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      return { num, name, stageDir: d.name };
    });

  entries.sort((a, b) => a.num - b.num);

  const list = [];
  for (const s of entries) {
    const agents = readStageAgents(showDir, s.stageDir, workspaceRoot);
    if (Object.keys(agents).length > 0) {
      list.push({ num: s.num, name: s.name, stageDir: s.stageDir, nodes: agents._nodes || Object.values(agents), agents });
    }
  }

  const directAgents = readDirectAgents(showDir, workspaceRoot);
  if (Object.keys(directAgents).length > 0) {
    const directNodes = directAgents._nodes || Object.values(directAgents);
    const directEntry = {
      num: null,
      name: 'Agents',
      stageDir: 'agents',
      nodes: directNodes,
      agents: directAgents
    };
    if (entries.length === 0) {
      list.push(directEntry);
    } else {
      list.unshift(directEntry);
    }
  }

  return list;
}
