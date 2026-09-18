/**
 * DEPLOY CHERRY-PICK OUTCOMES — against REAL git repositories.
 *
 * deploy:prepare once treated every failed cherry-pick as a conflict. An EMPTY
 * pick (the change is already in the target) is not a conflict, and a genuine
 * conflict must never be mistaken for one. And a containment claim made by
 * comparing commits must be confirmed against the actual TREE before anything
 * is skipped, because commit-to-commit comparison cannot see a later revert.
 *
 * Each test builds a small throwaway repository in the OS temp directory, so
 * nothing here touches this repository. Deterministic: fixed content, a fixed
 * identity, signing disabled.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { applyCherryPick, changeAlreadyIn } from '../scripts/deploy-lib.mjs';

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-cherry-'));
  const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
  g('init', '-q', '-b', 'main');
  g('config', 'user.name', 'Deploy Test'); g('config', 'user.email', 'deploy@test.local');
  g('config', 'commit.gpgsign', 'false');
  const write = (file, lines) => fs.writeFileSync(path.join(dir, file), lines.join('\n') + '\n');
  const commit = (msg) => { g('add', '-A'); g('commit', '-q', '-m', msg); return g('rev-parse', 'HEAD'); };
  write('a.txt', ['one', 'two', 'three', 'four', 'five']);
  commit('base');
  return { dir, g, write, commit, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const clean = r => r.g('status', '--porcelain') === '';
const picking = r => { try { r.g('rev-parse', '--verify', '--quiet', 'CHERRY_PICK_HEAD'); return true; } catch { return false; } };

// ── applyCherryPick ─────────────────────────────────────────────────────────

test('an unrelated commit applies normally', () => {
  const r = repo();
  try {
    r.g('checkout', '-q', '-b', 'feat');
    r.write('a.txt', ['one', 'two', 'three', 'four', 'FIVE']);
    const f = r.commit('feat: five');
    r.g('checkout', '-q', 'main');
    const before = r.g('rev-list', '--count', 'HEAD');
    assert.deepEqual(applyCherryPick(f, r.dir), { outcome: 'applied' });
    assert.equal(Number(r.g('rev-list', '--count', 'HEAD')), Number(before) + 1, 'one new commit');
    assert.ok(clean(r) && !picking(r));
  } finally { r.cleanup(); }
});

test('an EMPTY pick — the change is already there — is skipped explicitly, not a conflict', () => {
  const r = repo();
  try {
    r.g('checkout', '-q', '-b', 'feat');
    r.write('a.txt', ['one', 'TWO', 'three', 'four', 'five']);
    const f = r.commit('feat: two');
    r.g('checkout', '-q', 'main');
    r.write('a.txt', ['one', 'TWO', 'three', 'four', 'five']);   // production made the identical change
    r.commit('prod: two');
    const head = r.g('rev-parse', 'HEAD');
    assert.deepEqual(applyCherryPick(f, r.dir), { outcome: 'already-present' });
    assert.equal(r.g('rev-parse', 'HEAD'), head, 'no empty commit is created');
    assert.ok(clean(r), 'working tree clean');
    assert.ok(!picking(r), 'no cherry-pick left in progress');
  } finally { r.cleanup(); }
});

test('a GENUINE conflict still stops, is aborted cleanly, and names the file', () => {
  const r = repo();
  try {
    r.g('checkout', '-q', '-b', 'feat');
    r.write('a.txt', ['one', 'two', 'FEATURE', 'four', 'five']);
    const f = r.commit('feat: three');
    r.g('checkout', '-q', 'main');
    r.write('a.txt', ['one', 'two', 'PRODUCTION', 'four', 'five']);
    r.commit('prod: three');
    const head = r.g('rev-parse', 'HEAD');
    const res = applyCherryPick(f, r.dir);
    assert.equal(res.outcome, 'conflict', 'never mistaken for an empty pick');
    assert.deepEqual(res.unmerged, ['a.txt']);
    assert.equal(r.g('rev-parse', 'HEAD'), head);
    assert.ok(clean(r) && !picking(r), 'aborted: nothing half-applied');
  } finally { r.cleanup(); }
});

test('a failure that is not provably empty is a conflict — never a silent skip', () => {
  const r = repo();
  try {
    const res = applyCherryPick('0000000000000000000000000000000000000000', r.dir);
    assert.equal(res.outcome, 'conflict', 'an unknown revision fails CLOSED');
    assert.ok(clean(r) && !picking(r));
  } finally { r.cleanup(); }
});

// ── changeAlreadyIn: the tree has the last word ────────────────────────────

test('tree confirmation: a change production already made is present', () => {
  const r = repo();
  try {
    r.g('checkout', '-q', '-b', 'feat');
    r.write('a.txt', ['one', 'TWO', 'three', 'four', 'five']);
    const f = r.commit('feat: two');
    r.g('checkout', '-q', 'main');
    r.write('a.txt', ['one', 'TWO', 'three', 'FOUR', 'five']);   // same change, plus more
    r.commit('prod: bigger');
    assert.equal(changeAlreadyIn(f, 'main', r.dir), true);
  } finally { r.cleanup(); }
});

test('tree confirmation: a change production made and then REVERTED is NOT present', () => {
  // The case commit-to-commit containment cannot see. The candidate's lines are
  // wholly inside production commit P, but a later production commit Q removed
  // them again. Skipping the candidate would silently drop real work.
  const r = repo();
  try {
    r.g('checkout', '-q', '-b', 'feat');
    r.write('a.txt', ['one', 'two', 'three', 'four', 'five', 'NEEDED']);
    const f = r.commit('feat: needed');
    r.g('checkout', '-q', 'main');
    r.write('a.txt', ['one', 'two', 'three', 'four', 'five', 'NEEDED']);
    r.commit('prod P: add needed');                 // contains the candidate…
    r.write('a.txt', ['one', 'two', 'three', 'four', 'five']);
    r.commit('prod Q: remove needed');              // …then undoes it
    assert.equal(changeAlreadyIn(f, 'main', r.dir), false, 'the tree shows the change is NOT live');
  } finally { r.cleanup(); }
});

test('tree confirmation: an absent change and a conflicting change are both "not present"', () => {
  const r = repo();
  try {
    r.g('checkout', '-q', '-b', 'feat');
    r.write('a.txt', ['one', 'two', 'FEATURE', 'four', 'five']);
    const f = r.commit('feat: three');
    r.g('checkout', '-q', 'main');
    assert.equal(changeAlreadyIn(f, 'main', r.dir), false, 'absent');
    r.write('a.txt', ['one', 'two', 'PRODUCTION', 'four', 'five']);
    r.commit('prod: three');
    assert.equal(changeAlreadyIn(f, 'main', r.dir), false, 'conflicting — not proof, so false');
  } finally { r.cleanup(); }
});

// ── deploy-prepare wiring: the safeguards are actually used ─────────────────

test('deploy:prepare confirms every containment claim against the production TREE', () => {
  const src = fs.readFileSync(new URL('../scripts/deploy-prepare.mjs', import.meta.url), 'utf8');
  assert.match(src, /verdict\.basis === 'contained' && !changeAlreadyIn\(c\.sha, production\)/,
    'a containment claim the tree does not confirm is never skipped');
  const guard = src.slice(src.indexOf("verdict.basis === 'contained'"), src.indexOf("verdict.basis === 'contained'") + 400);
  assert.match(guard, /ambiguous\.push/, 'an unconfirmed claim becomes AMBIGUOUS, which stops the release');
});

test('deploy:prepare skips a proven-empty pick, stops on a conflict, and never ships nothing', () => {
  const src = fs.readFileSync(new URL('../scripts/deploy-prepare.mjs', import.meta.url), 'utf8');
  const loop = src.slice(src.indexOf('for (const c of include) {'), src.indexOf('// ── 6. summary'));
  assert.match(loop, /applyCherryPick\(c\.sha\)/, 'every pick goes through the outcome-aware helper');
  assert.match(loop, /r\.outcome === 'already-present'[\s\S]{0,400}continue;/, 'already-present is skipped, not fatal');
  assert.match(loop, /die\(`cherry-pick of/, 'anything else still stops the release');
  assert.match(loop, /if \(!applied\.length\)[\s\S]{0,300}die\(`nothing to release/, 'an all-empty release is refused');
});
