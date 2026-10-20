import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const agentPanelPath = path.resolve(__dirname, '..', 'sidecars', 'panel', 'trackers', 'agent_panel.js');
const code = fs.readFileSync(agentPanelPath, 'utf-8');
const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(code, context);
const AgentPanel = context.window.AgentPanel || context.window.ConceptTracker;
assert.ok(context.window.AgentPanel, 'AgentPanel should be exported on window');
assert.ok(context.window.ConceptTracker, 'ConceptTracker should be aliased for backward compatibility');
const ConceptTracker = AgentPanel;
const {
  render,
  getShowrunnerChip,
  getSourcerChip,
  formatAgentTitle,
  getAgentIcon,
  getStatusBadge,
  getAgentValueChip,
  expandedGroups,
  expandedCards,
  cardViewModes,
  pendingScrollBottom
} = ConceptTracker;

const statusToolPath = path.resolve(__dirname, '..', 'sidecars', 'panel', 'lib', 'status_tool.mjs');
const { readAllStagesAgents } = await import(`file://${statusToolPath.replace(/\\/g, '/')}`);

test('Happy Path: Returns formatted chip when total_acts and total_segments are both provided', () => {
  const chip = getShowrunnerChip({ total_acts: 4, total_segments: 26 });
  assert.equal(chip, '4 Acts • 26 Segments');

  const sourcerChip = getSourcerChip({ progress: '4/10' });
  assert.equal(sourcerChip, '4/10 Verified');
});

test('Failure Path 1: Returns empty string when frontmatter is null, undefined, or empty object', () => {
  assert.equal(getShowrunnerChip(null), '');
  assert.equal(getShowrunnerChip(undefined), '');
  assert.equal(getShowrunnerChip({}), '');
  assert.equal(getSourcerChip(null), '');
  assert.equal(getSourcerChip({}), '');
});

test('Failure Path 2: Returns empty string without inventing fallbacks when only one property exists', () => {
  assert.equal(getShowrunnerChip({ total_acts: 4 }), '');
  assert.equal(getShowrunnerChip({ total_segments: 22 }), '');
  assert.equal(getShowrunnerChip({ status: 'in_progress' }), '');
  assert.equal(getSourcerChip({ status: 'in_progress' }), '');
});

test('Happy Path: Dynamic Title Formatting parses role slugs and folder names into clean Title Case', () => {
  assert.equal(formatAgentTitle('showrunner', { role: 'stage2_concept/agent_showrunner' }), 'Showrunner');
  assert.equal(formatAgentTitle('youtube_sourcer', { role: 'stage2_concept/agent_youtubesourcer' }), 'YouTube Sourcer');
  assert.equal(formatAgentTitle('custom_reviewer', {}), 'Custom Reviewer');
});

test('Failure Path: Dynamic Title Formatting handles null, undefined, or missing ids gracefully', () => {
  assert.equal(formatAgentTitle('', null), 'Agent');
  assert.equal(formatAgentTitle(undefined, undefined), 'Agent');
});

test('Happy Path: Status Badge correctly renders WeaveMAS compound sub-states', () => {
  const completed = getStatusBadge('completed/concept_ready');
  assert.match(completed, /completed: concept ready/);
  assert.match(completed, /bg-emerald-500/);

  const waiting = getStatusBadge('waiting/sourcer_calibration');
  assert.match(waiting, /waiting: sourcer calibration/);
  assert.match(waiting, /bg-amber-500/);

  const inProg = getStatusBadge('in_progress/designing_outline');
  assert.match(inProg, /in progress: designing outline/);
  assert.match(inProg, /vivid-pulse/);

  const notStarted = getStatusBadge('not_started');
  assert.match(notStarted, /not started/);
});

test('Failure Path: Status Badge handles null, undefined, or unmapped status strings', () => {
  assert.match(getStatusBadge(null), /pending/);
  assert.match(getStatusBadge(undefined), /pending/);
  assert.match(getStatusBadge(''), /pending/);
});

test('Happy Path: Value Chip extracts deliverable or progress from frontmatter', () => {
  const deliverableChip = getAgentValueChip({ deliverable: 'concept.md' });
  assert.match(deliverableChip, /concept\.md/);

  const progressChip = getAgentValueChip({ progress: '12/12' });
  assert.equal(progressChip, '12/12 Verified');
});

test('Failure Path: Value Chip returns empty string when frontmatter has no matching value fields or null deliverable', () => {
  assert.equal(getAgentValueChip(null), '');
  assert.equal(getAgentValueChip(undefined), '');
  assert.equal(getAgentValueChip({}), '');
  assert.equal(getAgentValueChip({ status: 'completed' }), '');
  assert.equal(getAgentValueChip({ deliverable: null }), '');
  assert.equal(getAgentValueChip({ deliverable: 'null' }), '');
  assert.equal(getAgentValueChip({ deliverable: 'None' }), '');
});

