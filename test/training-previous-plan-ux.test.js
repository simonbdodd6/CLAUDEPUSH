/**
 * BUILD K — the previous week's plan is visible, reviewable and copyable.
 *
 * Build J gave every training occurrence a permanent dated identity; this
 * build is the UX on top of that history. The rules it pins:
 *
 *  - "previous" means the week before the occurrence BEING VIEWED — never
 *    "the week before today" when those differ, and never "whatever was
 *    stored most recently";
 *  - duplication creates an independent copy under the target's OWN dated
 *    identity: the source is never mutated, repeat copies are deterministic,
 *    and no date is ever invented;
 *  - seeing that a previous plan exists is FACT and always offered; only the
 *    one-tap copy belongs to the autopilot feature switch;
 *  - legacy bare-id plans (saved before dated planning) are pointed at in
 *    History — never guessed into a week, and never described as lost.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(src, name, indent = '    ') {
  let start = src.indexOf(indent + 'function ' + name + '(');
  if (start === -1) start = src.indexOf(indent + 'async function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = src.indexOf('{', i), depth = 0;
  for (let k = brace; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}
const fn = n => extractFn(html, n);
const strip = s => s.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n')
  .replace(/<!--[\s\S]*?-->/g, '');

const SLOTS = [
  { id: 'slot_tue', day: 'Tue', startTime: '19:00', venue: 'Club', active: true, sessionId: 'tue' },
  { id: 'slot_thu', day: 'Thu', startTime: '19:30', venue: 'Club', active: true, sessionId: 'thu' },
];

/** A live duplicate-capable world around the REAL functions. */
function world({ today = '2026-09-08', blocks = {}, lastWeek = null, slots = SLOTS } = {}) {
  return new Function('cfg', `
    "use strict";
    const state = { trainingBlocks: structuredClone(cfg.blocks),
                    lastWeekTrainingBlocks: cfg.lastWeek,
                    operationalGroupId: 'grp_initial', autopilotReceipts: [],
                    features: { autopilot: true } };
    const _trainingSchedule = { slots: cfg.slots };
    const _availTodayOverride = cfg.today;
    function availToday() { return _availTodayOverride; }
    function saveState() {}
    function render() {}
    function showToast(m) { state._toast = m; }
    function syncPublishedSessionEdit() {}
    ${html.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
    ${fn('availWeekStart')}
    ${fn('availAddDays')}
    ${fn('availSlotDateInWeek')}
    ${fn('trainingDateLabel')}
    ${fn('trainingContentKey')}
    ${fn('trainingPreviousOccurrenceKey')}
    ${fn('autopilotOn')}
    ${fn('autopilotReceipt')}
    ${fn('autopilotDuplicateSession')}
    return { state, autopilotDuplicateSession, trainingPreviousOccurrenceKey, trainingContentKey };
  `)({ today, blocks, lastWeek, slots });
}

const SRC = [{ id: 'a1', time: '19:00', activity: 'Ruck drill', keyFocus: 'Body height' },
             { id: 'a2', time: '19:30', activity: 'Lineout', keyFocus: 'Timing' }];

// ═══════════════ PREVIOUS-WEEK RESOLUTION ══════════════════════════════════

test('previous week resolves from the occurrence itself, current week stays current', () => {
  const w = world({ today: '2026-09-08' });
  // Current week's Tuesday (bare protocol id) → the week before today.
  assert.equal(w.trainingPreviousOccurrenceKey('tue'), 'slot_tue-20260901');
  // A FUTURE occurrence's previous week is ITS OWN previous week.
  assert.equal(w.trainingPreviousOccurrenceKey('slot_tue-20260922'), 'slot_tue-20260915');
  // And the current occurrence agrees with itself both ways.
  assert.equal(w.trainingPreviousOccurrenceKey(w.trainingContentKey('tue')), 'slot_tue-20260901');
});

test('a future plan is never mistaken for previous or current', () => {
  const w = world({ today: '2026-09-08', blocks: { 'slot_tue-20260915': structuredClone(SRC) } });
  // The current week has no plan; the future one must not be offered as "previous".
  assert.equal((w.state.trainingBlocks[w.trainingPreviousOccurrenceKey('tue')] || []).length, 0);
  assert.equal((w.state.trainingBlocks[w.trainingContentKey('tue')] || []).length, 0, 'current stays empty');
});

// ═══════════════ DUPLICATION — DATA INTEGRITY ══════════════════════════════

