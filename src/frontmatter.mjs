/**
 * Frontmatter parser and serializer for WeaveMAS status.md files.
 */

export const ALLOWED_FRONTMATTER_KEYS = new Set([
  'type',
  'status',
  'instructions_file',
  'deliverable',
  'updated_at'
]);

/**
 * Parses frontmatter from a markdown string.
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
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else if (val === 'true') {
      val = true;
    } else if (val === 'false') {
      val = false;
    } else if (val === 'null' || val === '~') {
      val = null;
    } else if (!isNaN(Number(val)) && val !== '') {
      val = Number(val);
    }
    frontmatter[key] = val;
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
      throw new Error(`CRITICAL: Forbidden frontmatter key '${key}'. The status.md schema is strictly closed to: ${Array.from(ALLOWED_FRONTMATTER_KEYS).join(', ')}`);
    }
  }
  const lines = ['---'];
  for (const [key, val] of Object.entries(frontmatter)) {
    if (val === null) {
      lines.push(`${key}: null`);
    } else if (typeof val === 'string') {
      lines.push(`${key}: "${val}"`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  lines.push('---');
  return body ? `${lines.join('\n')}\n\n${body.trim()}\n` : `${lines.join('\n')}\n`;
}
