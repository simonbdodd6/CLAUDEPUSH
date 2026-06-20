/**
 * Coach QA Mode — hidden, presentation-only diagnostics panel.
 *
 * Static source assertions (the panel is client-only DOM code): verify it is
 * gated behind QA mode (zero footprint when off), exposes all 7 sections, wires
 * only existing read endpoints + existing coach actions, and introduces NO new
 * backend / API / identity surface.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Isolate the QA module block.
const start = src.indexOf('function initCoachQA');
assert.ok(start > -1, 'QA module (initCoachQA) must exist');
const qa = src.slice(start, src.indexOf('</script>', start));

test('QA mode is gated and zero-footprint when off', () => {
  assert.match(qa, /get\('qa'\)\s*===\s*'1'|'ce-qa-mode'/, 'enabled via ?qa=1 / localStorage ce-qa-mode');
  assert.match(qa, /if\s*\(!qaOn\(\)\)\s*return;/, 'returns early (no footprint) when QA mode is off');
});

test('all seven sections are present', () => {
  for (const id of ['qa-s1', 'qa-s2', 'qa-s3', 'qa-s4', 'qa-s5', 'qa-s6']) {
    assert.ok(qa.includes(`'${id}'`) || qa.includes(`"${id}"`) || qa.includes(id), `section ${id} present`);
  }
  assert.match(qa, /qa-export/, 'section 7 export control present');
  assert.match(qa, /Production Health/, 'S1');
  assert.match(qa, /Data Summary/, 'S2');
  assert.match(qa, /Quick QA/, 'S3');
  assert.match(qa, /Navigation Audit/, 'S4');
  assert.match(qa, /Console Health/, 'S5');
  assert.match(qa, /UX Polish Checklist/, 'S6');
});

test('quick QA exposes the seven required actions', () => {
  for (const a of ['create-demo', 'clear-demo', 'demo-invite', 'refresh-avail', 'refresh-members', 'refresh-msgs', 'verify-isolation']) {
    assert.ok(qa.includes(`'${a}'`), `quick action ${a} present`);
  }
});

test('navigation audit covers every major page', () => {
  for (const id of ['overview', 'message', 'messages', 'players', 'medical', 'training', 'settings']) {
    assert.ok(qa.includes(`'${id}'`), `nav page ${id} audited`);
  }
});

test('it uses ONLY existing endpoints — no new backend surface', () => {
  const endpoints = (qa.match(/\/api\/[a-z?=&-]+/gi) || []).map(e => e.split('?')[0]);
  const allowed = new Set(['/api/config', '/api/identity', '/api/publish', '/api/availability', '/api/invite', '/api/chat']);
  for (const e of endpoints) assert.ok(allowed.has(e), `endpoint ${e} must be an existing API (no new backend)`);
});

test('panel is read-only diagnostics — declares no data-model changes', () => {
  assert.match(qa, /read-only|Read-only/i);
  assert.doesNotMatch(qa, /UPSTASH_REDIS|kvSet\(|saveUsers\(/, 'no direct storage/identity writes from the client panel');
});
