/**
 * WeaveMAS status grammar: `[<stage>/]<state>[/<detail>]`
 *
 * - `<stage>`  (optional) — a stage directory name matching `stageNN_<slug>` (orchestrators of staged pipelines only).
 * - `<state>`  (required) — one of LIFECYCLE_STATES.
 * - `<detail>` (optional) — free-form remainder (may itself contain `/`), e.g. `iteration_2` or `01_research`.
 *
 * Stage names and lifecycle states are disjoint sets, so the first segment unambiguously identifies whether a stage prefix is present.
 */

/** Allowed lifecycle states for `weave_update`. */
export const LIFECYCLE_STATES = Object.freeze([
  'not_started',
  'in_progress',
  'waiting',
  'awaiting_review',
  'blocked',
  'completed'
]);

/** Canonical stage directory / stage segment pattern (`stage01_setup`). Capture groups: 1 = number, 2 = slug. */
export const STAGE_DIR_REGEX = /^stage(\d{2})_(.+)$/i;

/**
 * @typedef {Object} ParsedWeaveStatus
 * @property {string|null} stage  Stage segment (e.g. `stage01_setup`) or null when absent.
 * @property {string} state       Lifecycle state (one of LIFECYCLE_STATES).
 * @property {string|null} detail Free-form detail after the state, or null when absent.
 */

/**
 * Strictly parses a WeaveMAS status string of the form `[<stage>/]<state>[/<detail>]`.
 * @param {string} status
 * @returns {ParsedWeaveStatus}
 */
export function parseWeaveStatus(status) {
  if (typeof status !== 'string' || !status.trim()) {
    throw new TypeError('CRITICAL: Status must be a non-empty string.');
  }
  const segments = status.split('/');
  if (segments.some(seg => seg.trim() === '')) {
    throw new Error(`CRITICAL: Invalid status state '${status}'. Status segments must be non-empty (expected '[<stage>/]<state>[/<detail>]').`);
  }

  let stage = null;
  let stateIdx = 0;
  if (STAGE_DIR_REGEX.test(segments[0])) {
    stage = segments[0];
    stateIdx = 1;
  }

  const state = segments[stateIdx];
  if (state === undefined || !LIFECYCLE_STATES.includes(state)) {
    throw new Error(
      `CRITICAL: Invalid status state '${status}'. Expected '[<stage>/]<state>[/<detail>]' where <state> is one of: ${LIFECYCLE_STATES.join(', ')}`
    );
  }

  const detail = segments.length > stateIdx + 1 ? segments.slice(stateIdx + 1).join('/') : null;
  return { stage, state, detail };
}
