/**
 * MEDICAL TIMELINE PERSISTENCE (CORE-BETA-READINESS-AUDIT-1, P2 fix).
 *
 * The Medical Timeline editor used to write entries into state.medicalRecords
 * (a DERIVED CACHE, rebuilt from the server on every load) and persist with
 * saveState() — localStorage ONLY. The next server hydrate silently discarded
 * the entry: it LOOKED saved and then vanished, and no other medic saw it.
 *
 * The fix routes an add through saveSharedMedicalCase — the ONE authoritative
 * medical write path — which appends to the case's APPEND-ONLY server audit
 * timeline ({at,by,action,note}, stamped server-side) and only reports success
 * once the server accepted it; medicalCaseToLegacy maps that server shape into
 * the {id,date,type,notes} the views read (so persisted entries render, and do
 * not come back blank); and the device-local delete is gone (a shared medical
 * audit trail is append-only — a client delete was a false success).
 *
 * These drive the REAL addMedTimelineEntry + REAL medicalCaseToLegacy. Every
 * assertion here FAILS against the pre-fix code.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fn(name) {
  const m = html.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = html.indexOf(m[0]);
  let i = html.indexOf('{', html.indexOf(')', start)), d = 0;
  for (let b = i; b < html.length; b++) { if (html[b] === '{') d++; else if (html[b] === '}') { d--; if (!d) { i = b; break; } } }
  return html.slice(start, i + 1);
}

const LABELS = { injury:'Injury', physio:'Physio', clearance:'Clearance',
  return:'Return to Play', surgery:'Surgery', note:'Note',
  opened:'Case opened', updated:'Update', resolved:'Cleared' };

// Run the REAL addMedTimelineEntry with spied choke points. `saveOk` is what
// the (stubbed) authoritative write path resolves to.
function makeAdd({ players = [{ id: 'p1', userId: 'u1' }], saveOk = true } = {}) {
  const calls = { save: [], toast: [], render: 0, saveState: 0 };
  const body =
    '"use strict";\n' +
    'const SAVE = arguments[0], TOAST = arguments[1], RENDER = arguments[2], STATE = arguments[3];\n' +
    'const MEDICAL_TIMELINE_LABELS = ' + JSON.stringify(LABELS) + ';\n' +
    'const _players = ' + JSON.stringify(players) + ';\n' +
    'const state = { medicalRecords: {} };\n' +
    'function medicalPlayers(){ return _players; }\n' +
    'function showToast(m){ TOAST(m); }\n' +
    'function saveState(m){ STATE(m); }\n' +          // must NOT be called by the add
    'function saveSharedMedicalCase(b){ return SAVE(b); }\n' +
    'function render(){ RENDER(); }\n' +
    fn('addMedTimelineEntry') + '\n' +
    'return { add: addMedTimelineEntry };\n';
  const api = new Function(body)(
    (b) => { calls.save.push(b); return Promise.resolve(saveOk); },
    (m) => calls.toast.push(m),
    ()  => { calls.render++; },
    ()  => { calls.saveState++; },
  );
  return { api, calls };
}

const legacy = (() => {
  const src = fn('medicalCaseToLegacy');
  return new Function('return (' + src + ');')();
})();

const tick = () => new Promise(r => setTimeout(r, 0));

// ── PERSISTENCE: the add reaches the authoritative server path ───────────────

test('TEST 1: an add persists via saveSharedMedicalCase, never saveState (no device-local shadow)', async () => {
  const { api, calls } = makeAdd();
  api.add('p1', 'physio', 'Completed rehab block', '2026-02-01');
  await tick();
  assert.equal(calls.save.length, 1, 'the entry went to the authoritative shared write path');
  assert.equal(calls.saveState, 0, 'nothing was written device-local (saveState) — the old silent-loss path');
  const body = calls.save[0];
  assert.equal(body.action, 'upsert_case');
  assert.equal(body.playerId, 'p1');
  assert.equal(body.userId, 'u1', 'userId resolved from the roster, not the request body');
  assert.ok(typeof body.timelineNote === 'string' && body.timelineNote.length > 0);
});

test('TEST 2: the note preserves the chosen category and event date (nothing typed is lost)', async () => {
  const { api, calls } = makeAdd();
  api.add('p1', 'physio', 'Completed rehab block', '2026-02-01');
  await tick();
  const note = calls.save[0].timelineNote;
  assert.match(note, /Physio/, 'the category label is folded into the audit note');
  assert.match(note, /2026-02-01/, 'the event date is folded into the audit note');
  assert.match(note, /Completed rehab block/, 'the physio note text is preserved');
});

test('TEST 3: an empty note is refused (no phantom entry, honest toast)', async () => {
  const { api, calls } = makeAdd();
  api.add('p1', 'note', '   ', '');
  await tick();
  assert.equal(calls.save.length, 0, 'no server write for an empty note');
  assert.equal(calls.saveState, 0);
  assert.equal(calls.toast.length, 1, 'the user is told, not silently no-oped');
});

test('TEST 5: a persistence FAILURE is not presented as success', async () => {
  const { api, calls } = makeAdd({ saveOk: false });
  api.add('p1', 'physio', 'Rehab', '2026-02-01');
  await tick();
  assert.equal(calls.save.length, 1, 'the write was attempted');
  assert.equal(calls.render, 0, 'a failed save does NOT trigger the success repaint (saveSharedMedicalCase itself toasts the failure)');
});

test('TEST 5b: a successful save repaints the timeline', async () => {
  const { api, calls } = makeAdd({ saveOk: true });
  api.add('p1', 'physio', 'Rehab', '2026-02-01');
  await tick();
  assert.equal(calls.render, 1, 'a confirmed save repaints so the persisted entry shows');
});

// ── ROUND-TRIP: what is persisted is what re-renders (survives reload/reopen) ─

test('TEST 4: medicalCaseToLegacy maps the server audit timeline into a renderable shape', () => {
  const server = { condition: 'Hamstring', timeline: [
    { at: '2026-02-01T09:30:00.000Z', by: 'u1', action: 'opened',  note: 'Injury (2026-01-30) — strain' },
    { at: '2026-02-05T10:00:00.000Z', by: 'u1', action: 'updated', note: 'Physio — mobility work' },
  ] };
  const { record } = legacy(server);
  assert.equal(record.timeline.length, 2, 'both audit entries survive the projection');
  const [first, second] = record.timeline;
  // Every field the views read must be populated — the pre-fix pass-through
  // left date/type/notes undefined, so entries rendered blank.
  assert.equal(first.date, '2026-02-01', 'date derived from the server timestamp');
  assert.equal(first.type, 'opened', 'type from the server audit action → drives the pill');
  assert.match(first.notes, /Injury/, 'note text carried through');
  assert.equal(second.type, 'updated');
  assert.ok(first.id && first.id !== second.id, 'each entry gets a stable, unique key');
});

test('TEST 4b: the persisted note round-trips — an add is renderable after a server re-serve', async () => {
  const { api, calls } = makeAdd();
  api.add('p1', 'clearance', 'Cleared to return', '2026-02-10');
  await tick();
  // The server appends {at,by,action:'updated',note:<sent note>} and re-serves it.
  const reServed = { timeline: [
    { at: '2026-02-10T12:00:00.000Z', by: 'u1', action: 'updated', note: calls.save[0].timelineNote },
  ] };
  const { record } = legacy(reServed);
  assert.equal(record.timeline.length, 1, 'the entry is present after reload/reopen — it did not vanish');
  assert.match(record.timeline[0].notes, /Clearance/);
  assert.match(record.timeline[0].notes, /Cleared to return/);
  assert.equal(record.timeline[0].date, '2026-02-10');
});

test('TEST 7: an empty / missing server timeline maps to [] (no crash, honest empty)', () => {
  assert.deepEqual(legacy({}).record.timeline, []);
  assert.deepEqual(legacy({ timeline: 'bad' }).record.timeline, []);
  assert.deepEqual(legacy({ timeline: [] }).record.timeline, []);
});

// ── APPEND-ONLY AUDIT: the dishonest device-local delete is gone ─────────────

test('TEST 6: the client-side timeline delete is removed (append-only medical audit trail)', () => {
  assert.equal(/function deleteMedTimelineEntry\s*\(/.test(html), false,
    'deleteMedTimelineEntry is gone — it deleted from a derived cache and reappeared on hydrate');
  assert.equal(html.includes('deleteMedTimelineEntry('), false, 'no caller / button remains');
});

// ── ISOLATION: the fix adds no client-side authority; the server still gates ──

test('TEST 8: no client auth decision is introduced — the add relies on the gated server path', () => {
  const src = fn('addMedTimelineEntry');
  assert.match(src, /saveSharedMedicalCase/, 'writes only through the ONE authoritative medical endpoint (server enforces MEDICAL_ACCESS + group)');
  assert.equal(/canI\(|_permissions|medicalAccess\s*=/.test(src), false, 'no local permission gate added or weakened');
  assert.doesNotMatch(src, /saveState/, 'no device-local persistence path remains');
});
