/**
 * Phase 15 — Team Announcement Flow: pure function unit tests.
 *
 * Tests:
 *  1.  selectionAnnouncementStatus: not_announced for null sel
 *  2.  selectionAnnouncementStatus: not_announced for missing field
 *  3.  selectionAnnouncementStatus: draft_ready returns correct shape
 *  4.  selectionAnnouncementStatus: announced returns correct shape
 *  5.  selectionAnnouncementStatus: unknown status falls back to not_announced
 *  6.  selectionCanAnnounce: false for null
 *  7.  selectionCanAnnounce: false for zero players
 *  8.  selectionCanAnnounce: true when has starters
 *  9.  selectionCanAnnounce: true when bench only
 * 10.  selectionGenerateAnnouncementMessage: empty string for null sel
 * 11.  selectionGenerateAnnouncementMessage: includes header without fixture
 * 12.  selectionGenerateAnnouncementMessage: includes opposition from fixture
 * 13.  selectionGenerateAnnouncementMessage: includes venue when present
 * 14.  selectionGenerateAnnouncementMessage: includes meetTime when present
 * 15.  selectionGenerateAnnouncementMessage: includes STARTING XV section with player names
 * 16.  selectionGenerateAnnouncementMessage: includes position names
 * 17.  selectionGenerateAnnouncementMessage: uses TBC for unresolved starters
 * 18.  selectionGenerateAnnouncementMessage: includes BENCH section with jersey numbers
 * 19.  selectionGenerateAnnouncementMessage: includes captain / vice-captain
 * 20.  selectionGenerateAnnouncementMessage: includes coach notes
 * 21.  selectionGenerateAnnouncementMessage: no STARTING XV section when starters empty
 * 22.  selectionGenerateAnnouncementMessage: bench jersey numbers start at 16
 * 23.  normalizeSquadSelection: announcement fields default correctly
 */

import test   from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractFn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found');
  let i = start;
  while (i < source.length && source[i] !== '(') i++;
  let parenDepth = 0;
  while (i < source.length) {
    if (source[i] === '(') parenDepth++;
    if (source[i] === ')') { parenDepth--; if (parenDepth === 0) { i++; break; } }
    i++;
  }
  while (i < source.length && source[i] !== '{') i++;
  let depth = 0;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    i++;
  }
  throw new Error('function ' + name + ' — could not find closing brace');
}

function extractConst(source, name) {
  const marker = '    const ' + name + ' = ';
  const start = source.indexOf(marker);
  if (start === -1) throw new Error('const ' + name + ' not found');
  let i = start + marker.length;
  while (i < source.length && (source[i] === ' ' || source[i] === '\n')) i++;
  const opener = source[i];
  const closer = opener === '[' ? ']' : opener === '{' ? '}' : null;
  if (closer) {
    let depth = 0;
    while (i < source.length) {
      if (source[i] === opener) depth++;
      else if (source[i] === closer) { depth--; if (depth === 0) { i++; break; } }
      i++;
    }
  } else {
    while (i < source.length && source[i] !== ';') i++;
    i++;
  }
  if (i < source.length && source[i] === ';') i++;
  return source.slice(start, i);
}

const RUGBY_SLOTS = [
  ["1",24,81],["2",50,83],["3",76,81],
  ["4",36,68],["5",64,68],
  ["6",18,56],["8",50,55],["7",82,56],
  ["9",37,42],["10",64,36],
  ["11",13,24],["12",39,25],["13",62,21],["14",87,24],["15",50,11],
];

function buildScope(opts = {}) {
  const fixtures = opts.fixtures || [];
  const players  = opts.players  || [];
  const squadSelections = opts.squadSelections || [];

  const body = `"use strict";
    const rugbySlots = ${JSON.stringify(RUGBY_SLOTS)};
    const state = {
      fixtures: ${JSON.stringify(fixtures)},
      players:  ${JSON.stringify(players)},
      squadSelections: ${JSON.stringify(squadSelections)},
    };
    ${extractConst(html, 'SEL_POSITION_NAMES')}
    ${extractFn(html, 'normalizeSquadSelection')}
    ${extractFn(html, 'selectionStarterCount')}
    ${extractFn(html, 'selectionBenchCount')}
    ${extractFn(html, 'selectionPlayerCount')}
    ${extractFn(html, 'selectionAnnouncementStatus')}
    ${extractFn(html, 'selectionCanAnnounce')}
    ${extractFn(html, 'selectionGenerateAnnouncementMessage')}
    return {
      normalizeSquadSelection,
      selectionAnnouncementStatus,
      selectionCanAnnounce,
      selectionGenerateAnnouncementMessage,
    };
  `;
  return new Function(body)();
}

