/**
 * Brain package provenance: the copied reasoning code is byte-identical to its source.
 *
 * packages/ holds copies of the Brain's PURE reasoning packages — the complete static import closure of
 * the Brain draft (runBrainDryRun, the coach-intelligence pipelines and readiness chain) and the Coach
 * DNA chain (M108 model, M112 synthesis, M113 DNA signals, M114 DNA profile, M230 Coach View): since
 * Build 118, 77 files across brain-decision-planner, coach-core-adapter, coach-intelligence and
 * coach-memory. They are never edited in Core: a change lands in the
 * Brain repository first and is re-copied with a new manifest. This suite makes an independent edit
 * impossible to miss — every copied file is compared, byte for byte, against the blob at the exact
 * Brain commit recorded in packages/BRAIN_PROVENANCE.json (the Brain repository is a worktree of this
 * same git repository, so that commit is reachable here), AND against the manifest's sha256. A
 * mismatch names the source commit, the copied path and the first differing byte.
 *
 * It also pins the deployment protections for that source: packages/ IS uploaded (.vercelignore — the
 * Brain draft imports it at runtime) and every /packages/* URL is denied at the edge (vercel.json →
 * /404.html), so the bundle can read the source and the public web cannot; and it pins the ONLY Core code that
 * may reach into packages/ — the Brain provider, loaded dynamically behind the Brain draft's gates.
 */

/** Source with block and line comments removed — the purity rules are about executable code, not prose. */
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST_PATH = 'packages/BRAIN_PROVENANCE.json';
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST_PATH), 'utf8'));

function git(args, opts = {}) {
  return spawnSync('git', ['-C', ROOT, ...args], { encoding: opts.buffer ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
function listCopiedFiles() {
  const out = [];
  const walk = dir => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (rel !== MANIFEST_PATH) out.push(rel);
    }
  };
  walk('packages');
  return out.sort();
}
function firstDifference(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

test('the manifest names a real Brain commit and lists every copied file exactly once', () => {
  assert.equal(manifest.type, 'brain-package-provenance');
  assert.match(manifest.source.commit, /^[0-9a-f]{40}$/, 'source commit must be a full sha');
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0);
  assert.equal(manifest.fileCount, manifest.files.length);
  const listed = manifest.files.map(f => f.destinationPath).sort();
  assert.deepEqual(listed, [...new Set(listed)], 'no file is listed twice');
  // every file on disk is in the manifest and every manifest entry is on disk — nothing unaccounted for
  assert.deepEqual(listCopiedFiles(), listed, 'packages/ must contain exactly the manifest\'s files (plus the manifest)');
  for (const f of manifest.files) {
    assert.equal(f.sourcePath, f.destinationPath, 'paths mirror the Brain layout');
    assert.match(f.sha256, /^[0-9a-f]{64}$/);
    assert.match(f.gitBlob, /^[0-9a-f]{40}$/);
  }
});

test('the Brain source commit is reachable from this repository (shared object store)', () => {
  const r = git(['cat-file', '-t', manifest.source.commit]);
  assert.equal(r.stdout.trim(), 'commit',
    `Brain commit ${manifest.source.commit} is not in this repository's object store. The Brain branch ` +
    '(feature/coaches-eye-intelligence-brain) must be fetched before this suite can verify provenance; ' +
    'it is deliberately NOT skipped.');
  const subject = git(['log', '-1', '--format=%s', manifest.source.commit]).stdout.trim();
  assert.equal(subject, manifest.source.commitSubject);
});

test('every copied file is byte-identical to the blob at the Brain source commit', () => {
  const mismatches = [];
  for (const f of manifest.files) {
    const expected = git(['show', `${manifest.source.commit}:${f.sourcePath}`], { buffer: true });
    assert.equal(expected.status, 0, `source blob missing at ${manifest.source.commit.slice(0, 8)}:${f.sourcePath}`);
    const actual = fs.readFileSync(path.join(ROOT, f.destinationPath));
    const at = firstDifference(actual, expected.stdout);
    if (at !== -1) {
      mismatches.push(`${f.destinationPath}: differs from Brain ${manifest.source.commit.slice(0, 8)}:${f.sourcePath} at byte ${at} ` +
        `(copied ${actual.length} bytes, source ${expected.stdout.length} bytes)`);
    }
    // and the blob id recorded at copy time is still the blob at that commit
    const blob = git(['rev-parse', `${manifest.source.commit}:${f.sourcePath}`]).stdout.trim();
    assert.equal(blob, f.gitBlob, `${f.sourcePath}: recorded git blob changed`);
  }
  assert.deepEqual(mismatches, [], `copied Brain files were edited independently:\n${mismatches.join('\n')}`);
});

test('every copied file matches its recorded sha256 and byte length', () => {
  for (const f of manifest.files) {
    const bytes = fs.readFileSync(path.join(ROOT, f.destinationPath));
    assert.equal(bytes.length, f.bytes, `${f.destinationPath}: length changed`);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), f.sha256, `${f.destinationPath}: sha256 changed`);
  }
});