test('duplicate copies the previous dated plan into a NEW dated identity', () => {
  const w = world({ today: '2026-09-08', blocks: { 'slot_tue-20260901': structuredClone(SRC) } });
  w.autopilotDuplicateSession('tue');
  const target = w.state.trainingBlocks['slot_tue-20260908'];
  assert.equal(target.length, 2, 'copied into the current occurrence');
  assert.ok(!(w.state.trainingBlocks['tue'] || []).length, 'never the bare protocol id');
  // SOURCE unchanged, byte for byte.
  assert.deepEqual(w.state.trainingBlocks['slot_tue-20260901'], SRC, 'source untouched');
  // The copy is INDEPENDENT: fresh block ids, and edits do not flow back.
  assert.ok(target.every(b => !SRC.some(sb => sb.id === b.id)), 'every copied block has a new id');
  target[0].activity = 'EDITED COPY';
  assert.equal(w.state.trainingBlocks['slot_tue-20260901'][0].activity, 'Ruck drill', 'editing the copy never touches the source');
});

test('repeat duplication is deterministic — a fresh copy each time, source still untouched', () => {
  const w = world({ today: '2026-09-08', blocks: { 'slot_tue-20260901': structuredClone(SRC) } });
  w.autopilotDuplicateSession('tue');
  w.state.trainingBlocks['slot_tue-20260908'][0].activity = 'A stray edit';
  w.autopilotDuplicateSession('tue');
  assert.equal(w.state.trainingBlocks['slot_tue-20260908'][0].activity, 'Ruck drill',
    'the second copy replaces the target wholesale — deterministic, no merge');
  assert.equal(w.state.trainingBlocks['slot_tue-20260908'].length, 2);
  assert.deepEqual(w.state.trainingBlocks['slot_tue-20260901'], SRC, 'source still untouched');
});

test('duplicating on a FUTURE week copies from THAT week’s predecessor', () => {
  const w = world({ today: '2026-09-08', blocks: {
    'slot_tue-20260901': [{ id: 'old', activity: 'The week before today' }],
    'slot_tue-20260915': structuredClone(SRC) } });
  // The coach is viewing 22 Sep and duplicates: the source must be 15 Sep,
  // not 1 Sep (which is what the clock-relative code would have taken).
  w.autopilotDuplicateSession('slot_tue-20260922');
  assert.equal(w.state.trainingBlocks['slot_tue-20260922'][0].activity, 'Ruck drill');
  assert.deepEqual(w.state.trainingBlocks['slot_tue-20260915'], SRC, 'its source unchanged');
  assert.equal(w.state.trainingBlocks['slot_tue-20260901'][0].activity, 'The week before today', 'the other week untouched');
});

test('no previous plan: the copy makes no claim and writes nothing', () => {
  const w = world({ today: '2026-09-08' });
  w.autopilotDuplicateSession('tue');
  assert.match(w.state._toast, /No previous plan/);
  assert.deepEqual(Object.keys(w.state.trainingBlocks), [], 'nothing written anywhere');
});

test('an EMPTY previous plan is not offered as a copy source', () => {
  const w = world({ today: '2026-09-08', blocks: { 'slot_tue-20260901': [] } });
  w.autopilotDuplicateSession('tue');
  assert.match(w.state._toast, /No previous plan/, 'zero blocks is nothing to copy');
});

test('the legacy startNewWeek stash remains the fallback source — no date is invented for it', () => {
  const w = world({ today: '2026-09-08', lastWeek: { tue: [{ id: 'lw', activity: 'Stashed plan' }] } });
  w.autopilotDuplicateSession('tue');
  assert.equal(w.state.trainingBlocks['slot_tue-20260908'][0].activity, 'Stashed plan',
    'the stash copies into the CURRENT dated occurrence');
  assert.ok(!Object.keys(w.state.trainingBlocks).some(k => k !== 'slot_tue-20260908'),
    'the stashed legacy content itself is never assigned a date of its own');
});

// ═══════════════ GROUP ISOLATION ═══════════════════════════════════════════

