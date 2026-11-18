import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWeaveStatus, LIFECYCLE_STATES, STAGE_DIR_REGEX } from '../src/status_grammar.mjs';

test('parseWeaveStatus - Happy Path: parses [<stage>/]<state>[/<detail>] across agent, staged and stageless forms', () => {
  assert.deepEqual(parseWeaveStatus('completed'), { stage: null, state: 'completed', detail: null });
  assert.deepEqual(parseWeaveStatus('in_progress/01_research'), { stage: null, state: 'in_progress', detail: '01_research' });
  assert.deepEqual(parseWeaveStatus('stage01_setup/in_progress'), { stage: 'stage01_setup', state: 'in_progress', detail: null });
  assert.deepEqual(
    parseWeaveStatus('stage02_concept/in_progress/iteration_2/sub'),
    { stage: 'stage02_concept', state: 'in_progress', detail: 'iteration_2/sub' }
  );
  for (const state of LIFECYCLE_STATES) {
    assert.equal(parseWeaveStatus(`stage01_x/${state}`).state, state);
  }
});

test('parseWeaveStatus - Failure Path 1: non-string, empty, or whitespace input throws TypeError', () => {
  for (const bad of [null, undefined, 42, '', '   ']) {
    assert.throws(() => parseWeaveStatus(bad), { name: 'TypeError', message: /CRITICAL: Status must be a non-empty string/ });
  }
});

test('parseWeaveStatus - Failure Path 2: unknown state, missing state after stage, empty segments, and non-canonical stage throw Error', () => {
  assert.throws(() => parseWeaveStatus('random_state'), { message: /CRITICAL: Invalid status state 'random_state'/ });
  assert.throws(() => parseWeaveStatus('stage01_setup'), { message: /CRITICAL: Invalid status state 'stage01_setup'/ });
  assert.throws(() => parseWeaveStatus('stage01_setup/review_needed'), { message: /CRITICAL: Invalid status state/ });
  assert.throws(() => parseWeaveStatus('in_progress//detail'), { message: /segments must be non-empty/ });
  assert.throws(() => parseWeaveStatus('/in_progress'), { message: /segments must be non-empty/ });
  // Single-digit stage is not a canonical stage segment, so 'stage1_setup' is treated as an (invalid) state
  assert.throws(() => parseWeaveStatus('stage1_setup/in_progress'), { message: /CRITICAL: Invalid status state/ });
  assert.equal(STAGE_DIR_REGEX.test('stage1_setup'), false);
});
