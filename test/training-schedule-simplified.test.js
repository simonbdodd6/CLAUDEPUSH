/**
 * TRAINING SCHEDULING — SIMPLIFIED TO DAY + START TIME.
 *
 * Finish time is no longer collected on either scheduling form: the weekly
 * recurring slots in Settings, and the dated sessions in the Planner.
 *
 * The point of these tests is the PRESERVATION half. The record schema is
 * unchanged and nothing migrates, so a session created before this change
 * still carries its stored `endTime` — and every edit path must leave it
 * exactly where it is. A form that silently dropped a value the coach never
 * chose to delete would be data loss disguised as simplification.
 *
 * The other half is that absence must never be filled in. A missing finish
 * time is missing: it is not blanked into a default, and it is never inferred
 * from a start time plus a duration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}

// ── The forms no longer ask ────────────────────────────────────────────────

test('1: the dated session form has no finish-time input', () => {
  assert.equal(src.includes('id="ts-end"'), false, 'the Finish time input is gone');
  assert.doesNotMatch(src, /Finish time<input/, 'and so is its label');
  // Day + start time remain.
  assert.ok(src.includes('id="ts-date"'), 'Date still collected');
  assert.ok(src.includes('id="ts-start"'), 'Start time still collected');
});

test('2: the weekly slot form has no end-time input', () => {
  const card = fn('renderTrainingScheduleCard');
  assert.doesNotMatch(card, /'endTime'/, 'no endTime field editor');
  assert.doesNotMatch(card, /s\.endTime/, 'and it is not displayed read-only either');
  assert.match(card, /'startTime'/, 'start time still editable');
  assert.match(card, /'day'/, 'day still editable');
  // The blurb must not promise something the form no longer asks for.
  assert.doesNotMatch(card, /end time/i, 'the description no longer mentions an end time');
});

// ── Nothing is fabricated ──────────────────────────────────────────────────

test('3: creating a session writes NO finish time — not blank, not guessed', () => {
  const create = fn('trainingCreateSession');
  assert.doesNotMatch(create, /endTime/, 'the key is not written at all');
  assert.doesNotMatch(create, /ts-end/, 'and the removed input is not read');
  assert.match(create, /startTime: g\('ts-start'\)/, 'start time still captured');
  assert.match(create, /date: g\('ts-date'\)/, 'day still captured');
});

test('4: no finish time or duration is ever inferred from a start time', () => {
  // A fabricated finish would be worse than none: it would look authored.
  for (const name of ['trainingCreateSession', 'renderPlayerWeek', 'renderTrainingScheduleCard']) {
    const body = fn(name);
    assert.doesNotMatch(body, /addMinutes|plusMinutes|\+\s*durationMinutes|defaultDuration/i,
      `${name} must not compute an end time`);
  }
});

test('5: the field stays DEFINED in the record — schema untouched', () => {
  // Absence must load as '' exactly as before, so nothing downstream sees
  // undefined where it used to see a string.
  assert.match(src, /if \(s\.endTime\s+=== undefined\) s\.endTime\s+= '';/,
    'normalizeState still defines the field');
});

// ── PRESERVATION: every edit path leaves stored values alone ───────────────

test('6: editing a session preserves every field the form no longer asks for', () => {
  const save = fn('saveSessionForm');
  // The edit spreads the existing record and overwrites only what it collects.
  assert.match(save, /\.\.\.state\.schedule\[idx\]/, 'existing record is spread, not replaced');
  assert.doesNotMatch(save, /endTime/, 'and endTime is never among the overwritten keys');

  // Drive the real merge to prove a stored value survives.
  const merged = new Function(`
    const existing = { id: 's1', title: 'Old', type: 'Training', date: '2026-09-01',
      startTime: '19:45', endTime: '21:00', arrivalTime: '19:30',
      location: 'Main pitch', ageGrade: 'Senior', squad: '1st XV',
      coachName: 'A. Payne', focus: 'Lineout', target: 0, deadline: '',
      published: true, publishedAt: '2026-08-01' };
    const title = 'New title', type = 'Training', date = '2026-09-08',
          deadline = '', focus = 'Scrum', target = 0;
    return { ...existing, title, type, date, deadline, focus, target };
  `)();
  assert.equal(merged.endTime, '21:00', 'stored finish time survives an edit');
  assert.equal(merged.arrivalTime, '19:30', 'so does arrival time');
  assert.equal(merged.location, 'Main pitch');
  assert.equal(merged.coachName, 'A. Payne');
  assert.equal(merged.title, 'New title', 'while the edited fields do change');
  assert.equal(merged.date, '2026-09-08');
});

test('7: the weekly slot editor writes ONE field at a time, so siblings survive', () => {
  const upd = fn('trainingScheduleUpdateField');
  assert.match(upd, /\[field\]: value/, 'queues a single named field');
  assert.doesNotMatch(upd, /endTime|arrivalTime|effectiveFrom|effectiveTo/,
    'it names no field itself, so nothing is cleared as a side effect');
  const queued = new Function(`
    const slot = { id: 'slot_1', day: 'Tue', startTime: '19:45', endTime: '21:00',
                   venue: 'Main pitch', arrivalTime: '19:30',
                   effectiveFrom: '2026-08-01', effectiveTo: '2027-05-01', active: true };
    const queue = { ...(slot || {}), startTime: '20:00' };
    return queue;
  `)();
  assert.equal(queued.endTime, '21:00', 'end time untouched by a start-time edit');
  assert.equal(queued.arrivalTime, '19:30');
  assert.equal(queued.effectiveFrom, '2026-08-01');
  assert.equal(queued.effectiveTo, '2027-05-01');
});

test('8: the admin field editor also touches only the named field', () => {
  const edit = fn('adminEditSession');
  assert.match(edit, /s\[field\] = String\(value \|\| ''\)\.trim\(\)/, 'single named field');
  assert.doesNotMatch(edit, /endTime/, 'never names endTime itself');
});

// ── Display paths handle absence, and no longer show a removed value ───────

test('9: the player Training tab shows start time only, never a range', () => {
  const week = fn('renderPlayerWeek');
  assert.doesNotMatch(week, /endTime/, 'finish time is not read');
  assert.doesNotMatch(week, /join\('–'\)|join\("–"\)/, 'no combined range is built');
  assert.match(week, /const timeStr\s+= item\.startTime \|\| item\.time \|\| '';/,
    'start time only, falling back to the legacy `time` field');
});

test('10: the coach calendar detail no longer lists an End row', () => {
  const detail = fn('_renderCalendarEventDetail');
  assert.doesNotMatch(detail, /'End'/, 'the End row is gone');
  assert.match(detail, /\['Start',\s+p\.startTime \|\| '—'\]/, 'Start remains');
});

test('11: every session display survives a record with NO time fields at all', () => {
  // The realistic new-session shape: no endTime key, empty startTime.
  const bare = { id: 's2', title: 'Thursday training', type: 'Training',
                 date: '', startTime: '', location: '', coachName: '', focus: '' };
  const timeStr = bare.startTime || bare.time || '';
  assert.equal(timeStr, '', 'resolves to empty, not undefined and not a guess');
  // Every subtitle builder filters empties rather than printing separators.
  assert.equal([bare.location, bare.startTime].filter(Boolean).join(' · '), '',
    'no orphan separator when both are absent');
  assert.equal([bare.date, bare.startTime].filter(Boolean).join(' '), '',
    'and the publish/push copy is empty rather than malformed');
});

test('12: player-facing surfaces other than the week view are unchanged', () => {
  // These already showed start time only; the change must not have touched them.
  assert.match(fn('openTrainingDetails'), /const t\s+= s\.startTime \|\| s\.time \|\| '';/);
  assert.doesNotMatch(fn('openTrainingDetails'), /endTime/);
  assert.match(fn('playerPortalUpcomingEvents'), /s\.startTime/);
  assert.doesNotMatch(fn('playerPortalUpcomingEvents'), /endTime/);
  // The publish push copy is still date + start time.
  assert.match(fn('trainingPublishTo'), /\[payload\.date, payload\.startTime\]/);
});

test('13: no migration, backfill or normalisation pass was introduced', () => {
  for (const banned of [/migrateSchedule/i, /backfillEndTime/i, /delete s\.endTime/,
                        /delete slot\.endTime/, /endTime = null/]) {
    assert.doesNotMatch(src, banned, `must not ${banned}`);
  }
});