test('duplication can only ever touch the live group’s own state', () => {
  // The duplicate reads and writes state.trainingBlocks — the group-stashed
  // live state. Another group's plans live in trainingByGroup stashes that
  // this function cannot reach; pinned at source so a refactor cannot widen it.
  const src = strip(fn('autopilotDuplicateSession'));
  assert.ok(!/trainingByGroup/.test(src), 'never reaches into another group’s stash');
  assert.ok(!/fetch\(/.test(src.replace(/syncPublishedSessionEdit\(sessionId\);/, '')), 'no server write of its own');
  const w = world({ today: '2026-09-08', blocks: { 'slot_tue-20260901': structuredClone(SRC) } });
  w.state.trainingByGroup = { grp_u18: { trainingBlocks: { 'slot_tue-20260901': [{ id: 'u', activity: 'U18 plan' }] } } };
  w.autopilotDuplicateSession('tue');
  assert.equal(w.state.trainingByGroup.grp_u18.trainingBlocks['slot_tue-20260901'][0].activity, 'U18 plan',
    'the other group’s stash is untouched');
  assert.equal(w.state.trainingBlocks['slot_tue-20260908'][0].activity, 'Ruck drill', 'the live group copied its own plan');
});

// ═══════════════ THE EMPTY-STATE AFFORDANCES ═══════════════════════════════

const EMPTY_STATE = (() => {
  const i = html.indexOf('No session plan yet');
  return html.slice(i, html.indexOf('</div>`}', i));
})();

test('seeing the previous plan is FACT (always offered); only the copy is autopilot-gated', () => {
  const code = strip(EMPTY_STATE);
  const noteIdx = code.indexOf('prevNote');
  const dupIdx = code.indexOf('const dupBtn');
  assert.ok(noteIdx > -1 && dupIdx > -1, 'both affordances exist');
  const noteDecl = code.slice(code.indexOf('const prevNote'), dupIdx);
  assert.ok(!/autopilotOn/.test(noteDecl), 'the view-previous note has NO autopilot gate');
  assert.match(noteDecl, /trainingShiftWeek\(-1\)/, 'and it opens the previous week for review');
  const dupDecl = code.slice(dupIdx, code.indexOf('const legacy'));
  assert.match(dupDecl, /autopilotOn\(\)/, 'the one-tap copy stays behind the feature switch');
  assert.match(dupDecl, /autopilotDuplicateSession/, 'wired to the real copy');
});

test('legacy bare-id content is pointed at History — never guessed into a week', () => {
  const code = strip(EMPTY_STATE);
  const legacyDecl = code.slice(code.indexOf('const legacy'));
  assert.match(legacyDecl, /sessId !== ck/, 'only when the session HAS a distinct legacy key');
  assert.match(legacyDecl, /\[sessId\] \|\| \[\]\)\.length/, 'and that key actually holds content');
  assert.match(legacyDecl, /kept in Training History/, 'described as KEPT, never as lost');
  assert.match(legacyDecl, /setTrainingTab\('history'\)/, 'one tap to see it');
  assert.ok(!/trainingContentKey\(sessId\)\s*\]\s*=/.test(code), 'the empty state never writes content anywhere');
});

test('the empty state stays honest when there is nothing at all', () => {
  assert.match(EMPTY_STATE, /No session plan yet/);
  // With no previous plan, no legacy content and autopilot off, the three
  // affordances all collapse to nothing — the state must not imply history.
  const code = strip(EMPTY_STATE);
  assert.match(code, /prev\.length \?/, 'the note requires real previous content');
  assert.match(code, /return prevNote \+ dupBtn \+ legacy;/, 'and each piece is independently conditional');
});

// ═══════════════ LANGUAGE + SINGLE STORE ═══════════════════════════════════

test('nothing in the planner claims a plan was lost or restored', () => {
  const dup = strip(fn('autopilotDuplicateSession'));
  assert.ok(!/restored/i.test(dup), '"restored" implied the plan had been lost');
  assert.match(dup, /copied/, 'a copy is what it is');
  assert.match(dup, /independent/, 'and its independence is stated');
});

test('current-week session cards carry their real occurrence date', () => {
  assert.match(html, /trainingDateLabel\(trainingDateFromSessionId\(trainingContentKey\(s\.id\)\)\)/,
    'the card derives its date from the canonical dated identity');
});

test('ONE plan store, ONE identity — nothing new was introduced', () => {
  const script = strip(html);
  for (const forbidden of ['trainingPlanArchive', 'planHistoryStore', 'trainingHistoryBlocks',
                           'previousPlans', 'trainingPlanCopies']) {
    assert.ok(!script.includes(forbidden), forbidden + ' must not exist');
  }
  assert.equal(html.split('function trainingContentKey(').length - 1, 1, 'one content identity');
  assert.equal(html.split('function trainingPreviousOccurrenceKey(').length - 1, 1, 'one previous-key helper');
  const dup = strip(fn('autopilotDuplicateSession'));
  assert.match(dup, /state\.trainingBlocks\[trainingContentKey\(sessionId\)\]/,
    'the copy lands in the ONE store under the canonical identity');
});
