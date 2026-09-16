#!/usr/bin/env node
// npm run deploy:release
//
// The only script in this repository that touches production. It runs the gate
// first and refuses to continue if the gate fails; it never edits application
// code to make the gate pass. After deploying it re-points the legacy alias
// (which does not follow production automatically) and verifies the result
// with read-only requests.

import { execFileSync } from 'node:child_process';
import { loadConfig, REPO_ROOT, git, h1, ok, bad, info, die } from './deploy-lib.mjs';

const cfg = loadConfig();
const aliases = cfg.policies.aliases;
const branch = git(['branch', '--show-current']);

console.log('CoachEasier Core — production release');
console.log(`branch: ${branch}`);

if (!branch.startsWith(cfg.deployBranchPrefix)) {
  die(`refusing to deploy from ${branch} — production is released from ${cfg.deployBranchPrefix}NN branches only (run npm run deploy:prepare first)`);
}

// ── 1. the gate, fail closed ─────────────────────────────────────────────
h1('running deployment gate');
try {
  execFileSync('node', ['scripts/deploy-check.mjs', branch], { cwd: REPO_ROOT, stdio: 'inherit', timeout: 1_800_000 });
} catch {
  die('the deployment gate did not pass — nothing was deployed. Fix the cause, do not bypass the gate.');
}
ok('gate passed');

// ── 2. deploy ────────────────────────────────────────────────────────────
h1('deploying to production');
info(`${cfg.policies.deployment.command} (account ${cfg.policies.deployment.account})`);
let out;
try {
  out = execFileSync('vercel', ['deploy', '--prod', '--yes'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 1_800_000 });
} catch (e) {
  console.error(`${e.stdout || ''}${e.stderr || ''}`.slice(-2000));
  die('vercel deploy failed — production is unchanged (the previous deployment is still live)');
}
console.log(out.split('\n').slice(-25).join('\n'));

const idMatch = out.match(/"id":\s*"(dpl_[A-Za-z0-9]+)"/);
const urlMatch = out.match(/"url":\s*"(https:\/\/[^"]+)"/) || out.match(/(https:\/\/[A-Za-z0-9.-]+\.vercel\.app)/);
const ready = /"readyState":\s*"READY"/.test(out);
const deploymentId = idMatch ? idMatch[1] : null;
const deploymentUrl = urlMatch ? urlMatch[1].replace(/^https:\/\//, '') : null;

if (!deploymentUrl) die('could not determine the new deployment URL from the vercel output — verify manually before doing anything else');
if (!ready) info('vercel did not report READY in its output — verifying against live production below');
ok(`deployment ${deploymentId || '(id unknown)'} → ${deploymentUrl}`);

// ── 3. legacy alias (does NOT follow production automatically) ───────────
h1('legacy alias');
try {
  execFileSync('vercel', ['alias', 'set', deploymentUrl, aliases.manualRepointRequired], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 300_000 });
  ok(`${aliases.manualRepointRequired} re-pointed`);
} catch (e) {
  bad(`could not re-point ${aliases.manualRepointRequired}: ${String(e.stderr || e.message).slice(0, 200)}`);
  info('production itself is live; re-point this legacy domain manually');
}

// ── 4. read-only verification ────────────────────────────────────────────
h1('production verification (read-only)');
const expected = git(['rev-parse', '--short=7', 'HEAD']);
const get = async (url, asJson = false) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    return { status: r.status, body: asJson ? await r.json() : null };
  } catch (e) { return { status: 0, error: e.message }; }
};

const problems = [];
for (const host of [aliases.primary, aliases.autoAliased, aliases.manualRepointRequired]) {
  const r = await get(`https://${host}/api/config`, true);
  const v = r.body?.version ?? null;
  if (v === expected) ok(`${host} → ${v}`);
  else { bad(`${host} → ${v ?? `unreachable (${r.error || r.status})`} (expected ${expected})`); problems.push(host); }
}

const home = await get(`https://${aliases.primary}/`);
home.status === 200 ? ok(`homepage HTTP ${home.status}`) : (bad(`homepage HTTP ${home.status}`), problems.push('homepage'));

const cfgRes = await get(`https://${aliases.primary}/api/config`, true);
cfgRes.body?.devLogin === false ? ok('devLogin false') : (bad(`devLogin is ${cfgRes.body?.devLogin}`), problems.push('devLogin'));

const tactics = await get(`https://${aliases.primary}/tactics/tactics-board.mjs`);
tactics.status === 404 ? ok('tactics asset HTTP 404 (correctly excluded)') : (bad(`tactics asset HTTP ${tactics.status} — expected 404`), problems.push('tactics'));

// ── 5. report ────────────────────────────────────────────────────────────
h1('release summary');
console.log(`  branch:        ${branch} (${expected})`);
console.log(`  deployment id: ${deploymentId || '(unknown)'}`);
console.log(`  deployment:    ${deploymentUrl}`);
console.log(`  aliases:       ${[aliases.primary, aliases.autoAliased, aliases.manualRepointRequired].join(', ')}`);
console.log(`  version live:  ${expected}`);

if (problems.length) {
  bad(`post-deploy verification failed for: ${problems.join(', ')}`);
  console.log(`\nRollback if needed (see DEPLOY.md): vercel rollback <previous-deployment-url> --yes\n`);
  process.exit(1);
}
console.log('\n  All post-deploy checks passed. No production data was written.\n');