test('Happy Path: Multi-stage render generates horizontal stage section headers and agent cards with bold white and gray typography', () => {
  const container = { innerHTML: '', querySelectorAll: () => [] };
  const mockStagesData = {
    stages: [
      {
        num: 1,
        name: 'Setup & Persona',
        agents: {
          director: {
            id: 'director',
            frontmatter: { role: 'stage1_setup/agent_director', status: 'completed/setup_ready', deliverable: 'setup.md' }
          }
        }
      },
      {
        num: 2,
        name: 'Concept & Outline',
        agents: {
          showrunner: {
            id: 'showrunner',
            frontmatter: { role: 'stage2_concept/agent_showrunner', status: 'completed/concept_ready', deliverable: 'concept.md' }
          }
        }
      }
    ]
  };

  render(container, mockStagesData);
  assert.match(container.innerHTML, /Stage 1/);
  assert.match(container.innerHTML, /font-bold text-white/);
  assert.match(container.innerHTML, /text-slate-400/);
  assert.match(container.innerHTML, /Setup &amp; Persona/);
  assert.match(container.innerHTML, /h-px bg-slate-800/);
  assert.match(container.innerHTML, /1 Agent/);
  assert.match(container.innerHTML, /Director/);
  assert.match(container.innerHTML, /Stage 2/);
  assert.match(container.innerHTML, /Showrunner/);
  // Verify chip style is absent
  assert.doesNotMatch(container.innerHTML, /bg-amber-500\/10/);
  // Verify obsolete wrapper is absent
  assert.doesNotMatch(container.innerHTML, /Pipeline Subagents/);
  assert.doesNotMatch(container.innerHTML, /Dynamic WeaveMAS Discovery/);
  // Verify icons are strictly absent
  assert.doesNotMatch(container.innerHTML, /🎬|🔍|🤖|✍️|🎙️|📹|🛡️/);
  assert.equal(getAgentIcon('director'), '');
  assert.equal(getAgentIcon('youtube_sourcer'), '');
});

test('Happy Path: Multi-stage render filters to specific stage and un-filters when null', () => {
  const container = { innerHTML: '', querySelectorAll: () => [] };
  const mockStagesData = {
    stages: [
      {
        num: 1,
        name: 'Setup',
        agents: {
          director: { id: 'director', frontmatter: { role: 'stage1_setup/agent_director', status: 'completed' } }
        }
      },
      {
        num: 2,
        name: 'Concept',
        agents: {
          showrunner: { id: 'showrunner', frontmatter: { role: 'stage2_concept/agent_showrunner', status: 'completed' } }
        }
      }
    ]
  };

  // Filter to Stage 1 only
  render(container, mockStagesData, 1);
  assert.match(container.innerHTML, /Director/);
  assert.doesNotMatch(container.innerHTML, /Showrunner/);

  // Filter to Stage 2 only
  render(container, mockStagesData, 2);
  assert.doesNotMatch(container.innerHTML, /Director/);
  assert.match(container.innerHTML, /Showrunner/);

  // Filter disabled (null): both appear
  render(container, mockStagesData, null);
  assert.match(container.innerHTML, /Director/);
  assert.match(container.innerHTML, /Showrunner/);
});

test('Failure Path 1: Multi-stage render handles empty or missing stages gracefully', () => {
  const container = { innerHTML: '', querySelectorAll: () => [] };
  render(container, { stages: [] });
  assert.match(container.innerHTML, /No subagents discovered across pipeline stages yet/);
  assert.doesNotMatch(container.innerHTML, /Pipeline Subagents/);

  render(container, null);
  assert.match(container.innerHTML, /No subagents discovered across pipeline stages yet/);
});

test('Failure Path 2: Multi-stage render maintains backward compatibility with legacy single-stage data', () => {
  const container = { innerHTML: '', querySelectorAll: () => [] };
  const legacyData = {
    agents: {
      youtube_sourcer: {
        id: 'youtube_sourcer',
        frontmatter: { role: 'agent_youtubesourcer', status: 'completed', progress: '12/12' }
      }
    }
  };
  render(container, legacyData);
  assert.match(container.innerHTML, /Stage 2/);
  assert.match(container.innerHTML, /YouTube Sourcer/);
  assert.match(container.innerHTML, /1 Agent/);
});

