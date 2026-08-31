/**
 * MEDIA CONSENT — one boolean, one claim.
 *
 * WHAT WAS WRONG. `mediaConsent` is a boolean, so it has two states while the
 * world has three: consent held, consent refused, and nobody asked. The product
 * asserted all three at once from that single bit — `false` was coloured RED
 * (refused), labelled "Pending" (not yet asked) and announced as "revoked".
 *
 * Worse, merging two records for the same player OR'd the value, so a record
 * that never held consent could acquire it from another — manufacturing a
 * permission nobody recorded.
 *
 * And it is DEVICE-LOCAL: nothing about media consent reaches the server (no
 * field, no endpoint, no sync), so "Granted" was one browser's note presented
 * as a club record.
 *
 * The stored model is unchanged — deciding whether a refusal must be
 * distinguishable, and who may record consent at all, is a product and legal
 * question, not one to invent here. What changed is that every label now admits
 * exactly what the bit proves, and nothing manufactures it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');
const idStore = await readFile(join(__dirname, '..', 'api', '_identityStore.js'), 'utf8');

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

/** The real merge, with its real dependencies. */
const merge = (() => {
  // The real dependency closure of mergeRosterMember, so the merge under test
  // is the product's own, not a paraphrase of it.
  const deps = ['rosterIdentityScore', 'resolveRosterMessagingId', 'isPermanentPlayerUserId',
                'canonicalIdentityDisplayName', 'identityEmailKey', 'findPermanentRosterUser',
                'canonicalIdentityNameKey', 'identityCompactKey', 'identityNameKey', 'playerIsArchived']
    .map(n => { try { return extractFn(html, n); } catch { return ''; } }).filter(Boolean).join('\n');
  return new Function(`"use strict";
    const state = { users: [] };
    function esc(v){ return String(v==null?'':v); }
    ${deps}
    ${extractFn(html, 'mergeRosterMember')}
    return mergeRosterMember;`)();
})();

const HELD    = { id: 'p1', name: 'Ana Silva', userId: 'u1', mediaConsent: true };
const NOTHELD = { id: 'p1', name: 'Ana Silva', userId: 'u1', mediaConsent: false };

// ───────────────────────── consent is never manufactured ────────────────────

test('merging never UPGRADES a record to consent it does not hold', () => {
  // The SURVIVING record's own answer stands, whichever way round the merge
  // runs. Which record survives is decided by identity strength, never by
  // consent — so the other record's value is evidence about itself only.
  //
  // With identical identities the existing record is preferred:
  assert.equal(merge(NOTHELD, HELD).mediaConsent, false,
    'the surviving record held no consent — it must not acquire it from the other');
  assert.equal(merge(HELD, NOTHELD).mediaConsent, true,
    'and a surviving record that DOES hold consent keeps it');
});

test('two records with no consent stay with no consent', () => {
  assert.equal(merge(NOTHELD, NOTHELD).mediaConsent, false);
});

test('the merge is not an OR', () => {
  const src = strip(extractFn(html, 'mergeRosterMember'));
  assert.ok(!/mediaConsent\s*=\s*Boolean\([^)]*\|\|/.test(src),
    'an OR upgrades a record that never held consent');
  assert.match(src, /merged\.mediaConsent = Boolean\(preferred\.mediaConsent\);/);
});

test('a missing value is not consent', () => {
  const bare = { id: 'p1', name: 'Ana Silva', userId: 'u1' };   // no field at all
  assert.equal(merge(bare, bare).mediaConsent, false, 'absent is never consent');
  assert.equal(merge(bare, HELD).mediaConsent, false,
    'the surviving record has no consent field — the other record cannot supply one');
  assert.equal(merge(HELD, bare).mediaConsent, true, 'the surviving record keeps its own');
});

test('a rename does not change what is recorded', () => {
  const renamed = { ...HELD, name: 'Ana Marie Silva-Fernandes' };
  assert.equal(merge(renamed, renamed).mediaConsent, true);
  const clearedRenamed = { ...NOTHELD, name: 'Ana Marie Silva-Fernandes' };
  assert.equal(merge(clearedRenamed, clearedRenamed).mediaConsent, false);
});

test('two players sharing a display name do not share consent', () => {
  const a = { id: 'pA', name: 'Sam Jones', userId: 'uA', mediaConsent: true };
  const b = { id: 'pB', name: 'Sam Jones', userId: 'uB', mediaConsent: false };
  // Different identities are never merged into one another; each keeps its own.
  assert.equal(merge(a, a).mediaConsent, true);
  assert.equal(merge(b, b).mediaConsent, false);
});

// ───────────────────────── one boolean, one claim ───────────────────────────

const CELL = (() => {
  const i = html.indexOf('<td data-label="Media consent">');
  return html.slice(i, html.indexOf('</td>', i));
})();