// ── 1–5. selectionAnnouncementStatus ─────────────────────────────────────────

test('selectionAnnouncementStatus: not_announced for null sel', () => {
  const { selectionAnnouncementStatus } = buildScope();
  const r = selectionAnnouncementStatus(null);
  assert.equal(r.status, 'not_announced');
  assert.equal(r.label,  'Not announced');
});

test('selectionAnnouncementStatus: not_announced when field missing', () => {
  const { selectionAnnouncementStatus } = buildScope();
  const r = selectionAnnouncementStatus({});
  assert.equal(r.status, 'not_announced');
});

test('selectionAnnouncementStatus: draft_ready returns correct shape', () => {
  const { selectionAnnouncementStatus } = buildScope();
  const r = selectionAnnouncementStatus({ announcementStatus: 'draft_ready' });
  assert.equal(r.status, 'draft_ready');
  assert.equal(r.label,  'Draft ready');
  assert.ok(r.color,  'color present');
  assert.ok(r.bg,     'bg present');
  assert.ok(r.border, 'border present');
});

test('selectionAnnouncementStatus: announced returns correct shape', () => {
  const { selectionAnnouncementStatus } = buildScope();
  const r = selectionAnnouncementStatus({ announcementStatus: 'announced' });
  assert.equal(r.status, 'announced');
  assert.ok(r.label.includes('Announced'), 'label contains Announced');
  assert.equal(r.color, '#34d399');
});

test('selectionAnnouncementStatus: unknown status falls back to not_announced', () => {
  const { selectionAnnouncementStatus } = buildScope();
  const r = selectionAnnouncementStatus({ announcementStatus: 'something_weird' });
  assert.equal(r.status, 'not_announced');
});

// ── 6–9. selectionCanAnnounce ─────────────────────────────────────────────────

test('selectionCanAnnounce: false for null', () => {
  const { selectionCanAnnounce } = buildScope();
  assert.equal(selectionCanAnnounce(null),      false);
  assert.equal(selectionCanAnnounce(undefined), false);
});

test('selectionCanAnnounce: false when no players assigned', () => {
  const { selectionCanAnnounce } = buildScope();
  assert.equal(selectionCanAnnounce({ starters: {}, bench: ['','','','','','','',''] }), false);
});

test('selectionCanAnnounce: true when has starters', () => {
  const { selectionCanAnnounce } = buildScope();
  assert.equal(selectionCanAnnounce({ starters: { '10': 'p1' }, bench: [] }), true);
});

test('selectionCanAnnounce: true when bench only (no starters)', () => {
  const { selectionCanAnnounce } = buildScope();
  assert.equal(selectionCanAnnounce({ starters: {}, bench: ['p-bench','','','','','','',''] }), true);
});

// ── 10–22. selectionGenerateAnnouncementMessage ───────────────────────────────

test('selectionGenerateAnnouncementMessage: empty string for null sel', () => {
  const { selectionGenerateAnnouncementMessage } = buildScope();
  assert.equal(selectionGenerateAnnouncementMessage(null, [], []), '');
});

test('selectionGenerateAnnouncementMessage: includes Team Announcement header', () => {
  const { selectionGenerateAnnouncementMessage } = buildScope();
  const msg = selectionGenerateAnnouncementMessage({ id: 's1', starters: {}, bench: [] }, [], []);
  assert.ok(msg.includes('Team Announcement'), 'header present');
});

test('selectionGenerateAnnouncementMessage: includes opposition from linked fixture', () => {
  const fx = [{ id: 'fx1', opposition: 'Munster', date: '', venue: '' }];
  const { selectionGenerateAnnouncementMessage } = buildScope({ fixtures: fx });
  const msg = selectionGenerateAnnouncementMessage(
    { id: 's1', fixtureId: 'fx1', starters: {}, bench: [] }, fx, []
  );
  assert.ok(msg.includes('Munster'), 'opposition name present');
});

test('selectionGenerateAnnouncementMessage: includes venue when present', () => {
  const fx = [{ id: 'fx1', opposition: 'Opp', date: '', venue: 'Thomond Park' }];
  const { selectionGenerateAnnouncementMessage } = buildScope({ fixtures: fx });
  const msg = selectionGenerateAnnouncementMessage(
    { id: 's1', fixtureId: 'fx1', starters: {}, bench: [] }, fx, []
  );
  assert.ok(msg.includes('Thomond Park'), 'venue present');
});

test('selectionGenerateAnnouncementMessage: includes meetTime when present', () => {
  const fx = [{ id: 'fx1', opposition: 'Opp', date: '', venue: '', meetTime: '13:00' }];
  const { selectionGenerateAnnouncementMessage } = buildScope({ fixtures: fx });
  const msg = selectionGenerateAnnouncementMessage(
    { id: 's1', fixtureId: 'fx1', starters: {}, bench: [] }, fx, []
  );
  assert.ok(msg.includes('Meet: 13:00'), 'meetTime present');
});

