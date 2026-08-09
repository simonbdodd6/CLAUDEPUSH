#!/usr/bin/env node
/**
 * RC4.7 D1a — one-off maintenance script: backfill `playerGroupId`.
 *
 * This is a THIN WRAPPER. All migration logic, and every safety rule, lives in
 * `backfillPlayerGroups()` in api/_identityStore.js and is covered by the D1a
 * test suite. Nothing here decides who gets assigned to what.
 *
 * Usage:
 *   node scripts/backfill-player-groups.js --club <clubId>            # dry run
 *   node scripts/backfill-player-groups.js --club <clubId> --apply    # writes
 *
 * Dry run is the default: without --apply nothing is ever written.
 *
 * Credentials come from the environment (UPSTASH_REDIS_REST_URL / _TOKEN), the
 * same variables the serverless functions use. Nothing is hard-coded here, and
 * no secret, email, name or id is ever printed — only aggregate counts.
 */

import { backfillPlayerGroups } from '../api/_identityStore.js';

const USAGE = [
  'Usage:',
  '  node scripts/backfill-player-groups.js --club <clubId>          (dry run, no writes)',
  '  node scripts/backfill-player-groups.js --club <clubId> --apply  (writes)',
].join('\n');

/**
 * Strict argument parsing: an explicit club id is required and anything
 * unrecognised is a hard error, so a typo can never silently become a live run.
 */
export function parseArgs(argv = []) {
  let clubId = '';
  let apply = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i]);
    if (arg === '--apply') { apply = true; continue; }
    if (arg === '--club' || arg === '--club-id') {
      const value = String(argv[i + 1] ?? '').trim();
      if (!value || value.startsWith('--')) throw new Error('--club requires a club id');
      clubId = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('--club=')) {
      clubId = arg.slice('--club='.length).trim();
      if (!clubId) throw new Error('--club requires a club id');
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  if (!clubId) throw new Error('--club <clubId> is required');
  return { clubId, apply, dryRun: !apply };
}

/** Aggregate counts only — never a name, email, member id or credential. */
export function formatReport(report, { dryRun }) {
  return [
    `mode            ${dryRun ? 'DRY RUN (no writes)' : 'APPLY (writes)'}`,
    `club            ${report.clubId}`,
    `activeGroups    ${report.activeGroups}`,
    `targetGroup     ${report.groupName || '(none)'}`,
    `totalMembers    ${report.totalMembers}`,
    `activePlayers   ${report.activePlayers}`,
    `alreadyAssigned ${report.alreadyAssigned}`,
    `staffSkipped    ${report.staffSkipped}`,
    `wouldAssign     ${report.wouldAssign}`,
    `assigned        ${report.assigned}`,
    `applied         ${report.applied}`,
    report.reason ? `reason          ${report.reason}` : null,
  ].filter(Boolean).join('\n');
}

/** Presence check only — the values themselves are never read or printed. */
export function missingCredentials(env = process.env) {
  return ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']
    .filter(name => !String(env[name] || '').trim());
}

export async function run(argv = [], { log = console.log, error = console.error, env = process.env,
                                        backfill = backfillPlayerGroups } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    error(`error: ${err.message}`);
    error(USAGE);
    return 2;
  }

  const missing = missingCredentials(env);
  if (missing.length) {
    error(`error: missing storage credentials: ${missing.join(', ')}`);
    error('Load them from Vercel without printing them, e.g.:');
    error('  vercel env pull .env.production.local --environment=production');
    error('  node --env-file=.env.production.local scripts/backfill-player-groups.js --club <clubId>');
    return 3;
  }

  const report = await backfill(opts.clubId, { dryRun: opts.dryRun, changedBy: 'd1a-backfill-script' });
  log(formatReport(report, opts));

  // A refusal (zero or several active groups) is a safe outcome, but it is not
  // success — exit non-zero so an operator cannot mistake it for a completed run.
  if (opts.apply && !report.applied) return 1;
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  run(process.argv.slice(2))
    .then(code => { process.exitCode = code; })
    .catch(err => { console.error(`error: ${err?.message || 'backfill failed'}`); process.exitCode = 1; });
}
