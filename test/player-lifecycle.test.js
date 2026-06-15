/**
 * Phase 17 — Player Lifecycle Foundation: pure function unit tests.
 *
 * Tests:
 *  1.  playerProfileCompleteness: all fields present → 100%
 *  2.  playerProfileCompleteness: missing all fields → 0%
 *  3.  playerProfileCompleteness: partial profile → correct score
 *  4.  playerProfileCompleteness: @player.test email counts as missing
 *  5.  playerProfileCompleteness: emergency phone counts for emergency field
 *  6.  playerProfileCompleteness: SUB position counts as missing
 *  7.  playerProfileCompleteness: null player → 0% with all fields missing
 *  8.  playerLifecycleInfo: active → correct label/color
 *  9.  playerLifecycleInfo: injured → correct label/color
 * 10.  playerLifecycleInfo: archived → correct label/color
 * 11.  playerLifecycleInfo: unknown status falls back to active
 * 12.  playerLifecycleInfo: null player → active defaults
 * 13.  playerIsArchived: lifecycleStatus=archived → true
 * 14.  playerIsArchived: _archived=true → true
 * 15.  playerIsArchived: active player → false
 * 16.  playerIsArchived: null → false
 * 17.  activeRosterPlayers: filters out archived
 * 18.  activeRosterPlayers: filters out _archived=true
 * 19.  activeRosterPlayers: keeps active players
 * 20.  activeRosterPlayers: empty array → empty result
 * 21.  playerLifecycleStats: correct count of active/archived/injured/incomplete
 * 22.  playerLifecycleStats: all archived → active=0
 * 23.  playerLifecycleStats: empty array → all zeros
 * 24.  playerLifecycleStats: injured game status contributes to injured count
 * 25.  playerLifecycleStats: unregistered count correct
 * 26.  playerHasMedicalFlag: no flag when no medical data
 * 27.  playerHasMedicalFlag: injured game status → flag
 * 28.  playerHasMedicalFlag: medical string → flag
 * 29.  playerHasMedicalFlag: medicalNotes condition → flag
 * 30.  playerHasMedicalFlag: null player → false
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

function buildScope(opts = {}) {
  const medicalNotes = opts.medicalNotes || {};
  const players      = opts.players      || [];

  const body = `"use strict";
    const state = {
      players:      ${JSON.stringify(players)},
      medicalNotes: ${JSON.stringify(medicalNotes)},
    };
    ${extractConst(html, 'PLAYER_LIFECYCLE_STATUSES')}
    ${extractConst(html, 'PLAYER_LIFECYCLE_LABELS')}
    ${extractFn(html, 'playerLifecycleInfo')}
    ${extractFn(html, 'playerProfileCompleteness')}
    ${extractFn(html, 'playerHasMedicalFlag')}
    ${extractFn(html, 'playerIsArchived')}
    ${extractFn(html, 'activeRosterPlayers')}
    ${extractFn(html, 'playerLifecycleStats')}
    return {
      playerLifecycleInfo,
      playerProfileCompleteness,
      playerHasMedicalFlag,
      playerIsArchived,
      activeRosterPlayers,
      playerLifecycleStats,
    };
  `;
  return new Function(body)();
}

// ── 1–7. playerProfileCompleteness ───────────────────────────────────────────

test('playerProfileCompleteness: all required fields present → 100%', () => {
  const { playerProfileCompleteness } = buildScope();
  const p = {
    name: 'Simon Dodd', email: 'simon@club.ie', phone: '+353 1 234',
    position: '10', emergencyContact: 'Jane Dodd', dateOfBirth: '1990-01-01',
  };
  const r = playerProfileCompleteness(p);
  assert.equal(r.score, 100);
  assert.deepEqual(r.missing, []);
});

test('playerProfileCompleteness: all fields missing → 0%', () => {
  const { playerProfileCompleteness } = buildScope();
  const p = { name: '—', email: '', phone: '', position: '', emergencyContact: '', dateOfBirth: '' };
  const r = playerProfileCompleteness(p);
  assert.equal(r.score, 0);
  assert.equal(r.missing.length, 6);
});

test('playerProfileCompleteness: partial profile → proportional score', () => {
  const { playerProfileCompleteness } = buildScope();
  // 3 of 6 fields: name, email, phone
  const p = {
    name: 'Simon', email: 'simon@club.ie', phone: '+353 1 234',
    position: '', emergencyContact: '', dateOfBirth: '',
  };
  const r = playerProfileCompleteness(p);
  assert.equal(r.score, 50);
  assert.equal(r.missing.length, 3);
});

test('playerProfileCompleteness: @player.test email counts as missing', () => {
  const { playerProfileCompleteness } = buildScope();
  const p = {
    name: 'Simon', email: 'simon.dodd@player.test', phone: '+353',
    position: '10', emergencyContact: 'Jane', dateOfBirth: '1990-01-01',
  };
  const r = playerProfileCompleteness(p);
  assert.ok(r.missing.includes('email'), 'test email is treated as missing');
});

test('playerProfileCompleteness: emergencyPhone counts for emergency field', () => {
  const { playerProfileCompleteness } = buildScope();
  const p = {
    name: 'Simon', email: 'simon@club.ie', phone: '+353',
    position: '10', emergencyContact: '', emergencyPhone: '+353 87 123', dateOfBirth: '1990-01-01',
  };
  const r = playerProfileCompleteness(p);
  assert.ok(!r.missing.includes('emergencyContact'), 'emergencyPhone satisfies emergency field');
});

test('playerProfileCompleteness: SUB position counts as missing', () => {
  const { playerProfileCompleteness } = buildScope();
  const p = {
    name: 'Simon', email: 'simon@club.ie', phone: '+353',
    position: 'SUB', primaryPosition: 'SUB', emergencyContact: 'Jane', dateOfBirth: '1990-01-01',
  };
  const r = playerProfileCompleteness(p);
  assert.ok(r.missing.includes('position'), 'SUB counts as missing position');
});

test('playerProfileCompleteness: null player → 0% with all fields missing', () => {
  const { playerProfileCompleteness } = buildScope();
  const r = playerProfileCompleteness(null);
  assert.equal(r.score, 0);
  assert.equal(r.missing.length, 6);
});

// ── 8–12. playerLifecycleInfo ─────────────────────────────────────────────────

test('playerLifecycleInfo: active → correct label and color', () => {
  const { playerLifecycleInfo } = buildScope();
  const r = playerLifecycleInfo({ lifecycleStatus: 'active' });
  assert.equal(r.label, 'Active');
  assert.ok(r.color, 'color present');
});

test('playerLifecycleInfo: injured → correct label', () => {
  const { playerLifecycleInfo } = buildScope();
  const r = playerLifecycleInfo({ lifecycleStatus: 'injured' });
  assert.equal(r.label, 'Injured');
  assert.equal(r.color, '#f87171');
});

test('playerLifecycleInfo: archived → correct label', () => {
  const { playerLifecycleInfo } = buildScope();
  const r = playerLifecycleInfo({ lifecycleStatus: 'archived' });
  assert.equal(r.label, 'Archived');
});

test('playerLifecycleInfo: unknown status falls back to active defaults', () => {
  const { playerLifecycleInfo } = buildScope();
  const r = playerLifecycleInfo({ lifecycleStatus: 'totally_unknown' });
  assert.equal(r.label, 'Active');
});

test('playerLifecycleInfo: null player → active defaults', () => {
  const { playerLifecycleInfo } = buildScope();
  const r = playerLifecycleInfo(null);
  assert.equal(r.label, 'Active');
});

// ── 13–16. playerIsArchived ───────────────────────────────────────────────────

test('playerIsArchived: lifecycleStatus=archived → true', () => {
  const { playerIsArchived } = buildScope();
  assert.equal(playerIsArchived({ lifecycleStatus: 'archived' }), true);
});

test('playerIsArchived: _archived=true → true', () => {
  const { playerIsArchived } = buildScope();
  assert.equal(playerIsArchived({ _archived: true, lifecycleStatus: 'active' }), true);
});

test('playerIsArchived: active player → false', () => {
  const { playerIsArchived } = buildScope();
  assert.equal(playerIsArchived({ lifecycleStatus: 'active' }), false);
  assert.equal(playerIsArchived({ lifecycleStatus: 'injured' }), false);
  assert.equal(playerIsArchived({}), false);
});

test('playerIsArchived: null → false', () => {
  const { playerIsArchived } = buildScope();
  assert.equal(playerIsArchived(null),      false);
  assert.equal(playerIsArchived(undefined), false);
});

// ── 17–20. activeRosterPlayers ────────────────────────────────────────────────

test('activeRosterPlayers: filters out archived players', () => {
  const { activeRosterPlayers } = buildScope();
  const players = [
    { id:'p1', lifecycleStatus:'active' },
    { id:'p2', lifecycleStatus:'archived' },
    { id:'p3', lifecycleStatus:'active' },
  ];
  const result = activeRosterPlayers(players);
  assert.equal(result.length, 2);
  assert.ok(result.every(p => p.id !== 'p2'));
});

test('activeRosterPlayers: filters out _archived=true legacy flag', () => {
  const { activeRosterPlayers } = buildScope();
  const players = [{ id:'p1', _archived: true }, { id:'p2', _archived: false }];
  const result = activeRosterPlayers(players);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'p2');
});

test('activeRosterPlayers: keeps all active players', () => {
  const { activeRosterPlayers } = buildScope();
  const players = [
    { id:'p1', lifecycleStatus:'active'  },
    { id:'p2', lifecycleStatus:'injured' },
    { id:'p3', lifecycleStatus:'invited' },
  ];
  assert.equal(activeRosterPlayers(players).length, 3);
});

test('activeRosterPlayers: empty array → empty result', () => {
  const { activeRosterPlayers } = buildScope();
  assert.deepEqual(activeRosterPlayers([]), []);
  assert.deepEqual(activeRosterPlayers(null), []);
});

// ── 21–25. playerLifecycleStats ───────────────────────────────────────────────

test('playerLifecycleStats: correct counts for mixed lifecycle states', () => {
  const { playerLifecycleStats } = buildScope();
  const players = [
    { id:'p1', lifecycleStatus:'active',   registrationStatus:'registered',   game:'available', name:'A', email:'a@x.com', phone:'1', position:'10', emergencyContact:'ec', dateOfBirth:'2000-01-01' },
    { id:'p2', lifecycleStatus:'injured',  registrationStatus:'unregistered', game:'injured',   name:'B', email:'', phone:'', position:'', emergencyContact:'', dateOfBirth:'' },
    { id:'p3', lifecycleStatus:'archived', registrationStatus:'unregistered', game:'no-reply',  name:'C', email:'', phone:'', position:'', emergencyContact:'', dateOfBirth:'' },
    { id:'p4', lifecycleStatus:'active',   registrationStatus:'unregistered', game:'no-reply',  name:'D', email:'', phone:'', position:'', emergencyContact:'', dateOfBirth:'' },
  ];
  const s = playerLifecycleStats(players);
  assert.equal(s.all,      4,  'all count');
  assert.equal(s.active,   3,  'active (non-archived)');
  assert.equal(s.archived, 1,  'archived');
  assert.equal(s.injured,  1,  'injured');
});

test('playerLifecycleStats: all archived → active=0', () => {
  const { playerLifecycleStats } = buildScope();
  const players = [
    { id:'p1', lifecycleStatus:'archived' },
    { id:'p2', lifecycleStatus:'archived' },
  ];
  const s = playerLifecycleStats(players);
  assert.equal(s.active,   0);
  assert.equal(s.archived, 2);
});

test('playerLifecycleStats: empty array → all zeros', () => {
  const { playerLifecycleStats } = buildScope();
  const s = playerLifecycleStats([]);
  assert.equal(s.all,          0);
  assert.equal(s.active,       0);
  assert.equal(s.archived,     0);
  assert.equal(s.injured,      0);
  assert.equal(s.incomplete,   0);
  assert.equal(s.unregistered, 0);
});

test('playerLifecycleStats: game=injured contributes to injured count', () => {
  const { playerLifecycleStats } = buildScope();
  const players = [
    { id:'p1', lifecycleStatus:'active', game:'injured' },
    { id:'p2', lifecycleStatus:'active', game:'available' },
  ];
  const s = playerLifecycleStats(players);
  assert.equal(s.injured, 1);
});

test('playerLifecycleStats: unregistered count correct', () => {
  const { playerLifecycleStats } = buildScope();
  const players = [
    { id:'p1', lifecycleStatus:'active', registrationStatus:'registered',   game:'', name:'A', email:'a@x.com', phone:'1', position:'9', emergencyContact:'X', dateOfBirth:'2000-01-01' },
    { id:'p2', lifecycleStatus:'active', registrationStatus:'unregistered', game:'', name:'B', email:'', phone:'', position:'', emergencyContact:'', dateOfBirth:'' },
    { id:'p3', lifecycleStatus:'active', registrationStatus:'pending',      game:'', name:'C', email:'', phone:'', position:'', emergencyContact:'', dateOfBirth:'' },
  ];
  const s = playerLifecycleStats(players);
  assert.equal(s.unregistered, 1, 'only truly unregistered players count');
});

// ── 26–30. playerHasMedicalFlag ──────────────────────────────────────────────

test('playerHasMedicalFlag: no flag when no medical data', () => {
  const { playerHasMedicalFlag } = buildScope();
  assert.equal(playerHasMedicalFlag({ id:'p1', game:'available', medical:'' }), false);
});

test('playerHasMedicalFlag: game=injured → flag', () => {
  const { playerHasMedicalFlag } = buildScope();
  assert.equal(playerHasMedicalFlag({ id:'p1', game:'injured', medical:'' }), true);
});

test('playerHasMedicalFlag: non-empty medical string → flag', () => {
  const { playerHasMedicalFlag } = buildScope();
  assert.equal(playerHasMedicalFlag({ id:'p1', game:'available', medical:'Back pain' }), true);
});

test('playerHasMedicalFlag: medicalNotes with condition → flag', () => {
  const { playerHasMedicalFlag } = buildScope({ medicalNotes: { 'p1': { condition: 'ACL', notes: '' } } });
  assert.equal(playerHasMedicalFlag({ id:'p1', game:'available', medical:'' }), true);
});

test('playerHasMedicalFlag: null player → false', () => {
  const { playerHasMedicalFlag } = buildScope();
  assert.equal(playerHasMedicalFlag(null),      false);
  assert.equal(playerHasMedicalFlag(undefined), false);
});
