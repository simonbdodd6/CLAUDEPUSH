// CoachEasier Performance — visibility & ownership tests (SC2).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendAudit,
  AUDIT_LOG_MAX,
  makeGrant,
  mapCoachEasierRole,
  PROFILE_CATEGORIES,
  resolveVisibility,
  revokeGrant,
  visibleCategories,
  VISIBILITY_ROLES,
} from '../domain/visibility.js';

const NOW = new Date('2026-08-03T12:00:00');

// ── Conservative defaults ───────────────────────────────────────────────────

test('players see their own information in full', () => {
  for (const c of PROFILE_CATEGORIES) {
    const level = resolveVisibility('player', c.id, { isSelf: true });
    assert.notEqual(level, 'none', `player sees own ${c.id}`);
  }
});

test('club admins get no automatic access to restricted or sensitive data', () => {
  for (const cat of ['health', 'pain', 'wellness', 'body', 'strength', 'goals']) {
    assert.equal(resolveVisibility('club_admin', cat, {}), 'none', `club_admin blocked from ${cat}`);
  }
  assert.equal(resolveVisibility('club_admin', 'identity', {}), 'summary');
});

test('team (rugby) coaches get no automatic health/wellness/pain access', () => {
  for (const cat of ['health', 'wellness', 'pain', 'body']) {
    assert.equal(resolveVisibility('team_coach', cat, { assigned: true }), 'none', `team_coach blocked from ${cat}`);
  }
  assert.equal(resolveVisibility('team_coach', 'rugby', { assigned: true }), 'full');
});

test('S&C coaches see performance data for ASSIGNED athletes only', () => {
  assert.equal(resolveVisibility('snc_coach', 'strength', { assigned: true }), 'full');
  assert.equal(resolveVisibility('snc_coach', 'strength', { assigned: false }), 'none', 'unassigned athlete hidden');
  assert.equal(resolveVisibility('snc_coach', 'wellness', { assigned: true }), 'summary', 'wellness is summary-only');
  assert.equal(resolveVisibility('snc_coach', 'pain', { assigned: true }), 'summary');
  assert.equal(resolveVisibility('snc_coach', 'health', { assigned: true }), 'none', 'restricted health needs explicit grant');
});

test('medical staff see nothing until explicitly authorised', () => {
  for (const cat of ['health', 'pain', 'wellness', 'body', 'strength']) {
    assert.equal(resolveVisibility('medical', cat, {}), 'none', `medical blocked from ${cat} by default`);
  }
  const grants = [makeGrant({ role: 'medical', category: 'health', level: 'full', grantedBy: 'u1', now: '2026-08-01' })];
  assert.equal(resolveVisibility('medical', 'health', { grants, now: NOW }), 'full', 'explicit grant authorises');
});

test('parent/guardian access is configurable and off by default', () => {
  assert.equal(resolveVisibility('parent', 'rugby', {}), 'none');
  const grants = [makeGrant({ role: 'parent', category: 'rugby', level: 'summary', grantedBy: 'u1', now: '2026-08-01' })];
  assert.equal(resolveVisibility('parent', 'rugby', { grants, now: NOW }), 'summary');
});

// ── Grants lifecycle ────────────────────────────────────────────────────────

test('grants are revocable and revoked grants stop applying', () => {
  let grants = [makeGrant({ role: 'medical', category: 'health', level: 'full', grantedBy: 'u1', now: '2026-08-01' })];
  assert.equal(resolveVisibility('medical', 'health', { grants, now: NOW }), 'full');
  grants = revokeGrant(grants, { role: 'medical', category: 'health', now: '2026-08-02' });
  assert.equal(resolveVisibility('medical', 'health', { grants, now: NOW }), 'none', 'revoked grant no longer applies');
  assert.equal(grants.length, 1, 'revocation annotates, never deletes history');
  assert.equal(grants[0].revokedAt, '2026-08-02');
});

test('grants never narrow defaults, only widen', () => {
  const grants = [makeGrant({ role: 'snc_coach', category: 'rugby', level: 'summary', grantedBy: 'u1', now: '2026-08-01' })];
  assert.equal(resolveVisibility('snc_coach', 'rugby', { assigned: true, grants, now: NOW }), 'full',
    'a summary grant cannot downgrade full default');
});

test('unknown roles and categories resolve to none', () => {
  assert.equal(resolveVisibility('hacker', 'health', {}), 'none');
  assert.equal(resolveVisibility('player', 'passwords', { isSelf: true }), 'none');
});

test('visibleCategories omits none-level categories', () => {
  const cats = visibleCategories('club_admin', {});
  assert.ok(!('health' in cats));
  assert.ok(!('wellness' in cats));
  assert.equal(cats.identity, 'summary');
});

test('system_admin access exists but is an audited operational role', () => {
  assert.equal(resolveVisibility('system_admin', 'health', {}), 'full');
  assert.ok(VISIBILITY_ROLES.some((r) => r.id === 'system_admin'));
});

// ── Audit ───────────────────────────────────────────────────────────────────

test('visibility changes are auditable; log is capped and truncates detail', () => {
  let log = [];
  log = appendAudit(log, { action: 'grant', actor: 'u1', role: 'medical', category: 'health', level: 'full', at: '2026-08-01', detail: 'x'.repeat(500) });
  assert.equal(log.length, 1);
  assert.equal(log[0].detail.length, 200, 'detail capped');
  for (let i = 0; i < AUDIT_LOG_MAX + 10; i++) {
    log = appendAudit(log, { action: 'view', actor: 'u2', at: '2026-08-02' });
  }
  assert.equal(log.length, AUDIT_LOG_MAX, 'audit log capped');
});

// ── Role seam ───────────────────────────────────────────────────────────────

test('mapCoachEasierRole maps existing app roles conservatively', () => {
  assert.equal(mapCoachEasierRole({ role: 'coach' }), 'snc_coach');
  assert.equal(mapCoachEasierRole({ role: 'player' }), 'player');
  assert.equal(mapCoachEasierRole({ role: 'weird' }), null);
  assert.equal(mapCoachEasierRole(null), null);
});
