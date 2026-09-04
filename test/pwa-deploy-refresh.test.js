/**
 * BUILD AG — EVERY DEPLOY REACHES INSTALLED PWAs.
 *
 * The service worker never caches the app shell, but its ONLY refresh lever
 * for long-lived installed pages is a changed SW_VERSION: the new worker
 * installs (skipWaiting), claims the windows, and navigates each one once.
 * That lever was manual — SW_VERSION sat at '20260816.1' through ~13
 * production deploys, so installed PWAs could run weeks-old bundles forever
 * (Build AF: the most plausible cause of the "0 blocks · Draft" and
 * "can't see the team" field reports).
 *
 * build-inject.js — which already stamps _BUILD_INFO into index.html at
 * Vercel build time — now stamps SW_VERSION with the deploy identity too.
 * Every deploy pulls the existing lever; nothing about the worker's
 * mechanism, caches or data changes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const swSource = await readFile(join(ROOT, 'sw.js'), 'utf8');

/** Run the real build-inject.js in a scratch dir with a chosen deploy identity. */
async function buildWith(env) {
  const dir = await mkdtemp(join(tmpdir(), 'ce-pwa-'));
  await writeFile(join(dir, 'index.html'),
    'const _BUILD_INFO = {"sha":"DEV","env":"local","branch":"local","time":"t"};\n');
  await copyFile(join(ROOT, 'sw.js'), join(dir, 'sw.js'));
  execFileSync(process.execPath, [join(ROOT, 'build-inject.js')], {
    cwd: dir, env: { ...process.env, ...env },
  });
  return {
    sw: await readFile(join(dir, 'sw.js'), 'utf8'),
    index: await readFile(join(dir, 'index.html'), 'utf8'),
  };
}
const versionOf = sw => (sw.match(/const SW_VERSION = '([^']*)';/) || [])[1];

test('a deployment stamps the service worker with its own identity', async () => {
  const { sw, index } = await buildWith({ VERCEL_GIT_COMMIT_SHA: 'abc1234def', VERCEL_ENV: 'production' });
  const v = versionOf(sw);
  assert.ok(v, 'SW_VERSION survives as a parseable constant');
  assert.notEqual(v, '20260816.1', 'no longer the hand-written August date');
  assert.match(v, /^abc1234/, 'the deploy SHA is the identity');
  assert.match(index, /"sha":"abc1234"/, 'and index.html got its usual stamp');
});

test('two distinct deployments produce two distinct versions', async () => {
  const a = await buildWith({ VERCEL_GIT_COMMIT_SHA: 'aaaaaaa1111', VERCEL_ENV: 'production' });
  const b = await buildWith({ VERCEL_GIT_COMMIT_SHA: 'bbbbbbb2222', VERCEL_ENV: 'production' });
  assert.notEqual(versionOf(a.sw), versionOf(b.sw));
});

test('re-deploying the SAME sha still bumps the version — the lever always pulls', async () => {
  const a = await buildWith({ VERCEL_GIT_COMMIT_SHA: 'ccccccc3333', VERCEL_ENV: 'production' });
  const b = await buildWith({ VERCEL_GIT_COMMIT_SHA: 'ccccccc3333', VERCEL_ENV: 'production' });
  assert.notEqual(versionOf(a.sw), versionOf(b.sw), 'the build time keeps redeploys distinct');
});

test('the stamp is re-runnable — a stamped worker can be stamped again', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ce-pwa-'));
  await writeFile(join(dir, 'index.html'),
    'const _BUILD_INFO = {"sha":"DEV","env":"local","branch":"local","time":"t"};\n');
  await copyFile(join(ROOT, 'sw.js'), join(dir, 'sw.js'));
  execFileSync(process.execPath, [join(ROOT, 'build-inject.js')],
    { cwd: dir, env: { ...process.env, VERCEL_GIT_COMMIT_SHA: 'ddddddd4444' } });
  execFileSync(process.execPath, [join(ROOT, 'build-inject.js')],
    { cwd: dir, env: { ...process.env, VERCEL_GIT_COMMIT_SHA: 'eeeeeee5555' } });
  const sw = await readFile(join(dir, 'sw.js'), 'utf8');
  assert.match(versionOf(sw), /^eeeeeee/, 'the second stamp replaced the first cleanly');
  assert.equal((sw.match(/const SW_VERSION/g) || []).length, 1, 'still exactly one declaration');
});

test('the worker\'s update mechanism and safety posture are unchanged', () => {
  // The lever the stamp pulls: install → skipWaiting, activate → claim +
  // one-time window refresh. Still there, still the ONLY refresh path.
  assert.match(swSource, /self\.skipWaiting\(\)/);
  assert.match(swSource, /clients\.claim\(\)/);
  assert.match(swSource, /matchAll\(\{ type: 'window' \}\)/);
  assert.match(swSource, /w\.navigate\(w\.url\)/, 'the one-time refresh of open windows');
  // Safety: the worker still caches NO shell and touches no app data.
  assert.ok(!/addEventListener\('fetch'/.test(swSource), 'no fetch interception — the shell is never cached');
  assert.ok(!/localStorage|indexedDB|sessionStorage/.test(swSource), 'no application data is touched');
  const cacheOpens = swSource.match(/caches\.open\(([^)]*)\)/g) || [];
  assert.ok(cacheOpens.every(c => c.includes('LOG_CACHE')),
    'the only cache is the push-diagnostics log — nothing else is created or deleted');
  assert.ok(!/caches\.delete\(/.test(swSource.replace(/cache\.delete\(LOG_KEY\)/, '')),
    'no cache wiped beyond the worker\'s own log entry');
});

test('the deployed pair moves together — index stamp implies worker stamp', async () => {
  // The regression this build exists to prevent: index.html carrying a new
  // build while sw.js still announces August. One build, one identity.
  const { sw, index } = await buildWith({ VERCEL_GIT_COMMIT_SHA: 'fffffff6666', VERCEL_ENV: 'production' });
  const indexSha = (index.match(/"sha":"([^"]+)"/) || [])[1];
  assert.equal(indexSha, 'fffffff');
  assert.match(versionOf(sw), new RegExp('^' + indexSha), 'the worker names the same deploy');
});
