/**
 * BUILD AE — ONE Medical row per person.
 *
 * The Medical page could show the same player twice — one row Available, one
 * row Injured — because the roster can hold TWO records for one person: the
 * hand-added row from the pre-invite era and the account-linked row created
 * when they claimed an invite (or gained Medical access). Both rows share the
 * durable userId; the injury is keyed to ONE of the row ids, so the other row
 * rendered as a healthy duplicate of the same human.
 *
 * The reader now collapses roster twins that share a durable userId, keeping
 * the row that actually carries medical signals (record, note, roster injury
 * flag) so an active injury is never orphaned by the collapse. Two rows that
 * BOTH carry signals are deliberately left alone: visible duplication is
 * better than silently hiding one medical record. Rows with no userId keep
 * their own identity — two unlinked namesakes are two people.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX = process.env.CE_INDEX_HTML || join(__dirname, '..', 'index.html');
const html = await readFile(INDEX, 'utf8');

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
const strip = s => s.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

function makeWorld(cfg = {}) {
  const { roster = [], medRecords = {}, medNotes = {}, activeView = 'coach' } = cfg;
  return new Function('cfg', `
    "use strict";
    const state = { activeView: cfg.activeView, players: cfg.roster,
                    medicalRecords: cfg.medRecords, medicalNotes: cfg.medNotes,
                    operationalGroupId: 'g1' };
    const _sharedMedical = { loaded: true, cases: [], players: [] };
    function operationalPlayers() { return cfg.roster; }
    function activeRosterPlayers(p) { return (p || []).filter(x => x && x.id && !x.archived); }
    function normalizeMedicalRecord(raw) {
      const r = raw || {};
      return { currentInjury: r.currentInjury || '', severity: r.severity || '',
               dateInjured: r.dateInjured || '', expectedReturn: r.expectedReturn || '',
               clearanceStatus: r.clearanceStatus || '', timeline: [] };
    }
    ${extractFn(html, 'medicalRowCarriesCase')}
    ${extractFn(html, 'medicalCanonicalPlayers')}
    ${extractFn(html, 'medicalPlayers')}
    ${extractFn(html, 'medicalDashboardSummary')}
    return { medicalPlayers, medicalCanonicalPlayers,
             summary: () => medicalDashboardSummary(medicalPlayers(), state.medicalRecords, state.medicalNotes) };
  `)({ roster, medRecords, medNotes, activeView });
}

// The production shape: one person, two roster rows sharing a userId — the
// legacy manual row (which the injury was recorded against) and the linked one.
const MANUAL = { id: 'p-manual', name: 'Marc Petit', userId: 'u-marc' };
const LINKED = { id: 'u-marc', name: 'Marc Petit', userId: 'u-marc' };
const OTHER  = { id: 'p-other', name: 'Marc Petit', userId: 'u-other' };   // a NAMESAKE

test('a person with two roster rows appears ONCE on the medical page', () => {
  const w = makeWorld({ roster: [MANUAL, LINKED] });
  const rows = w.medicalPlayers();
  assert.equal(rows.length, 1, 'one human, one row');
});

test('the collapse keeps the row that carries the injury — Injured once, Available zero', () => {
  const w = makeWorld({ roster: [LINKED, MANUAL],
    medRecords: { 'p-manual': { currentInjury: 'Hamstring', severity: 'moderate' } } });
  const rows = w.medicalPlayers();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'p-manual', 'the case-carrying row survives, whatever the order');
  const s = w.summary();
  assert.equal(s.alerts.length, 1, 'the injury alert renders once');
  assert.equal(s.all.length, 1, 'the caseload holds one entry for the one human');
});

test('no injury means one healthy row — never a fabricated case', () => {
  const w = makeWorld({ roster: [MANUAL, LINKED] });
  const s = w.summary();
  assert.equal(s.alerts.length, 0);
  assert.equal(s.all.length, 0, 'no case is invented by deduplication');
  assert.equal(s.roster.length, 1);
});

test('roster injury flags count as signals too — the flagged twin survives', () => {
  // BOTH orders: the flagged row must win by SIGNAL, never by position.
  for (const roster of [[{ ...LINKED, game: 'injured' }, MANUAL],
                        [MANUAL, { ...LINKED, game: 'injured' }]]) {
    const w = makeWorld({ roster });
    const rows = w.medicalPlayers();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'u-marc', 'the row the product flagged injured is the one kept');
    assert.equal(w.summary().injured.length, 1, 'Injured once');
  }
});

test('two rows that BOTH carry medical signals are left alone — nothing is hidden', () => {
  const w = makeWorld({ roster: [MANUAL, LINKED],
    medRecords: { 'p-manual': { currentInjury: 'Hamstring' },
                  'u-marc':   { currentInjury: 'Concussion' } } });
  assert.equal(w.medicalPlayers().length, 2,
    'visible duplication beats silently discarding a medical record');
});

test('a namesake with a different identity is never merged', () => {
  const w = makeWorld({ roster: [MANUAL, LINKED, OTHER],
    medRecords: { 'p-other': { currentInjury: 'Ankle' } } });
  const rows = w.medicalPlayers();
  assert.equal(rows.length, 2, 'Marc-with-account collapses; the namesake stands apart');
  assert.ok(rows.some(r => r.id === 'p-other'), 'the namesake and their injury survive');
});

test('rows with NO userId keep their own identity — unlinked people never collapse', () => {
  const a = { id: 'p-a', name: 'Trial Player' };
  const b = { id: 'p-b', name: 'Trial Player' };
  const w = makeWorld({ roster: [a, b] });
  assert.equal(w.medicalPlayers().length, 2, 'no durable identity, no merging');
});

test('the player view is untouched — a player device never gains the coach dedup path', () => {
  // Player view reads state.players directly (the server already scoped it);
  // the dedup applies there too but must not reroute the source.
  const src = strip(extractFn(html, 'medicalPlayers'));
  assert.match(src, /operationalPlayers\(\)/, 'coach view stays on the operating group');
  assert.match(src, /medicalCanonicalPlayers\(/, 'and the canonical collapse is applied');
});

test('deduplication reads, and never writes', () => {
  for (const fn of ['medicalCanonicalPlayers', 'medicalRowCarriesCase', 'medicalPlayers']) {
    const src = strip(extractFn(html, fn));
    for (const bad of [/fetch\(/, /saveSharedMedicalCase/, /saveState/, /method\s*:\s*['"]POST/i,
                       /state\.medicalRecords\s*=/, /state\.players\s*=/]) {
      assert.ok(!bad.test(src), `${fn} must not write (${bad})`);
    }
  }
  // and the collapse leaves its inputs untouched
  const roster = [MANUAL, LINKED];
  const frozen = JSON.stringify(roster);
  const w = makeWorld({ roster, medRecords: { 'p-manual': { currentInjury: 'X' } } });
  w.medicalPlayers();
  assert.equal(JSON.stringify(roster), frozen);
});
