/**
 * Frontmatter parser and serializer for WeaveMX weave.md files.
 */

export const ALLOWED_FRONTMATTER_KEYS = new Set([
  'type',
  'status',
  'instructions_file',
  'inputs',
  'outputs',
  'conversation_id',
  'updated_at'
]);

/**
 * Unquotes a scalar YAML string value.
 * @param {string} raw 
 * @returns {unknown}
 */
function parseScalarValue(raw) {
  const val = raw.trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null' || val === '~') return null;
  if (val === '[]') return [];
  if (!isNaN(Number(val)) && val !== '') return Number(val);
  return val;
}

/**
 * Parses frontmatter from a markdown string, supporting multi-line YAML lists (e.g. inputs).
 * @param {string} content 
 * @returns {{ frontmatter: Record<string, unknown>, body: string }}
 */
export function parseFrontmatter(content) {
  if (typeof content !== 'string') {
    throw new TypeError('CRITICAL: Content must be a string to parse frontmatter.');
  }
  const clean = content.replace(/^\uFEFF/, '').trimStart();
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: clean };
  }
  const frontmatter = {};
  let currentListKey = null;

  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (currentListKey && trimmed.startsWith('-')) {
      const itemRaw = trimmed.slice(1).trim();
      frontmatter[currentListKey].push(String(parseScalarValue(itemRaw)));
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

/**
 * Serializes frontmatter and markdown body. Enforces strict closed schema.
 * @param {Record<string, unknown>} frontmatter 
 * @param {string} body 
 * @returns {string}
 */
export function serializeStatus(frontmatter, body) {
  if (!frontmatter || typeof frontmatter !== 'object') {
    throw new TypeError('CRITICAL: Frontmatter must be a non-null object.');
  }
  for (const key of Object.keys(frontmatter)) {
    if (!ALLOWED_FRONTMATTER_KEYS.has(key)) {
      throw new Error(`CRITICAL: Forbidden frontmatter key '${key}'. The weave.md schema is strictly closed to: ${Array.from(ALLOWED_FRONTMATTER_KEYS).join(', ')}`);
    }
  }
  const lines = ['---'];
  for (const [key, val] of Object.entries(frontmatter)) {
    if (val === undefined) continue;
    if (val === null) {
      lines.push(`${key}: null`);
    } else if (Array.isArray(val)) {
      if (val.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of val) {
          lines.push(`  - "${String(item)}"`);
        }
      }
    } else if (typeof val === 'string') {
      lines.push(`${key}: "${val}"`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  lines.push('---');
  return body ? `${lines.join('\n')}\n\n${body.trim()}\n` : `${lines.join('\n')}\n`;
}