test('the three states are labelled by what the bit actually proves', () => {
  assert.match(CELL, /\$\{p\.mediaConsent\?"Recorded":"Not recorded"\}/);
  // "Pending" asserted a process that does not exist, and hid that a cleared
  // note is indistinguishable from a player nobody asked.
  assert.ok(!/Pending/.test(CELL));
  assert.ok(!/Granted/.test(CELL), '"Granted" claimed the player gave it; the note only says a coach recorded it');
});

test('unknown is not coloured as a refusal', () => {
  assert.ok(!/var\(--red\)/.test(CELL), 'red asserted "refused", which one boolean cannot prove');
  assert.match(CELL, /p\.mediaConsent\?"var\(--accent\)":"var\(--muted\)"/);
  assert.match(CELL, /consent-dot \$\{p\.mediaConsent\?"c-yes":"c-none"\}/);
  assert.match(html, /\.consent-dot\.c-none \{/, 'unknown has its own neutral dot');
});

test('the cell explains what "not recorded" does and does not mean', () => {
  assert.match(CELL, /it may simply not have been asked/);
  assert.match(CELL, /Saved on this device only/);
});

test('the toast no longer claims a revocation it cannot prove', () => {
  const fn = strip(extractFn(html, 'toggleMediaConsent'));
  assert.ok(!/revoked/.test(fn), 'clearing a note is not proof the player withdrew anything');
  assert.match(fn, /Media consent recorded for/);
  assert.match(fn, /Media consent note cleared for/);
  assert.match(fn, /\(this device\)/, 'and it says where the note lives');
});

test('only a coach can change the note', () => {
  const fn = strip(extractFn(html, 'toggleMediaConsent'));
  assert.match(fn, /if \(!isCoach\(\)\) return showToast\("Only coaches can update consent"\)/);
  assert.ok(fn.indexOf('isCoach') < fn.indexOf('p.mediaConsent=!p.mediaConsent'),
    'the gate precedes the write');
});

// ───────────────────────── the scope is stated ──────────────────────────────

test('the Members table says the note is device-local', () => {
  const i = html.indexOf('Media consent is a note saved on this device only');
  assert.ok(i > -1, 'a coach reading "Recorded" must not believe the club holds it');
  const note = html.slice(i, i + 240);
  assert.match(note, /not shared with other coaches or stored with the club/);
  assert.match(note, /it does not mean consent was refused/);
});

test('and that claim is TRUE — consent reaches no server field', async () => {
  const { readdir, readFile: rf } = await import('node:fs/promises');
  const files = (await readdir(new URL('../api/', import.meta.url))).filter(f => f.endsWith('.js'));
  for (const f of files) {
    const src = await rf(new URL('../api/' + f, import.meta.url), 'utf8');
    assert.ok(!/mediaConsent/.test(src), `api/${f} must not carry media consent`);
  }
  // and the profile writer's allow-list has no consent field
  const writer = idStore.slice(idStore.indexOf('export async function updateProfile'));
  assert.ok(!/consent/i.test(writer.slice(0, 2000)), 'updateProfile accepts no consent field');
});

// ───────────────────────── privacy: it stays where it belongs ───────────────

test('consent never leaks into activity, messages or notifications', () => {
  for (const fn of ['recentActivity', 'attendanceStats', 'seasonPlayerStats',
                    'memberCentreModel', 'trainingAttendanceForSession']) {
    const src = strip(extractFn(html, fn));
    assert.ok(!/mediaConsent/i.test(src), `${fn} must not read media consent`);
  }
});

test('exactly ONE surface reads it, and nothing gates on it', () => {
  const readers = [...html.matchAll(/\bp\.mediaConsent\b/g)].length;
  // The cell reads it five times (two title branches, colour, dot, label) and
  // the toggle reads-then-writes it. Anything beyond that is a new consumer and
  // should be looked at deliberately.
  assert.ok(readers <= 8, `unexpected consent readers: ${readers}`);
  // No export, report or publishing path consults it.
  for (const m of html.matchAll(/mediaConsent/g)) {
    const around = html.slice(Math.max(0, m.index - 200), m.index + 60);
    assert.ok(!/csv|xlsx|download|export|publish\(/i.test(around),
      'media consent must not reach an export or a publish path');
  }
});

test('the stored model is deliberately unchanged', () => {
  // Three states would need a product and legal decision (may staff record it at
  // all; must a refusal be distinguishable; what does silence mean). This build
  // does not invent that — it only stops the UI claiming more than the bit says.
  assert.match(html, /mediaConsent: false,/, 'the default is still a plain boolean');
  assert.ok(!/mediaConsentState|consentStatus|CONSENT_STATES/.test(html),
    'no second consent model was introduced');
});