test('the copied set is exactly the pure reasoning code: self-contained, no environment, no I/O', () => {
  const js = manifest.files.map(f => f.destinationPath).filter(p => p.endsWith('.js'));
  assert.ok(js.length >= 5);
  const copied = new Set(js);
  for (const p of js) {
    const code = codeOnly(fs.readFileSync(path.join(ROOT, p), 'utf8'));
    // every executable import — static, re-export or dynamic — is RELATIVE and resolves to a copied file
    const specs = [
      ...[...code.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/gm)].map(m => m[1]),
      ...[...code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)].map(m => m[1]),
      ...[...code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]),
    ];
    assert.ok(!/\bimport\(\s*[^'"\s]/.test(code), `${p} has a computed dynamic import`);
    for (const spec of specs) {
      assert.ok(spec.startsWith('./') || spec.startsWith('../'), `${p} imports "${spec}" — copied Brain code may only import other copied files`);
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(p), spec));
      const resolved = [target, `${target}.js`, `${target}/index.js`].find(c => copied.has(c));
      assert.ok(resolved, `${p} imports "${spec}" (${target}) which is not in the copied set`);
    }
    for (const forbidden of ['process.env', 'require(', 'fetch(', "from 'node:", 'Math.random', 'Date.now', 'new Date(']) {
      assert.ok(!code.includes(forbidden), `${p} contains "${forbidden}" in executable code — not pure reasoning code`);
    }
  }
  // the entry points this staging integration exists for are present
  for (const p of ['packages/coach-memory/model.js', 'packages/coach-memory/dna-signals.js', 'packages/coach-memory/dna-profile.js', 'packages/coach-memory/synthesis.js', 'packages/coach-intelligence/coach-dna-coach-view.js',
    'packages/brain-decision-planner/brain-dry-run-harness.js', 'packages/coach-intelligence/index.js', 'packages/coach-core-adapter/position-normalization.js']) {
    assert.ok(manifest.files.some(f => f.destinationPath === p), `${p} must be in the copied set`);
  }
  // and nothing from the Brain's Core-coupled or deployment layers came with it
  for (const p of listCopiedFiles()) {
    assert.ok(!/^packages\/.*\/(api|web|app|qa)\//.test(p) && !/_brainProviders|brain-draft|_brainFlags|vercel\.json|package\.json$/.test(p), `${p} is not pure reasoning code`);
  }
});

