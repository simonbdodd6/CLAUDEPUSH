#!/usr/bin/env node
/**
 * RC4.7 — audit the legacy per-coach medical data before any migration.
 *
 * Medical records historically lived inside each coach's PRIVATE draft blob
 * (publish:<clubId>:draft:<userId>). Before that can be consolidated into the
 * shared medical:<clubId> store, we need to know whether two coaches hold
 * CONFLICTING copies of the same player's history — because a silent merge
 * would destroy medical information.
 *
 * READ-ONLY. This script issues no write of any kind.
 *
 * Usage:
 *   node scripts/audit-medical-drafts.js --club <clubId>
 *
 * Output is aggregate counts only: never a name, note, condition, player id,
 * user id or any medical detail.
 */

import { kvGet, kvScanKeys } from '../api/_kv.js';
import { key, APP_PREFIX } from '../api/_keys.js';

const USAGE = 'Usage: node scripts/audit-medical-drafts.js --club <clubId>';

export function parseArgs(argv = []) {
  let clubId = '';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i]);
    if (arg === '--club') {
      const value = String(argv[i + 1] ?? '').trim();
      if (!value || value.startsWith('--')) throw new Error('--club requires a club id');
      clubId = value; i += 1; continue;
    }
    if (arg.startsWith('--club=')) {
      clubId = arg.slice('--club='.length).trim();
      if (!clubId) throw new Error('--club requires a club id');
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (!clubId) throw new Error('--club <clubId> is required');
  return { clubId };
}

const isFilled = value => value && typeof value === 'object' && Object.keys(value).length > 0;

/**
 * Compare two copies of one player's medical data. Returns true when they
 * differ in substance — the case that makes a silent merge unsafe.
 */
export function conflicts(a, b) {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

export function summarise(drafts, roster) {
  const report = {
    draftsScanned: drafts.length,
    draftsWithMedicalRecords: 0,
    draftsWithMedicalNotes: 0,
    uniquePlayersWithHistory: 0,
    playersInMoreThanOneDraft: 0,
    conflictingPlayers: 0,
    identicalDuplicatePlayers: 0,
    draftsWithUpdatedAt: 0,
    deterministicNewestWins: false,
    playersWithRosterMedicalOnly: 0,
  };

  // playerId -> [{ owner, records, notes }]
  const byPlayer = new Map();
  for (const draft of drafts) {
    const records = draft?.value?.medicalRecords;
    const notes = draft?.value?.medicalNotes;
    if (isFilled(records)) report.draftsWithMedicalRecords += 1;
    if (isFilled(notes)) report.draftsWithMedicalNotes += 1;
    if (draft?.value?.updatedAt) report.draftsWithUpdatedAt += 1;

    for (const pid of new Set([...Object.keys(records || {}), ...Object.keys(notes || {})])) {
      const entry = { owner: draft.owner, records: (records || {})[pid], notes: (notes || {})[pid] };
      if (!isFilled(entry.records) && !isFilled(entry.notes)) continue;
      byPlayer.set(pid, [...(byPlayer.get(pid) || []), entry]);
    }
  }

  report.uniquePlayersWithHistory = byPlayer.size;
  for (const copies of byPlayer.values()) {
    if (copies.length < 2) continue;
    report.playersInMoreThanOneDraft += 1;
    const [first, ...rest] = copies;
    const differs = rest.some(c => conflicts(c.records, first.records) || conflicts(c.notes, first.notes));
    if (differs) report.conflictingPlayers += 1;
    else report.identicalDuplicatePlayers += 1;
  }

  // Newest-wins is only defensible if EVERY draft holding medical data is
  // timestamped; otherwise there is no ordering and a merge would be a guess.
  const medicalDrafts = drafts.filter(d => isFilled(d?.value?.medicalRecords) || isFilled(d?.value?.medicalNotes));
  report.deterministicNewestWins = medicalDrafts.length > 0
    && medicalDrafts.every(d => Boolean(d?.value?.updatedAt));

  // Roster-only: a player flagged medically on the roster row with no draft history.
  for (const p of (roster?.players || [])) {
    const flagged = String(p?.medical || '').trim() || p?.game === 'injured'
      || ['unavailable', 'modified', 'gymOnly', 'noContact'].includes(p?.trainingStatus);
    if (flagged && !byPlayer.has(String(p.id))) report.playersWithRosterMedicalOnly += 1;
  }

  return report;
}

export function recommend(report) {
  if (report.uniquePlayersWithHistory === 0) {
    return 'NO MIGRATION NEEDED — no per-coach medical history exists. The shared store starts empty.';
  }
  if (report.conflictingPlayers > 0) {
    return `REVIEW REQUIRED — ${report.conflictingPlayers} player(s) have DIFFERENT histories in more than one draft. `
      + 'Do not merge automatically: a reviewed, per-player decision is needed so nothing is discarded.';
  }
  if (report.playersInMoreThanOneDraft > 0) {
    return 'SAFE TO MIGRATE — duplicates exist but every copy is identical, so consolidation is lossless.';
  }
  return 'SAFE TO MIGRATE — each player\'s history exists in exactly one draft; no conflict is possible.';
}

export async function run(argv = [], { log = console.log, error = console.error, env = process.env } = {}) {
  let opts;
  try { opts = parseArgs(argv); }
  catch (err) { error(`error: ${err.message}`); error(USAGE); return 2; }

  const missing = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']
    .filter(n => !String(env[n] || '').trim());
  if (missing.length) {
    error(`error: missing storage credentials: ${missing.join(', ')}`);
    return 3;
  }

  const prefix = `${APP_PREFIX}:publish:${opts.clubId}:draft:`;
  const keys = await kvScanKeys(`${prefix}*`);
  const drafts = [];
  for (const k of keys) {
    drafts.push({ owner: k.slice(prefix.length), value: await kvGet(k) });
  }
  const roster = await kvGet(key(`roster:${opts.clubId}`));
  const shared = await kvGet(key(`medical:${opts.clubId}`));

  const report = summarise(drafts, roster);
  log(`club                          ${opts.clubId}`);
  for (const [k, v] of Object.entries(report)) log(`${k.padEnd(30)}${v}`);
  log(`sharedStoreAlreadyExists      ${Boolean(shared)}`);
  log(`sharedStoreCases              ${(shared?.cases || []).length}`);
  log('');
  log(recommend(report));
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  run(process.argv.slice(2))
    .then(code => { process.exitCode = code; })
    .catch(err => { console.error(`error: ${err?.message || 'audit failed'}`); process.exitCode = 1; });
}
