// H2 — production must not serve server-side source.
//
// vercel.json sets "outputDirectory": ".", so the repository root is the site:
// every uploaded file is also reachable as a static asset. Production was
// returning api/_identityStore.js, api/invite.js, test/**, lib/** and the
// internal markdown as raw source, byte-for-byte.
//
// Two mechanisms close that, and both are asserted here against the real
// artefacts rather than a mock:
//   1. .vercelignore decides what is UPLOADED. Not uploaded => cannot be
//      served. Checked with git's own ignore matcher, not a re-implementation.
//   2. api/** must stay uploaded (Vercel builds the functions from it), so
//      vercel.json refuses to SERVE /api/*.js as a file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const vercelConfig = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
const vercelIgnore = readFileSync(join(ROOT, '.vercelignore'), 'utf8');

/**
 * Ask git — the same matcher Vercel's ignore syntax follows — which of these
 * paths .vercelignore excludes. A throwaway repo is used so the project's own
 * .gitignore cannot influence the answer. Paths need not exist (--no-index).
 */
function uploadDecision(paths) {
  const dir = mkdtempSync(join(tmpdir(), 'h2-vercelignore-'));
  try {
    const init = spawnSync('git', ['init', '-q', dir], { encoding: 'utf8' });
    if (init.status !== 0) return null; // git unavailable — caller skips
    writeFileSync(join(dir, '.gitignore'), vercelIgnore);
    const res = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {
      cwd: dir, input: paths.join('\n'), encoding: 'utf8',
    });
    // exit 0 = some ignored, 1 = none ignored; anything else is a real error.
    assert.ok(res.status === 0 || res.status === 1, `git check-ignore failed: ${res.stderr}`);
    const excluded = new Set(res.stdout.split('\n').map(s => s.trim()).filter(Boolean));
    return new Map(paths.map(p => [p, excluded.has(p) ? 'excluded' : 'uploaded']));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Compile a vercel.json `source` to the regex the edge network matches on.
 * Supports the path-to-regexp subset used here: ":name(regex)" is a capture
 * group, every other character is literal.
 */
function compileSource(source) {
  let out = '', i = 0;
  while (i < source.length) {
    const m = /^:([A-Za-z0-9_]+)\(/.exec(source.slice(i));
    if (m) {
      let depth = 1, j = i + m[0].length, pat = '';
      while (j < source.length) {
        const c = source[j];
        if (c === '(') depth++;
        else if (c === ')' && --depth === 0) break;
        pat += c; j++;
      }
      out += `(${pat})`;
      i = j + 1;
    } else {
      out += source[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }
  return new RegExp(`^${out}$`);
}

const redirectMatchers = (vercelConfig.redirects || []).map(r => ({
  ...r, re: compileSource(r.source),
}));
const isBlocked = path => redirectMatchers.some(r => r.re.test(path));

const apiFiles = readdirSync(join(ROOT, 'api')).filter(f => f.endsWith('.js'));

// ---------------------------------------------------------------------------
// 1. Server source cannot be served as a public static resource
// ---------------------------------------------------------------------------

test('H2-1: every server module in api/ is refused as a static file', () => {
  assert.ok(apiFiles.length >= 20, `expected the real api/ directory, saw ${apiFiles.length} files`);
  const served = apiFiles.filter(f => !isBlocked(`/api/${f}`));
  assert.deepEqual(served, [], `these would still download as source: ${served.join(', ')}`);
});

test('H2-2b: a trailing slash or dot-segment does not walk around the block', () => {
  // Production served /api/invite.js in full for a trailing slash: the edge
  // network resolved the path to the file while "/api/:file(.*\\.js)" — which
  // ends at the extension — did not match it. Anything containing .js under
  // api/ must be refused however the path is decorated.
  for (const suffix of ['/', '/./', '//', '/x/..']) {
    for (const f of ['invite.js', '_identityStore.js', '_keys.js', '_security.js']) {
      assert.ok(isBlocked(`/api/${f}${suffix}`),
        `/api/${f}${suffix} walks around the block`);
    }
  }
  for (const p of ['/build-inject.js/', '/vercel.json/', '/build-inject.js/./', '/vercel.json//']) {
    assert.ok(isBlocked(p), `${p} walks around the block`);
  }
});

test('H2-2: the block is a pattern over api/, not a list of known filenames', () => {
  // A module added tomorrow must be covered without touching vercel.json.
  for (const invented of ['/api/_futureStore.js', '/api/_secrets.js', '/api/brand-new.js']) {
    assert.ok(isBlocked(invented), `${invented} would be downloadable`);
  }
});

test('H2-3: the modules named in the audit are specifically covered', () => {
  for (const f of ['invite.js', 'identity.js', '_identityStore.js', '_inviteStore.js',
                   '_keys.js', '_security.js', 'publish.js', '_permissions.js',
                   '_structureStore.js', '_kv.js', '_tenant.js', '_accessScope.js']) {
    assert.ok(apiFiles.includes(f), `${f} missing from api/ — test is stale`);
    assert.ok(isBlocked(`/api/${f}`), `/api/${f} is still downloadable`);
  }
});

test('H2-4: build and configuration files are not served', () => {
  for (const p of ['/build-inject.js', '/vercel.json']) {
    assert.ok(isBlocked(p), `${p} is still downloadable`);
  }
});

// ---------------------------------------------------------------------------
// 2. Internal source is not even uploaded
// ---------------------------------------------------------------------------

test('H2-5: internal source and documents are excluded from the deployment', (t) => {
  const internal = [
    'test/deployment-source-exposure.test.js',
    'test/invite-tenant-isolation.test.js',
    'lib/identity-platform/index.js',
    'qa/discovery/discovery.js',
    'scripts/backfill-player-groups.js',
    'dashboard/dashboard-cli.js',
    'orchestrator/orchestrator-cli.js',
    'brain/index.js',
    'app/api-server.js',
    'platform/index.js',
    'docs/index.md',
    'DEPLOY.md', 'README.md', 'SECURITY_FIXES.md', 'PRODUCTION_AUDIT.md',
    'KNOWN_ISSUES.md', 'AUTH_NOTES.md', 'PERMISSIONS.md',
    '.env.local', '.env.example', 'playwright.config.js',
    'api/mission-control.js', 'mission-control/index.js',
    // internal files that sit inside directories the browser does need
    'performance/README.md', 'performance/docs/core-integration.md',
    'performance/docs/athlete-profile.md', 'brand/README.md',
    'season-intelligence/season-api.js', 'season-intelligence/season-cli.js',
  ];
  const decision = uploadDecision(internal);
  if (!decision) return t.skip('git unavailable');
  const leaked = internal.filter(p => decision.get(p) !== 'excluded');
  assert.deepEqual(leaked, [], `would be uploaded and therefore public: ${leaked.join(', ')}`);
});

test('H2-6: .vercelignore is an allow-list, so new files are private by default', (t) => {
  const decision = uploadDecision([
    'NEW_STRATEGY_DOC.md',
    'internal-notes.txt',
    'some-new-engine/secrets.js',
    'backup/index.html.bak',
    'index.html.map',
  ]);
  if (!decision) return t.skip('git unavailable');
  for (const [path, verdict] of decision) {
    assert.equal(verdict, 'excluded', `${path} would be published without anyone opting in`);
  }
  assert.match(vercelIgnore, /^\/\*$/m, '.vercelignore must start from "exclude everything"');
});

// ---------------------------------------------------------------------------
// 3. The app and its build still work
// ---------------------------------------------------------------------------

test('H2-7: everything the browser loads is still uploaded', (t) => {
  const required = [
    'index.html', 'sw.js', 'manifest.json', '404.html',
    'privacy.html', 'terms.html', 'robots.txt', 'icon.svg',
    'brand/logo.svg',
    // ES modules index.html imports at runtime
    'performance/services/workout-runtime.js',
    'performance/services/exercise-catalogue.js',
    'season-intelligence/match-readiness.js',
    'season-intelligence/weekly-brief.js',
    'src/chat-state.js', 'src/fixture-import.js', 'src/xlsx-read.js',
    // modules api/*.js imports across directory boundaries
    'performance/domain/authoring-profile.js',
    'src/chat-notifications.js',
  ];
  const decision = uploadDecision(required);
  if (!decision) return t.skip('git unavailable');
  const missing = required.filter(p => decision.get(p) !== 'uploaded');
  assert.deepEqual(missing, [], `the app would 404 on: ${missing.join(', ')}`);
});

test('H2-8: functions and the build still have their sources', (t) => {
  const required = [
    ...apiFiles.filter(f => f !== 'mission-control.js').map(f => `api/${f}`),
    'package.json', 'package-lock.json', 'build-inject.js', 'vercel.json',
  ];
  const decision = uploadDecision(required);
  if (!decision) return t.skip('git unavailable');
  const missing = required.filter(p => decision.get(p) !== 'uploaded');
  assert.deepEqual(missing, [], `the deployment would fail to build: ${missing.join(', ')}`);
});

// ---------------------------------------------------------------------------
// 4. Legitimate API routes are untouched
// ---------------------------------------------------------------------------

test('H2-9: function routes still resolve — the block is extension-scoped', () => {
  const routes = apiFiles.map(f => `/api/${f.replace(/\.js$/, '')}`);
  const broken = routes.filter(isBlocked);
  assert.deepEqual(broken, [], `these live endpoints would break: ${broken.join(', ')}`);
  // and the ones the client actually calls, spelled out
  for (const p of ['/api/config', '/api/identity', '/api/invite', '/api/publish',
                   '/api/chat', '/api/availability', '/api/push', '/api/subscribe',
                   '/api/schedules', '/api/templates', '/api/cron']) {
    assert.ok(!isBlocked(p), `${p} would be redirected away`);
  }
});

test('H2-10: existing rewrites still reach their destinations', () => {
  const sources = vercelConfig.rewrites.map(r => r.source);
  assert.deepEqual(sources, ['/terms', '/privacy', '/api/roster', '/api/reminder']);
  for (const r of vercelConfig.rewrites) {
    assert.ok(!isBlocked(r.source), `${r.source} is intercepted before its rewrite`);
    assert.ok(!isBlocked(r.destination.split('?')[0]),
      `${r.destination} — the rewrite target itself is blocked`);
  }
  for (const c of vercelConfig.crons) {
    assert.ok(!isBlocked(c.path.split('?')[0]), `cron ${c.path} would stop firing`);
  }
});

test('H2-11: no new public route was introduced', () => {
  // Every redirect must send traffic to the branded 404 page and nowhere else.
  for (const r of vercelConfig.redirects) {
    assert.equal(r.destination, '/404.html', `${r.source} redirects somewhere unexpected`);
    assert.equal(r.permanent, false, `${r.source} must not be cached as permanent`);
    assert.ok(!/^https?:/i.test(r.destination), 'redirects must stay on this origin');
  }
  // The site's own pages must not be caught by any of them.
  for (const p of ['/', '/index.html', '/sw.js', '/manifest.json', '/404.html',
                   '/privacy', '/terms', '/robots.txt', '/icon.svg',
                   '/brand/logo.svg', '/performance/services/workout-runtime.js',
                   '/season-intelligence/match-readiness.js', '/src/chat-state.js']) {
    assert.ok(!isBlocked(p), `${p} would no longer load`);
  }
});

// ---------------------------------------------------------------------------
// 5. Existing security posture unchanged
// ---------------------------------------------------------------------------

test('H2-12: security headers and output directory are unchanged', () => {
  assert.equal(vercelConfig.outputDirectory, '.');
  const global = vercelConfig.headers.find(h => h.source === '/(.*)');
  const byKey = Object.fromEntries(global.headers.map(h => [h.key, h.value]));
  assert.equal(byKey['X-Frame-Options'], 'DENY');
  assert.equal(byKey['X-Content-Type-Options'], 'nosniff');
  assert.equal(byKey['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.match(byKey['Strict-Transport-Security'], /max-age=63072000/);
  assert.match(byKey['Content-Security-Policy'], /default-src 'self'/);
  assert.match(byKey['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(byKey['Permissions-Policy'], /geolocation=\(\)/);
  assert.equal(vercelConfig.headers.length, 3, 'sw.js / manifest.json header rules must survive');
  assert.equal(vercelConfig.crons.length, 25);
});