test('the copied Brain source IS uploaded (the Brain draft imports it at runtime) — and only it', (t) => {
  const vercelIgnore = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8');
  assert.match(vercelIgnore, /^!\/packages$/m, '.vercelignore must re-include /packages explicitly');
  assert.ok(!/^\/?packages\/?$/m.test(vercelIgnore), 'no later rule may exclude packages/ again');
  // Ask git — the same matcher Vercel's ignore syntax follows — in a throwaway repo (no .gitignore influence).
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'b119-vercelignore-'));
  try {
    if (spawnSync('git', ['init', '-q', dir]).status !== 0) return t.skip('git unavailable');
    fs.writeFileSync(path.join(dir, '.gitignore'), vercelIgnore);
    const probe = [...manifest.files.map(f => f.destinationPath), MANIFEST_PATH];
    const res = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], { cwd: dir, input: probe.join('\n'), encoding: 'utf8' });
    assert.ok(res.status === 0 || res.status === 1, res.stderr);
    const excluded = new Set(res.stdout.split('\n').map(s => s.trim()).filter(Boolean));
    for (const p of probe) assert.ok(!excluded.has(p), `${p} would NOT be uploaded — the Brain draft could not load it`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('every uploaded Brain file is unreachable over HTTP: /packages/* resolves to the 404 page', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  // the same path-to-regexp subset the edge uses for these deny rules: ":name(regex)" is a capture group
  const compile = source => new RegExp('^' + source.replace(/:([A-Za-z0-9_]+)\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g, '($2)').replace(/\//g, '\\/') + '$');
  const denied = urlPath => vercel.redirects.some(r => r.destination === '/404.html' && compile(r.source).test(urlPath));
  for (const f of [...manifest.files.map(f => f.destinationPath), MANIFEST_PATH]) {
    for (const suffix of ['', '?raw=1', '#x']) assert.ok(denied(`/${f}${suffix}`), `/${f}${suffix} would be downloadable`);
  }
  for (const p of ['/packages/', '/packages/coach-memory/', '/packages/does-not-exist.js']) assert.ok(denied(p), `${p} is not denied`);
  // and the deny rule does not swallow anything the app needs
  for (const p of ['/', '/index.html', '/api/publish', '/api/brain-draft', '/src/chat-state.js']) assert.ok(!denied(p), `${p} must stay reachable`);
});

test('/packages/* is denied at the edge, exactly like /api/*.js, and the existing protections are intact', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const sources = vercel.redirects.map(r => r.source);
  assert.ok(sources.includes('/api/:file(.*\\.js.*)'), 'the /api/*.js block must remain');
  assert.ok(sources.includes('/:file(build-inject\\.js.*)') && sources.includes('/:file(vercel\\.json.*)'));
  const rule = vercel.redirects.find(r => r.source === '/packages/:file(.*)');
  assert.deepEqual(rule, { source: '/packages/:file(.*)', destination: '/404.html', permanent: false });
  for (const r of vercel.redirects) assert.equal(r.destination, '/404.html', `${r.source} must deny, not route`);
  // exactly ONE Brain route: the friendly rewrite onto the publish function — never a function of its own
  const brainRewrites = (vercel.rewrites || []).filter(r => JSON.stringify(r).includes('brain'));
  assert.deepEqual(brainRewrites, [{ source: '/api/brain-draft', destination: '/api/publish?resource=brain-draft' }]);
  assert.ok(!JSON.stringify({ ...vercel, rewrites: [] }).includes('brain'), 'no other vercel.json entry mentions the Brain');
  const fns = fs.readdirSync(path.join(ROOT, 'api')).filter(f => f.endsWith('.js') && !f.startsWith('_'));
  assert.equal(fns.length, 12);
  assert.ok(!fns.some(f => /brain/i.test(f)), 'no standalone Brain function');
  // ONLY the Brain provider reaches into packages/; everything else in api/ stays clear of it
  for (const f of fs.readdirSync(path.join(ROOT, 'api')).filter(f => f.endsWith('.js'))) {
    const reaches = fs.readFileSync(path.join(ROOT, 'api', f), 'utf8').includes('../packages/');
    assert.equal(reaches, f === '_brainProviders.js', `api/${f} ${reaches ? 'must not' : 'should'} import packages/`);
  }
});
