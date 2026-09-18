/**
 * PLAYER AVAILABILITY SESSION TITLES — the player's cards now use the same name
 * as the coach's.
 *
 * The coach Availability cards and the Live Response Board name a session
 * "Tuesday Training" / "Saturday Match" (availabilitySessionLabel). The player's
 * own cards (availabilityCardV2) still built their title from a separate
 * model.label, "Training · 15 Sep · 19:00", so the two screens named the same
 * session differently.
 *
 * The contract pinned here:
 *   - the player card title IS availabilitySessionLabel(session): one helper,
 *     no second formatter
 *   - it derives from the occurrence's own date and canonical type, never a
 *     stored label, and gives the same weekday in any timezone
 *   - the kick-off time and opponent the old title carried stay on the card
 *     (meta line), so nothing the player could see is lost
 *   - status, answer buttons, the reason picker and the match/training icon
 *     are unchanged.
 *
 * Expected weekdays were checked independently (Python datetime).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let body = src.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}

// The real card, the real helper, the real icon; only trivial leaf helpers stubbed.
const SANDBOX = `
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  ${fn('statusLabel')}
  const REASON_LABELS = { injury:'Injury', work:'Work', holiday:'Holiday', family:'Family', other:'Other' };
  let _availReasonOpenByKey = {};
  function sessionKey(id){ return 'avail_' + id; }
  function availabilityPendingFor(){ return null; }
  ${fn('sessionTypeIcon')}
  ${fn('availabilitySessionLabel')}
  ${fn('availabilityCardModel')}
  ${fn('availabilityCardV2')}
  return { label: availabilitySessionLabel, model: availabilityCardModel, card: availabilityCardV2, icon: sessionTypeIcon,
           openReason: k => { _availReasonOpenByKey = { [k]: true }; } };
`;
const api = new Function(SANDBOX)();

const training = (date, extra = {}) => ({ id: `slot_tue-${date.replace(/-/g, '')}`, type: 'training', legacy: false,
  date, time: '19:00', title: 'Training', venue: '', sourceId: 'slot_tue', ...extra });
const match = (date, extra = {}) => ({ id: 'fx_abc123', type: 'match', legacy: false,
  date, time: '15:00', title: 'Match', opponent: 'Kituro', venue: '', sourceId: 'fx_abc123', ...extra });

function render(session, player = {}) {
  return api.card(api.model(player, session), session);
}
const titleOf = html => {
  const m = /<div class="avail-player-card-title">[\s\S]*?<span class="session-icon">[\s\S]*?<\/span>\s*<span>([^<]*)<\/span>/.exec(html);
  assert.ok(m, 'card title found');
  return m[1];
};
const iconOf = html => /<span class="session-icon">([\s\S]*?)<\/span>\s*<span>/.exec(html)[1];
const metaOf = html => (/<div class="avail-player-card-meta">([^<]*)<\/div>/.exec(html) || [])[1] || '';

test('1. training on a Tuesday reads "Tuesday Training"', () => {
  assert.equal(titleOf(render(training('2026-09-15'))), 'Tuesday Training');
});

test('2. a match on a Tuesday reads "Tuesday Match"', () => {
  assert.equal(titleOf(render(match('2026-09-15'))), 'Tuesday Match');
});

test('3. a stale or raw stored label never reaches the title', () => {
  const s = training('2026-09-17', { title: 'Training · 15 Sep · 19:00', label: '2026-09-15' });
  const html = render(s);
  assert.equal(titleOf(html), 'Thursday Training', 'from the occurrence date + type, not the stored text');
  assert.equal(Object.hasOwn(api.model({}, s), 'label'), false, 'the card model no longer carries a second title');
});

test('4. the weekday is the same in every timezone', () => {
  // The whole card is rendered in a fresh process per zone: the process TZ is
  // fixed at start-up, so it cannot be switched inside this one.
  const code = `const api = new Function(process.env.CARD_SANDBOX)();
    const s = { id: 'x', type: 'training', title: 'Training', date: '2026-09-15', time: '23:30' };
    const m = { id: 'y', type: 'match', title: 'Match', date: '2026-09-20', time: '00:15' };
    const t = h => /<span class="session-icon">[\\s\\S]*?<\\/span>\\s*<span>([^<]*)<\\/span>/.exec(h)[1];
    process.stdout.write(JSON.stringify([t(api.card(api.model({}, s), s)), t(api.card(api.model({}, m), m))]));`;
  for (const TZ of ['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Europe/Brussels', 'America/Los_Angeles']) {
    const r = spawnSync(process.execPath, ['-e', code], { env: { ...process.env, TZ, CARD_SANDBOX: SANDBOX }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), ['Tuesday Training', 'Sunday Match'], TZ);
  }
});

test('5. coach and player name the same session identically', () => {
  // The coach cards call a local alias that is exactly the shared helper…
  assert.match(src, /const sessionDisplayTitle = session => availabilitySessionLabel\(session\);/);
  assert.match(src, /<strong><span style="margin-right:5px">\$\{icon\}<\/span>\$\{esc\(sessionDisplayTitle\(session\)\)\}<\/strong>/);
  // …and the player card calls it directly.
  assert.match(fn('availabilityCardV2'), /const title = availabilitySessionLabel\(session\);/);
  for (const s of [training('2026-09-15'), training('2026-09-17'), match('2026-09-19'), match('2026-09-20')]) {
    assert.equal(titleOf(render(s)), api.label(s), s.date);
  }
});

test('6. the kick-off time stays on the card, with the opponent', () => {
  assert.equal(metaOf(render(training('2026-09-15'))), '2026-09-15 · 19:00');
  assert.equal(metaOf(render(match('2026-09-19'))), '2026-09-19 · 15:00 · Kituro');
  assert.equal(metaOf(render(training('2026-09-15', { time: '' }))), '2026-09-15', 'no time → nothing invented');
});

test('6b. the undated legacy match keeps its old name', () => {
  const legacy = { id: 'game', type: 'match', legacy: true, date: '', time: '', title: 'Match', opponent: '', venue: '', sourceId: 'game' };
  const html = render(legacy);
  assert.equal(titleOf(html), 'Match');
  assert.equal(metaOf(html), '');
});

test('7. status, answer buttons and the reason picker are unchanged', () => {
  const s = training('2026-09-15');
  const key = `avail_${s.id}`;
  const html = render(s, { [key]: 'unavailable', [`${key}Reason`]: 'work' });
  for (const v of ['available', 'maybe', 'unavailable']) {
    assert.ok(html.includes(`availabilityV2SetStatus('${key}','${v}')`), v);
  }
  assert.match(html, />Unavailable<\/span>/, 'status chip');
  assert.match(html, /Reason: <strong>Work<\/strong>/);
  const model = api.model({ [key]: 'injured' }, s);
  assert.deepEqual([model.key, model.status, model.pending], [key, 'unavailable', false]);
  api.openReason(key);
  assert.match(render(s, { [key]: 'maybe' }), /availabilityV2SetReason\('avail_slot_tue-20260915','maybe','injury'\)/);
});

test('8. match and training keep their own icons', () => {
  assert.equal(iconOf(render(match('2026-09-15'))), api.icon('match'));
  assert.equal(iconOf(render(training('2026-09-15'))), api.icon('training'));
  assert.notEqual(api.icon('match'), api.icon('training'));
});
