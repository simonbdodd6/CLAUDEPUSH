#!/usr/bin/env node
/**
 * READ-ONLY audit of the shared Medical store.
 *
 * Written to answer one question safely: how many cases exist, and how many
 * carry no player group — the state that made the physio's injuries invisible.
 *
 * It issues Redis GET only. There is no SET, no DEL, no repair path and no
 * migration here, deliberately: this script can be run against production
 * without any possibility of changing it.
 *
 * Output is aggregate counts and group ids only. No name, email, condition,
 * note, timeline text, player id or user id is ever printed.
 *
 * Usage:
 *   node scripts/audit-medical-shared-cases.js --club <clubId>
 */

import { kvGet } from '../api/_kv.js';
import { key } from '../api/_keys.js';

const USAGE = 'Usage: node scripts/audit-medical-shared-cases.js --club <clubId>';

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

/** Aggregate only. Never returns anything drawn from case content. */
export function summarise(record, structure) {
  const cases = Array.isArray(record?.cases) ? record.cases : [];
  const grouped = {};
  let missing = 0;
  for (const c of cases) {
    const gid = String(c?.playerGroupId || '').trim();
    if (!gid) { missing += 1; continue; }
    grouped[gid] = (grouped[gid] || 0) + 1;
  }
  const live = ((structure && structure.groups) || []).filter(g => g.status === 'active');
  return {
    sharedStoreExists: Boolean(record),
    totalCases: cases.length,
    activeCases: cases.filter(c => c?.status === 'active').length,
    resolvedCases: cases.filter(c => c?.status === 'resolved').length,
    casesWithPlayerGroupId: cases.length - missing,
    casesWithMissingPlayerGroupId: missing,
    casesByPlayerGroupId: grouped,
    distinctGroupIds: Object.keys(grouped).sort(),
    activeGroups: live.map(g => ({ id: g.id, name: g.name })),
    updatedAt: record?.updatedAt || null,
  };
}

export function interpret(summary) {
  if (!summary.sharedStoreExists) return 'No shared Medical store for this club — nothing has been recorded yet.';
  if (summary.casesWithMissingPlayerGroupId === 0) {
    return 'Every case carries a player group. Nothing is orphaned.';
  }
  const many = summary.activeGroups.length > 1;
  return `${summary.casesWithMissingPlayerGroupId} case(s) carry no player group. `
    + (many
      ? 'This club has several active groups, so these are visible ONLY to a Medical user whose access covers every group.'
      : 'This club has one active group, so any authorised Medical user covers the whole club and will now see them.');
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

  const [record, structure] = await Promise.all([
    kvGet(key(`medical:${opts.clubId}`)),
    kvGet(key(`structure:${opts.clubId}`)),
  ]);
  const summary = summarise(record, structure);

  log(`club                          ${opts.clubId}`);
  for (const [k, v] of Object.entries(summary)) {
    log(`${k.padEnd(30)}${typeof v === 'object' ? JSON.stringify(v) : v}`);
  }
  log('');
  log(interpret(summary));
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  run(process.argv.slice(2))
    .then(code => { process.exitCode = code; })
    .catch(err => { console.error(`error: ${err?.message || 'audit failed'}`); process.exitCode = 1; });
}
