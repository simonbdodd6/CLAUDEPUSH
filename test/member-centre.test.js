/**
 * Phase 31 — Member Centre (premium player dashboard).
 *
 * memberCentreModel(p, ctx) is a PURE presentation model: it derives display
 * values from existing player + club state only. No fetch, no identity changes,
 * no persistence, no mutation of its inputs. These tests extract the function
 * straight from index.html (same harness as the beta-stabilisation tests) and
 * lock its contract.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  const pattern = new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's');
  const m = src.match(pattern);
  if (!m) throw new Error(`Function ${name} not found`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = start + m[0].length - 1; // start brace-count at the body '{'
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

function buildScope() {
  const fns = ['sessionKey', 'statusLabel', 'memberCentreModel'].map(extractFn).join('\n');
  const body = `"use strict";\n${fns}\nreturn { sessionKey, statusLabel, memberCentreModel };`;
  return new Function(body)();
}

const { memberCentreModel } = buildScope();

function basePlayer(extra = {}) {
  return {
    id: 'p1', name: 'Sam Rivers', preferredName: '', position: 'Fly half',
    primaryPosition: 'Fly half', secondaryPositions: ['Inside centre', 'Fullback'],
    jerseyNumber: '10', phone: '0123', email: 'sam@club.com',
    emergencyContact: 'Jo Rivers', emergencyPhone: '0999',
    joinedDate: '2025-08-01', attendance: 75, history: [],
    trainingTuesday: 'no-reply', trainingThursday: 'no-reply', game: 'no-reply',
    ...extra,
  };
}

const SCHEDULE = [
  { id: 'tue',  type: 'Training' },
  { id: 'thu',  type: 'Training' },
  { id: 'game', type: 'Match' },
];

test('header fields: name, position, jersey, initials, badges', () => {
  const m = memberCentreModel(basePlayer({ isCaptain: true }), { schedule: SCHEDULE });
  assert.equal(m.name, 'Sam Rivers');
  assert.equal(m.displayName, 'Sam Rivers');
  assert.equal(m.position, 'Fly half');
  assert.equal(m.jersey, '10');
  assert.equal(m.initials, 'SR');
  assert.equal(m.isCaptain, true);
  assert.equal(m.hasMedical, false);
});

test('preferredName overrides display name', () => {
  const m = memberCentreModel(basePlayer({ preferredName: 'Sammy' }), {});
  assert.equal(m.displayName, 'Sammy');
  assert.equal(m.name, 'Sam Rivers');
});

test('captain badge also derives from ctx.captainId', () => {
  const m = memberCentreModel(basePlayer(), { captainId: 'p1' });
  assert.equal(m.isCaptain, true);
});

test('profile info: secondary positions joined, test email hidden', () => {
  const m = memberCentreModel(basePlayer(), {});
  assert.equal(m.secondaryPosition, 'Inside centre, Fullback');
  assert.equal(m.email, 'sam@club.com');
  assert.equal(m.preferredPosition, 'Fly half');

  const hidden = memberCentreModel(basePlayer({ email: 'auto@player.test' }), {});
  assert.equal(hidden.email, ''); // synthetic @player.test addresses are not shown
});

test('attendance: training/match/availability % split by session type', () => {
  const p = basePlayer({ trainingTuesday: 'available', trainingThursday: 'maybe', game: 'available' });
  const m = memberCentreModel(p, { schedule: SCHEDULE });
  assert.equal(m.trainingPct, 50);      // 1 of 2 training available
  assert.equal(m.matchPct, 100);        // 1 of 1 match available
  assert.equal(m.availabilityPct, 100); // all 3 answered
});

test('attendance: availability % counts only answered sessions', () => {
  const p = basePlayer({ trainingTuesday: 'available', trainingThursday: 'no-reply', game: 'no-reply' });
  const m = memberCentreModel(p, { schedule: SCHEDULE });
  assert.equal(m.availabilityPct, 33); // 1 of 3 answered
});

test('attendance: sessions attended/missed from history', () => {
  const p = basePlayer({ history: ['available', 'available', 'unavailable', 'injured', 'no-reply'] });
  const m = memberCentreModel(p, { schedule: SCHEDULE });
  assert.equal(m.sessionsAttended, 2);
  assert.equal(m.sessionsMissed, 2);
});

test('medical: injuries from medical notes + injured flag, alerts, return-to-play', () => {
  const p = basePlayer({ game: 'injured', medical: 'Asthma — carries inhaler' });
  const m = memberCentreModel(p, {
    schedule: SCHEDULE,
    medicalNotes: { p1: { condition: 'Hamstring strain', returnTarget: '2 weeks' } },
  });
  assert.ok(m.injuries.includes('Hamstring strain'));
  assert.ok(m.injuries.includes('Flagged injured'));
  assert.deepEqual(m.alerts, ['Asthma — carries inhaler']);
  assert.equal(m.returnToPlay, 'Target: 2 weeks');
  assert.equal(m.hasMedical, true);
});

test('medical: clean player reports fit and no flags', () => {
  const m = memberCentreModel(basePlayer(), { schedule: SCHEDULE });
  assert.deepEqual(m.injuries, []);
  assert.deepEqual(m.alerts, []);
  assert.equal(m.returnToPlay, 'Fit — available');
  assert.equal(m.hasMedical, false);
});

test('statistics are future-ready zero placeholders', () => {
  const m = memberCentreModel(basePlayer(), {});
  assert.deepEqual(m.stats, { matches: 0, starts: 0, bench: 0, minutes: 0, tries: 0, conversions: 0, penalties: 0 });
});

test('recent activity surfaces a matching master-feed entry', () => {
  const m = memberCentreModel(basePlayer(), {
    masterFeed: [{ event: 'Sam Rivers updated Training session 1', time: 'Just now' }],
  });
  assert.ok(m.lastAvailabilityUpdate);
  assert.match(m.lastAvailabilityUpdate.event, /Sam Rivers/);
});

test('purity: inputs are not mutated', () => {
  const p = basePlayer({ history: ['available'] });
  const ctx = { schedule: SCHEDULE, medicalNotes: { p1: { condition: 'X' } } };
  const snapP = JSON.stringify(p);
  const snapCtx = JSON.stringify(ctx);
  memberCentreModel(p, ctx);
  assert.equal(JSON.stringify(p), snapP);
  assert.equal(JSON.stringify(ctx), snapCtx);
});

test('null player yields null model (no throw)', () => {
  assert.equal(memberCentreModel(null, {}), null);
});

test('missing ctx does not throw (defaults applied)', () => {
  const m = memberCentreModel(basePlayer());
  assert.equal(m.availabilityPct, 0); // no schedule -> 0
  assert.equal(m.trainingPct, 0);
});
