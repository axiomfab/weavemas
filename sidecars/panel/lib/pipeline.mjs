import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

export const STAGE_DIR_REGEX = /^stage(\d{2})_(.+)$/i;

export function formatStageName(rawName) {
  if (!rawName || typeof rawName !== 'string') {
    throw new TypeError('CRITICAL: rawName is required and must be a string');
  }
  return rawName
    .split(/[-_]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function getAllContextDirs(workspaceDir) {
  if (!workspaceDir || typeof workspaceDir !== 'string') {
    throw new Error('CRITICAL: Workspace directory is required and must be a string');
  }
  const outputDir = join(workspaceDir, 'output');
  if (!existsSync(outputDir)) return [];

  const entries = readdirSync(outputDir, { withFileTypes: true })
    .filter(d => {
      if (!d.isDirectory()) return false;
      const fullPath = join(outputDir, d.name);
      try {
        const subEntries = readdirSync(fullPath, { withFileTypes: true });
        return subEntries.some(sub => (sub.isDirectory() && STAGE_DIR_REGEX.test(sub.name)) || sub.name === 'status.md' || (sub.isDirectory() && sub.name === 'agents'));
      } catch {
        return false;
      }
    })
    .map(d => {
      const fullPath = join(outputDir, d.name).replace(/\\/g, '/');
      const dirLabel = `output\\${d.name}`;
      return {
        id: d.name,
        name: d.name,
        path: fullPath,
        title: dirLabel,
        displayPath: dirLabel,
        mtime: statSync(fullPath).mtimeMs
      };
    });

  entries.sort((a, b) => b.mtime - a.mtime);
  return entries;
}

export const getAllShowDirs = getAllContextDirs;

export function getActiveContextDir(workspaceDir) {
  const all = getAllContextDirs(workspaceDir);
  return all.length > 0 ? all[0].path : null;
}

export const getActiveShowDir = getActiveContextDir;

export function extractContextTitle(showDir) {
  if (!showDir) return 'WeaveMAS Pipeline';

  // 1. Check direct deliverables at context root
  const directCandidates = [
    join(showDir, '02_final_article.md'),
    join(showDir, '01_verified_draft.md'),
    join(showDir, 'final_article.md'),
    join(showDir, '02_concept.md'),
    join(showDir, '01_setup.md'),
    join(showDir, 'concept.md'),
    join(showDir, 'setup.md')
  ];
  for (const cand of directCandidates) {
    if (existsSync(cand)) {
      const text = readFileSync(cand, 'utf8');
      const h1Match = text.match(/^#\s+(?:(?:Show\s+)?Concept:\s*|(?:Director\s+)?Setup(?:\s*&\s*Guidelines)?:\s*|Article:\s*)?(.+)$/m);
      if (h1Match) return h1Match[1].trim();
    }
  }

  // 2. Check stage subfolders
  const stageCandidates = [
    join(showDir, 'stage02_concept', 'concept.md'),
    join(showDir, 'stage01_setup', 'setup.md'),
    join(showDir, 'stage01_setup', 'agents', 'director', 'setup.md'),
    join(showDir, 'stage01_drafting', 'agents', 'writer', 'draft.md')
  ];
  for (const s of stageCandidates) {
    if (existsSync(s)) {
      const text = readFileSync(s, 'utf8');
      const topicMatch = text.match(/\*\s+\*\*Topic\*\*:\s*(.+)/i);
      if (topicMatch) return topicMatch[1].trim();
      const h1Match = text.match(/^#\s+(?:(?:Show\s+)?Concept:\s*|(?:Director\s+)?Setup(?:\s*&\s*Guidelines)?:\s*|Article:\s*)?(.+)$/m);
      if (h1Match) return h1Match[1].trim();
    }
  }

  // 3. Check status.md
  const statusPath = join(showDir, 'status.md');
  if (existsSync(statusPath)) {
    const text = readFileSync(statusPath, 'utf8');
    const topicMatch = text.match(/topic:\s*"?([^"\r\n]+)"?/i);
    if (topicMatch) return topicMatch[1].trim();
  }

  const base = basename(showDir);
  const slugWithDateMatch = base.match(/^[a-z]+_\d{2,4}[-_]\d{2}[-_]\d{2,4}_(.+)$/i);
  if (slugWithDateMatch) {
    return slugWithDateMatch[1].split(/[-_]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  const prefixMatch = base.match(/^[a-z]+_(.+)$/i);
  if (prefixMatch) {
    return prefixMatch[1].split(/[-_]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return base || 'WeaveMAS Pipeline';
}

export const extractShowTitle = extractContextTitle;

export function parseOrchestratorState(showDir) {
  if (!showDir || typeof showDir !== 'string') {
    throw new Error('CRITICAL: Show directory is required and must be a string');
  }
  const candidates = [join(showDir, 'state.md'), join(showDir, 'status.md')];
  for (const c of candidates) {
    if (existsSync(c)) {
      const text = readFileSync(c, 'utf8');
      const match = text.match(/status:\s*"?([^"\r\n]+)"?/i);
      if (match) {
        const rawStatus = match[1].trim();
        const stageMatch = rawStatus.match(/(?:stage0?|stage)(\d+)/i);
        const stageNum = stageMatch ? parseInt(stageMatch[1], 10) : null;
        return {
          rawStatus,
          stageNum,
          isInProgress: rawStatus.startsWith('in_progress'),
          isCompleted: rawStatus.startsWith('completed') || rawStatus === 'done'
        };
      }
    }
  }
  return null;
}

export function evaluatePipelineStages(showDir) {
  if (!showDir || typeof showDir !== 'string') {
    throw new Error('CRITICAL: Show directory is required and must be a string');
  }
  if (!existsSync(showDir)) {
    throw new Error(`CRITICAL: Show directory not found: ${showDir}`);
  }

  const subDirs = readdirSync(showDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && STAGE_DIR_REGEX.test(d.name))
    .map(d => {
      const match = d.name.match(STAGE_DIR_REGEX);
      const num = parseInt(match[1], 10);
      const rawName = match[2];
      const name = formatStageName(rawName);
      return { dirName: d.name, num, rawName, name };
    });

  subDirs.sort((a, b) => a.num - b.num);

  const orchState = parseOrchestratorState(showDir);
  const stages = {};
  let previousCompleted = true;
  let activeStageNum = null;

  for (const s of subDirs) {
    const stagePath = join(showDir, s.dirName);
    let isCompleted = false;
    let status = 'pending';
    let tag = `STAGE ${s.num}: PENDING`;

    if (orchState && orchState.isCompleted) {
      isCompleted = true;
      status = 'completed';
      tag = `STAGE ${s.num}: COMPLETED`;
    } else if (orchState && orchState.stageNum !== null) {
      // Orchestrator status file is the source of truth
      if (s.num < orchState.stageNum) {
        isCompleted = true;
        status = 'completed';
        tag = `STAGE ${s.num}: COMPLETED`;
      } else if (s.num === orchState.stageNum) {
        if (orchState.isInProgress) {
          isCompleted = false;
          status = 'in_progress';
          tag = `STAGE ${s.num}: IN PROGRESS`;
          activeStageNum = s.num;
        } else if (orchState.isCompleted) {
          isCompleted = true;
          status = 'completed';
          tag = `STAGE ${s.num}: COMPLETED`;
          activeStageNum = s.num;
        }
      } else {
        isCompleted = false;
        status = 'pending';
        tag = `STAGE ${s.num}: PENDING`;
      }
    } else {
      // Heuristic fallback when orchestrator status file is absent
      const stageStatusPath = join(stagePath, 'status.md');
      if (existsSync(stageStatusPath)) {
        const text = readFileSync(stageStatusPath, 'utf8');
        const sm = text.match(/status:\s*"?([^"\r\n]+)"?/i);
        if (sm && (sm[1].startsWith('completed') || sm[1] === 'done')) isCompleted = true;
      }

      if (!isCompleted) {
        const filesInStage = readdirSync(stagePath, { withFileTypes: true })
          .filter(f => f.isFile() && f.name.endsWith('.md') && f.name !== 'status.md');
        if (filesInStage.length > 0) isCompleted = true;
      }

      if (isCompleted) {
        status = 'completed';
        tag = `STAGE ${s.num}: COMPLETED`;
      } else if (previousCompleted) {
        status = 'in_progress';
        tag = `STAGE ${s.num}: IN PROGRESS`;
        if (!activeStageNum) activeStageNum = s.num;
        previousCompleted = false;
      } else {
        previousCompleted = false;
      }
    }

    stages[s.num] = {
      num: s.num,
      name: s.name,
      title: `Stage ${s.num}: ${s.name}`,
      folder: `${s.dirName}/`,
      status,
      isCompleted,
      tag,
      dirName: s.dirName
    };
  }

  const stageList = Object.values(stages);
  if (!activeStageNum && stageList.length > 0) {
    const firstInProg = stageList.find(s => s.status === 'in_progress');
    activeStageNum = firstInProg ? firstInProg.num : stageList[0].num;
  }

  return {
    showTitle: extractShowTitle(showDir),
    contextTitle: extractContextTitle(showDir),
    showDir,
    contextDir: showDir,
    activeStageNum,
    stages,
    stageList
  };
}