test('Happy Path: readAllStagesAgents scans multiple stage directories and returns active stages', () => {
  const ws = path.resolve(process.cwd());
  const result = readAllStagesAgents('show_09-10-2026_the_clash', ws);
  assert.ok(Array.isArray(result));
});

test('Failure Path 1: readAllStagesAgents throws TypeError when showDir or workspaceRoot is missing', () => {
  assert.throws(() => readAllStagesAgents(null, 'c:/ws'), /CRITICAL/);
  assert.throws(() => readAllStagesAgents('show_dir', null), /CRITICAL/);
});

test('Failure Path 2: readAllStagesAgents returns empty array when show directory has no agents', () => {
  const ws = path.resolve(process.cwd());
  const result = readAllStagesAgents('show_nonexistent_empty_test', ws);
  assert.deepEqual(result, []);
});

test('Happy Path: Renders hierarchical agent group cards containing child agents', () => {
  const container = { innerHTML: '', querySelectorAll: () => [] };
  const mockTreeData = {
    stages: [
      {
        num: 3,
        name: 'Writing',
        nodes: [
          {
            type: 'group',
            id: 'act_1',
            name: 'act_1',
            children: [
              {
                type: 'group',
                id: 'act_1_segment_01',
                name: 'segment_01',
                children: [
                  {
                    type: 'agent',
                    id: 'act_1_segment_01_architect',
                    name: 'architect',
                    frontmatter: { role: 'stage3_writing/agent_architect', status: 'completed' }
                  },
                  {
                    type: 'agent',
                    id: 'act_1_segment_01_writer',
                    name: 'writer',
                    frontmatter: { role: 'stage3_writing/agent_writer', status: 'in_progress' }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  // 1. Initially collapsed by default: Act 1 is visible, children are collapsed
  render(container, mockTreeData);
  assert.match(container.innerHTML, /Stage 3/);
  assert.match(container.innerHTML, /Act 1/);
  assert.match(container.innerHTML, /1\/2 completed/);
  assert.match(container.innerHTML, /vivid-pulse/);
  assert.doesNotMatch(container.innerHTML, /Segment 01/);
  assert.doesNotMatch(container.innerHTML, /Architect/);

  // 2. Expand Act 1
  ConceptTracker.expandedGroups.add('grp_s3_act_1');
  render(container, mockTreeData);
  assert.match(container.innerHTML, /Segment 01/);
  assert.doesNotMatch(container.innerHTML, /Architect/);

  // 3. Expand Segment 01
  ConceptTracker.expandedGroups.add('grp_s3_act_1_segment_01');
  render(container, mockTreeData);
  assert.match(container.innerHTML, /Architect/);
  assert.match(container.innerHTML, /Writer/);
  assert.match(container.innerHTML, /1\/2 completed/);

  // Cleanup
  ConceptTracker.expandedGroups.clear();
});

test('Happy Path: Status Badge renders not_started as neutral slate badge', () => {
  const badge = ConceptTracker.getStatusBadge('not_started');
  assert.match(badge, /not started/);
  assert.match(badge, /text-slate-400/);
  assert.doesNotMatch(badge, /vivid-pulse/);
});

test('Happy Path: Group Summary Chip renders green when all agents completed', () => {
  const groupNode = {
    type: 'group',
    id: 'grp_test_done',
    children: [
      { type: 'agent', frontmatter: { status: 'completed' } },
      { type: 'agent', frontmatter: { status: 'completed' } }
    ]
  };
  const chip = ConceptTracker.getGroupSummaryChip(groupNode);
  assert.match(chip, /2\/2 completed/);
  assert.match(chip, /bg-emerald-500\/20/);
  assert.doesNotMatch(chip, /vivid-pulse/);
});

test('Happy Path: Group Summary Chip renders yellow blinking when an agent is in progress', () => {
  const groupNode = {
    type: 'group',
    id: 'grp_test_prog',
    children: [
      { type: 'agent', frontmatter: { status: 'completed' } },
      { type: 'agent', frontmatter: { status: 'in_progress/drafting' } },
      { type: 'agent', frontmatter: { status: 'not_started' } }
    ]
  };
  const chip = ConceptTracker.getGroupSummaryChip(groupNode);
  assert.match(chip, /1\/3 completed/);
  assert.match(chip, /vivid-pulse/);
  assert.doesNotMatch(chip, /bg-emerald-500/);
});

test('Happy Path: Group Summary Chip renders grey when incomplete and no agent in progress', () => {
  const groupNode = {
    type: 'group',
    id: 'grp_test_pending',
    children: [
      { type: 'agent', frontmatter: { status: 'completed' } },
      { type: 'agent', frontmatter: { status: 'not_started' } }
    ]
  };
  const chip = ConceptTracker.getGroupSummaryChip(groupNode);
  assert.match(chip, /1\/2 completed/);
  assert.match(chip, /bg-slate-800/);
  assert.doesNotMatch(chip, /vivid-pulse/);
  assert.doesNotMatch(chip, /bg-emerald-500/);
});

test('Happy Path: Deliverable Chip renders interactive button with data-deliverable-toggle', () => {
  const normalChip = getAgentValueChip({ deliverable: 'setup.md' }, 'card_s1_director', false);
  assert.match(normalChip, /data-deliverable-toggle="card_s1_director"/);
  assert.match(normalChip, /setup\.md/);
  assert.match(normalChip, /cursor-pointer/);
  assert.doesNotMatch(normalChip, /ring-1 ring-indigo-400/);

  const activeChip = getAgentValueChip({ deliverable: 'setup.md' }, 'card_s1_director', true);
  assert.match(activeChip, /ring-1 ring-indigo-400/);
  assert.match(activeChip, /bg-indigo-500\/30/);
});

test('Happy Path: Renders deliverable content when card is in deliverable view mode', () => {
  const container = { innerHTML: '', querySelectorAll: () => [] };
  const mockData = {
    stages: [
      {
        num: 1,
        name: 'Setup',
        agents: {
          director: {
            id: 'director',
            frontmatter: { role: 'stage1_setup/agent_director', status: 'completed', deliverable: 'setup.md' },
            body: '### Update 1\nStarted.',
            deliverableContent: '# Setup Title\nGuideline content here.'
          }
        }
      }
    ]
  };

  expandedCards.add('card_s1_director');
  cardViewModes.set('card_s1_director', 'deliverable');

  render(container, mockData);
  assert.match(container.innerHTML, /# Setup Title/);
  assert.match(container.innerHTML, /Guideline content here\./);
  assert.match(container.innerHTML, /\(Deliverable\)/);
  assert.match(container.innerHTML, /View Updates &darr;/);
  assert.doesNotMatch(container.innerHTML, /### Update 1/);

  // Switch back to updates
  cardViewModes.set('card_s1_director', 'updates');
  render(container, mockData);
  assert.match(container.innerHTML, /### Update 1/);
  assert.doesNotMatch(container.innerHTML, /# Setup Title/);

  // Cleanup
  expandedCards.clear();
  cardViewModes.clear();
});

test('Happy Path: Status Badge renders data-status-toggle and triggers auto-scroll to bottom', () => {
  const badge = getStatusBadge('completed', 'card_s1_director');
  assert.match(badge, /data-status-toggle="card_s1_director"/);
  assert.match(badge, /cursor-pointer/);
});

test('Happy Path: Scroll preservation preserves scroll position when user scrolled and auto-scrolls to bottom on update', () => {
  let isAfterRender = false;
  const oldElement = {
    getAttribute: (attr) => (attr === 'data-agent-body' ? 'card_s1_director' : null),
    scrollTop: 150,
    scrollHeight: 500,
    clientHeight: 200,
    textContent: 'Old logs'
  };
  const newElement = {
    getAttribute: (attr) => (attr === 'data-agent-body' ? 'card_s1_director' : null),
    scrollTop: 0,
    scrollHeight: 550,
    clientHeight: 200,
    textContent: 'Old logs\nNew update!'
  };

  let innerHTMLValue = '';
  const container = {
    get innerHTML() { return innerHTMLValue; },
    set innerHTML(val) {
      innerHTMLValue = val;
      isAfterRender = true;
    },
    querySelectorAll: (sel) => {
      if (sel === '[data-agent-body]') {
        return isAfterRender ? [newElement] : [oldElement];
      }
      return [];
    }
  };

  const mockData = {
    stages: [
      {
        num: 1,
        name: 'Setup',
        agents: {
          director: {
            id: 'director',
            frontmatter: { role: 'stage1_setup/agent_director', status: 'in_progress', deliverable: 'setup.md' },
            body: 'Old logs'
          }
        }
      }
    ]
  };

  expandedCards.add('card_s1_director');
  cardViewModes.set('card_s1_director', 'updates');

  // Case 1: Same logs, user scrolled to 150 (not at bottom) -> preserves 150
  newElement.textContent = 'Old logs';
  newElement.scrollHeight = 500;
  isAfterRender = false;
  render(container, mockData);
  assert.equal(newElement.scrollTop, 150, 'Should preserve previous scrollTop when logs have not changed');

  // Case 2: New logs arrive -> auto-scrolls to bottom
  newElement.textContent = 'Old logs\nNew update!';
  newElement.scrollHeight = 550;
  isAfterRender = false;
  render(container, mockData);
  assert.equal(newElement.scrollTop, 550, 'Should auto-scroll to bottom when new logs arrive');

  // Case 3: pendingScrollBottom is set (e.g. status chip clicked) -> auto-scrolls to bottom
  newElement.textContent = 'Old logs';
  oldElement.textContent = 'Old logs';
  newElement.scrollHeight = 500;
  isAfterRender = false;
  pendingScrollBottom.add('card_s1_director');
  render(container, mockData);
  assert.equal(newElement.scrollTop, 500, 'Should auto-scroll to bottom when pendingScrollBottom is requested');

  // Cleanup
  expandedCards.clear();
  cardViewModes.clear();
  pendingScrollBottom.clear();
});

test('Failure Path: Renders fallback message when deliverableContent is missing or null', () => {
  const container = { innerHTML: '', querySelectorAll: () => [] };
  const mockData = {
    stages: [
      {
        num: 1,
        name: 'Setup',
        agents: {
          director: {
            id: 'director',
            frontmatter: { role: 'stage1_setup/agent_director', status: 'completed', deliverable: 'setup.md' },
            body: 'Init done.',
            deliverableContent: null
          }
        }
      }
    ]
  };

  expandedCards.add('card_s1_director');
  cardViewModes.set('card_s1_director', 'deliverable');

  render(container, mockData);
  assert.match(container.innerHTML, /Deliverable \(setup\.md\) has not been generated yet\./);

  // Cleanup
  expandedCards.clear();
  cardViewModes.clear();
});

test('Failure Path: Renders fallback message when deliverableContent is empty string', () => {
  const container = { innerHTML: '', querySelectorAll: () => [] };
  const mockData = {
    stages: [
      {
        num: 1,
        name: 'Setup',
        agents: {
          director: {
            id: 'director',
            frontmatter: { role: 'stage1_setup/agent_director', status: 'completed', deliverable: 'setup.md' },
            body: 'Init done.',
            deliverableContent: '   '
          }
        }
      }
    ]
  };

  expandedCards.add('card_s1_director');
  cardViewModes.set('card_s1_director', 'deliverable');

  render(container, mockData);
  assert.match(container.innerHTML, /Deliverable \(setup\.md\) has not been generated yet\./);

  // Cleanup
  expandedCards.clear();
  cardViewModes.clear();
});

test('Happy Path: Renders stageless agents without stage prefix and with clean element IDs', () => {
  const container = { innerHTML: '', querySelectorAll: () => [] };
  const stagelessData = {
    stages: [
      {
        num: null,
        name: 'Agents',
        stageDir: 'agents',
        nodes: [
          {
            type: 'agent',
            id: 'factchecker',
            name: 'factchecker',
            frontmatter: { role: 'factchecker', status: 'completed', deliverable: 'audit_report.md' },
            body: 'Audit completed successfully.',
            deliverableContent: '# Audit Report Content'
          },
          {
            type: 'agent',
            id: 'writer',
            name: 'writer',
            frontmatter: { role: 'writer', status: 'in_progress', deliverable: 'draft.md' },
            body: 'Drafting text...',
            deliverableContent: '# Article Draft'
          }
        ]
      }
    ]
  };

  render(container, stagelessData);
  assert.match(container.innerHTML, /Fact Checker/);
  assert.match(container.innerHTML, /Writer/);
  assert.match(container.innerHTML, /Agents/);
  assert.doesNotMatch(container.innerHTML, /Stage null/);
  assert.match(container.innerHTML, /data-concept-toggle="card_factchecker"/);
  assert.match(container.innerHTML, /data-concept-toggle="card_writer"/);
});

test('Happy Path: Renders stageless agent deliverable content when card is expanded in deliverable mode', () => {
  const container = { innerHTML: '', querySelectorAll: () => [] };
  const stagelessData = {
    stages: [
      {
        num: null,
        name: 'Agents',
        stageDir: 'agents',
        nodes: [
          {
            type: 'agent',
            id: 'factchecker',
            name: 'factchecker',
            frontmatter: { role: 'factchecker', status: 'completed', deliverable: 'audit_report.md' },
            body: 'Audit completed.',
            deliverableContent: '# Verified Claims Report'
          }
        ]
      }
    ]
  };

  expandedCards.add('card_factchecker');
  cardViewModes.set('card_factchecker', 'deliverable');

  render(container, stagelessData);
  assert.match(container.innerHTML, /# Verified Claims Report/);
  assert.match(container.innerHTML, /audit_report\.md/);

  // Cleanup
  expandedCards.clear();
  cardViewModes.clear();
});