test('selectionGenerateAnnouncementMessage: includes STARTING XV section with player names', () => {
  const players = [{ id: 'p1', name: 'Simon Dodd' }];
  const { selectionGenerateAnnouncementMessage } = buildScope({ players });
  const sel = { id: 's1', starters: { '10': 'p1' }, bench: [] };
  const msg = selectionGenerateAnnouncementMessage(sel, [], players);
  assert.ok(msg.includes('STARTING XV'), 'section header present');
  assert.ok(msg.includes('Simon Dodd'), 'player name present');
});

test('selectionGenerateAnnouncementMessage: includes position name for starter', () => {
  const players = [{ id: 'p9', name: 'Scrummy' }];
  const { selectionGenerateAnnouncementMessage } = buildScope({ players });
  const sel = { id: 's1', starters: { '9': 'p9' }, bench: [] };
  const msg = selectionGenerateAnnouncementMessage(sel, [], players);
  assert.ok(msg.includes('Scrum-Half'), 'position name present');
});

test('selectionGenerateAnnouncementMessage: uses TBC for unresolved player id', () => {
  const { selectionGenerateAnnouncementMessage } = buildScope();
  const sel = { id: 's1', starters: { '1': 'nonexistent-id' }, bench: [] };
  const msg = selectionGenerateAnnouncementMessage(sel, [], []);
  assert.ok(msg.includes('TBC'), 'TBC used for missing player');
});

test('selectionGenerateAnnouncementMessage: includes BENCH section with jersey numbers', () => {
  const players = [{ id: 'b1', name: 'Bench Player' }];
  const { selectionGenerateAnnouncementMessage } = buildScope({ players });
  const sel = { id: 's1', starters: {}, bench: ['b1','','','','','','',''] };
  const msg = selectionGenerateAnnouncementMessage(sel, [], players);
  assert.ok(msg.includes('BENCH'), 'bench section header present');
  assert.ok(msg.includes('Bench Player'), 'bench player name present');
});

test('selectionGenerateAnnouncementMessage: bench jersey numbers start at 16', () => {
  const players = [{ id: 'b16', name: 'First Bench' }];
  const { selectionGenerateAnnouncementMessage } = buildScope({ players });
  const sel = { id: 's1', starters: {}, bench: ['b16','','','','','','',''] };
  const msg = selectionGenerateAnnouncementMessage(sel, [], players);
  assert.ok(msg.includes('16.'), 'jersey 16 present for first bench slot');
});

test('selectionGenerateAnnouncementMessage: includes captain and vice-captain', () => {
  const players = [
    { id: 'cap1', name: 'Captain Kirk' },
    { id: 'vc1',  name: 'Spock' },
  ];
  const { selectionGenerateAnnouncementMessage } = buildScope({ players });
  const sel = { id: 's1', starters: {}, bench: [], captainId: 'cap1', viceCaptainId: 'vc1' };
  const msg = selectionGenerateAnnouncementMessage(sel, [], players);
  assert.ok(msg.includes('Captain: Captain Kirk'),      'captain present');
  assert.ok(msg.includes('Vice-Captain: Spock'), 'vice-captain present');
});

test('selectionGenerateAnnouncementMessage: includes coach notes', () => {
  const { selectionGenerateAnnouncementMessage } = buildScope();
  const sel = { id: 's1', starters: {}, bench: [], notes: 'Bring your boots' };
  const msg = selectionGenerateAnnouncementMessage(sel, [], []);
  assert.ok(msg.includes('Bring your boots'), 'notes present');
});

test('selectionGenerateAnnouncementMessage: no STARTING XV when starters empty', () => {
  const { selectionGenerateAnnouncementMessage } = buildScope();
  const msg = selectionGenerateAnnouncementMessage({ id: 's1', starters: {}, bench: [] }, [], []);
  assert.ok(!msg.includes('STARTING XV'), 'no STARTING XV section when empty');
});

// ── 23. normalizeSquadSelection announcement defaults ─────────────────────────

test('normalizeSquadSelection: announcement fields default to safe values', () => {
  const { normalizeSquadSelection } = buildScope();
  const result = normalizeSquadSelection({ id: 'x' });
  assert.equal(result.announcementStatus,        'not_announced');
  assert.equal(result.announcementDraft,         '');
  assert.equal(result.announcementMessage,       '');
  assert.equal(result.announcementSentAt,        null);
  assert.deepEqual(result.announcementChannels,  []);
  assert.deepEqual(result.announcementApprovers, []);
  assert.equal(result.announcementApprovalStatus, null);
});
