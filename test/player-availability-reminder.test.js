/**
 * INDIVIDUAL PLAYER AVAILABILITY REMINDER
 *
 * A coach could chase a whole squad because one player had not replied. This
 * adds "Request availability this week" to that player's profile — one player,
 * one reminder.
 *
 * NOTHING NEW WAS BUILT UNDERNEATH IT. The week is state.schedule, the week the
 * board renders and the group chase chases. "Answered" is sessionRows(), the
 * canonical server-first resolver. Delivery is /api/push and /api/chat, the
 * paths the group request already uses. The only server change is that the
 * push endpoint now understands audience 'individual' — and REFUSES to carry it
 * without a durable id, so a reminder meant for one player cannot widen into a
 * broadcast because an id came through blank.
 *
 * AVAILABILITY IS NOT ATTENDANCE. Everything here counts REPLIES to requests.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.avail-reminder.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.VAPID_PUBLIC_KEY         = 'BJBP7tIsM_67yBKMl3kJwlC65yH8pwa_r7uVHOSqWKwyW5ftB1Jdj1SPmU4_G0Eeti-JZ6uQ7bpvQW8xwMiMWM8';
process.env.VAPID_PRIVATE_KEY        = 'x'.repeat(43);
process.env.VAPID_SUBJECT            = 'mailto:test@coacheasier.test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  let start = source.indexOf('    function ' + name + '(');
  if (start === -1) start = source.indexOf('    async function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
  let i = source.indexOf('(', start), paren = 0;
  for (; i < source.length; i++) {
    if (source[i] === '(') paren++;
    else if (source[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = source.indexOf('{', i), depth = 0;
  for (let k = brace; k < source.length; k++) {
    if (source[k] === '{') depth++;
    else if (source[k] === '}') { depth--; if (!depth) return source.slice(start, k + 1); }
  }
  throw new Error('function ' + name + ' — no closing brace');
}

// ───────────────────────── CLIENT: the week, and one player's place in it ────

const SESSIONS = [
  { id: 'tue',  title: 'Tuesday training' },
  { id: 'thu',  title: 'Thursday training' },
  { id: 'game', title: 'Match' },
];

/**
 * `answers` — { playerId: { sessionId: status } }. Anything absent is no-reply.
 * `roster`  — what operationalPlayers() returns, i.e. the OPERATING group only.
 */
function scope({ schedule = SESSIONS, roster = [], answers = {} } = {}) {
  return new Function('schedule', 'roster', 'answers', `
    "use strict";
    const state = { schedule };
    function operationalPlayers() { return roster; }
    function sessionRows(id) {
      return operationalPlayers().map(p => ({
        player: p, status: (answers[p.id] || {})[String(id)] || undefined,
      }));
    }
    ${extractFn(html, 'availabilityWeekSessions')}
    ${extractFn(html, 'playerAvailabilityWeek')}
    ${extractFn(html, 'availabilityReminderTarget')}
    return { availabilityWeekSessions, playerAvailabilityWeek, availabilityReminderTarget, sessionRows };
  `)(schedule, roster, answers);
}

const ANA  = { id: 'p1', name: 'Ana Silva',      userId: 'u1' };
const BEN  = { id: 'p2', name: 'Ben Okafor',     userId: 'u2' };
const CILL = { id: 'p3', name: 'Cillian Murphy', userId: 'u3' };
const NOACC = { id: 'p4', name: 'Trial Player' };            // roster row, no account
const SQUAD = [ANA, BEN, CILL, NOACC];

test('the week is the app’s own week — state.schedule, nothing recomputed', () => {
  const s = scope({ roster: SQUAD });
  assert.deepEqual(s.availabilityWeekSessions(), SESSIONS);
  // No date arithmetic, no boundary of its own: if it computed a week it would
  // eventually disagree with the board that shows it.
  const src = extractFn(html, 'availabilityWeekSessions');
  assert.ok(!/Date|getDay|setDate|\d{4}-/.test(src), 'must not derive a week of its own');
});

test('a player who has answered nothing is fully outstanding', () => {
  const w = scope({ roster: SQUAD }).playerAvailabilityWeek(ANA);
  assert.equal(w.total, 3);
  assert.equal(w.answeredCount, 0);
  assert.equal(w.outstanding.length, 3);
  assert.equal(w.complete, false);
});

test('a partially answered player is outstanding only for what is missing', () => {
  const w = scope({ roster: SQUAD, answers: { p1: { tue: 'available', game: 'unavailable' } } })
    .playerAvailabilityWeek(ANA);
  assert.equal(w.answeredCount, 2);
  assert.deepEqual(w.outstanding.map(x => x.id), ['thu']);
  assert.equal(w.complete, false);
});

test('"unavailable" and "maybe" are ANSWERS — a reply is a reply', () => {
  const w = scope({ roster: SQUAD, answers: { p1: { tue: 'unavailable', thu: 'maybe', game: 'injured' } } })
    .playerAvailabilityWeek(ANA);
  assert.equal(w.complete, true, 'saying no is answering');
  assert.equal(w.outstanding.length, 0);
});

test('an explicit no-reply is NOT an answer', () => {
  const w = scope({ roster: SQUAD, answers: { p1: { tue: 'no-reply', thu: 'available', game: 'available' } } })
    .playerAvailabilityWeek(ANA);
  assert.deepEqual(w.outstanding.map(x => x.id), ['tue']);
  assert.equal(w.complete, false);
});

test('a fully replied player is complete and must not be chased', () => {
  const w = scope({ roster: SQUAD, answers: { p3: { tue: 'available', thu: 'available', game: 'available' } } })
    .playerAvailabilityWeek(CILL);
  assert.equal(w.complete, true);
  assert.equal(w.answeredCount, 3);
  assert.equal(w.outstanding.length, 0);
});

test('no sessions this week → nothing open, and complete is FALSE not true', () => {
  const w = scope({ schedule: [], roster: SQUAD }).playerAvailabilityWeek(ANA);
  assert.equal(w.total, 0);
  assert.equal(w.complete, false, 'an empty week is not an achievement');
  assert.equal(w.outstanding.length, 0);
});

test('one player’s state is their own — another player’s replies do not count for them', () => {
  const s = scope({ roster: SQUAD, answers: { p2: { tue: 'available', thu: 'available', game: 'available' } } });
  assert.equal(s.playerAvailabilityWeek(BEN).complete, true);
  assert.equal(s.playerAvailabilityWeek(ANA).complete, false);
  assert.equal(s.playerAvailabilityWeek(ANA).outstanding.length, 3);
});

test('a player OUTSIDE the operating group reads as nothing open — never as ignoring everything', () => {
  // sessionRows() serves the operating group, so an outsider yields no rows.
  const w = scope({ roster: [BEN, CILL] }).playerAvailabilityWeek(ANA);
  assert.equal(w.total, 0);
  assert.equal(w.outstanding.length, 0, 'fail closed: not 3 sessions of imagined silence');
  assert.equal(w.complete, false);
});

test('the target identity is the durable userId — not the roster id, not the name', () => {
  const s = scope({ roster: SQUAD });
  assert.deepEqual(s.availabilityReminderTarget(ANA), { ok: true, userId: 'u1' });
  const src = extractFn(html, 'availabilityReminderTarget');
  assert.ok(!/\.name/.test(src), 'a display name is not an identity');
  assert.ok(!/player\.id|\.id\b/.test(src.replace(/userId/g, '')), 'a roster id is not an account');
});

test('a roster row with no account cannot be a target', () => {
  const s = scope({ roster: SQUAD });
  assert.deepEqual(s.availabilityReminderTarget(NOACC), { ok: false, reason: 'no-account' });
  assert.deepEqual(s.availabilityReminderTarget(null),   { ok: false, reason: 'no-account' });
  assert.deepEqual(s.availabilityReminderTarget({ userId: '   ' }), { ok: false, reason: 'no-account' });
});

// ───────────────────────── CLIENT: the action's refusals and honesty ─────────

// Strip comments before asserting ON THE CODE: the prose explaining why the
// group roster is not used necessarily mentions the thing it is not using.
const stripComments = src => src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
const ACTION = stripComments(extractFn(html, 'requestPlayerAvailability'));

test('the action resolves its target from the OPERATING group, never state.players', () => {
  assert.match(ACTION, /operationalPlayers\(\)\.find/);
  assert.ok(!/state\.players/.test(ACTION), 'state.players is the whole club — it would cross groups');
  assert.match(ACTION, /not in the group you are managing/);
});

test('the action asks for the same permission the server requires', () => {
  assert.match(ACTION, /canI\('messaging'\)/);
  assert.match(ACTION, /isCoach\(\)/);
});

test('a complete player and an empty week both return BEFORE any send', () => {
  const beforeFetch = ACTION.slice(0, ACTION.indexOf('fetch('));
  assert.ok(/if \(!week\.total\) return/.test(beforeFetch), 'empty week refuses first');
  assert.ok(/if \(week\.complete\) return/.test(beforeFetch), 'complete refuses first');
  assert.ok(/if \(!target\.ok\)/.test(beforeFetch), 'no-account refuses first');
});

test('exactly one player is named, by durable id, with audience individual', () => {
  assert.match(ACTION, /audience: 'individual'/);
  assert.match(ACTION, /targetUserId: target\.userId/);
  assert.ok(!/audience: 'all'/.test(ACTION), 'a reminder for one player is never an all-send');
  assert.ok(!/audience: 'no-reply'/.test(ACTION), 'no-reply is the GROUP chase, a different feature');
  assert.ok(!/targetLabel/.test(ACTION), 'never target by display name');
});

test('the operating group is carried so the server can narrow delivery to it', () => {
  assert.match(ACTION, /group: state\.operationalGroupId/);
});

test('repeated taps cannot double-send — the guard is claimed before ANY await', () => {
  assert.match(ACTION, /_availReminderInFlight\.has\(id\)\) return/);
  assert.match(ACTION, /_availReminderInFlight\.add\(id\)/);
  assert.match(ACTION, /finally \{[\s\S]*_availReminderInFlight\.delete\(id\)/);

  // THE BUG THIS PINS. The claim used to sit after `await ceConfirm`, so three
  // fast taps all passed the has() check before any of them claimed anything
  // and the player got three notifications. Nothing may yield between the
  // check and the claim — so the FIRST await in the function must come after it.
  const check = ACTION.indexOf('_availReminderInFlight.has(id)');
  const claim = ACTION.indexOf('_availReminderInFlight.add(id)');
  const firstAwait = ACTION.indexOf('await ');
  assert.ok(check !== -1 && claim !== -1, 'both the check and the claim must exist');
  assert.ok(check < claim, 'check then claim');
  assert.ok(claim < firstAwait, 'the claim must precede every await, or it guards nothing');
  // And exactly ONE claim: a second one after the confirm reintroduces the race
  // for every click that arrived while the dialog was open.
  assert.equal(ACTION.split('_availReminderInFlight.add(id)').length - 1, 1);
});

test('success is claimed only for what actually left', () => {
  assert.match(ACTION, /const pushed = res\.ok && Number\(data\.sent\) > 0/);
  assert.match(ACTION, /if \(pushed\) showToast\(`Availability reminder sent to \$\{first\} ✓`\)/);
  // A 200 with sent:0 is NOT a delivery.
  const success = ACTION.slice(ACTION.indexOf('if (pushed)'));
  assert.match(success, /else if \(messaged\)/, 'message-only is reported as message-only');
  assert.match(success, /Reminder not sent/, 'a failed call says so');
  assert.match(success, /Reminder not delivered/, 'nothing delivered says so');
  assert.ok(!/alert\(/.test(ACTION), 'no browser alert()');
});

test('the confirm dialog says only this player is notified', () => {
  assert.match(ACTION, /ceConfirm\('Send availability reminder\?'/);
  assert.match(ACTION, /Nobody else is notified/);
});

// ───────────────────────── CLIENT: the profile card ──────────────────────────

const CARD = (() => {
  const i = html.indexOf('<!-- AVAILABILITY THIS WEEK');
  return html.slice(i, html.indexOf('<!-- APPEARANCES CARD', i));
})();
const CARD_CODE = stripComments(CARD);

test('the card is availability, and says so — never attendance', () => {
  assert.match(CARD, /sectionTitle\('Availability this week'\)/);
  assert.match(CARD, /replied/);
  assert.match(CARD, /Request availability this week/);
  // What a coach can actually READ on the card — the quoted strings, not the
  // commentary explaining why attendance is a different card.
  const shown = [...CARD_CODE.matchAll(/'([^']{4,})'|>([^<>{}$]{4,})</g)]
    .map(m => (m[1] || m[2] || '')).join(' ');
  assert.ok(!/attendance/i.test(shown), 'replying is not turning up');
});

test('the card is separate from the attendance card, which is untouched', () => {
  const att = stripComments(html.slice(html.indexOf('<!-- ATTENDANCE CARD'), html.indexOf('<!-- AVAILABILITY THIS WEEK')));
  assert.match(att, /Attendance & availability/);
  assert.ok(!/requestPlayerAvailability/.test(att), 'the reminder did not get folded into attendance');
});

test('the button is a 44px touch target and disables while sending', () => {
  assert.match(CARD, /min-height:44px/);
  assert.match(CARD, /\$\{sending \? 'disabled' : ''\}/);
  assert.match(CARD, /\$\{sending \? 'Sending…' : 'Request availability this week'\}/);
});

test('a complete player is shown as complete, with no button to press', () => {
  assert.match(CARD, /week\.complete/);
  assert.match(CARD, /Replied to everything this week/);
  const completeBranch = CARD_CODE.slice(CARD_CODE.indexOf('} else if (week.complete)'), CARD_CODE.indexOf('} else if (!canSend)'));
  assert.ok(!/<button/.test(completeBranch), 'nothing to chase, nothing to press');
});

test('"nothing to chase" says WHICH nothing — an empty week is not an ungrouped player', () => {
  const empty = CARD_CODE.slice(CARD_CODE.indexOf('if (!week.total)'), CARD_CODE.indexOf('} else if (week.complete)'));
  // A player with no rows for a week that HAS sessions is not being asked about
  // them. Calling that "no sessions this week" tells the coach the week is empty
  // while the board shows three.
  assert.match(empty, /week\.sessions\.length/, 'the two cases must be distinguished');
  assert.match(empty, /not in the group these requests were sent to/);
  assert.match(empty, /No sessions are scheduled this week/);
  assert.ok(!/<button/.test(empty));
});

test('a count is only shown when there is something to count', () => {
  assert.match(CARD_CODE, /week\.total \? `\$\{week\.answeredCount\} \/ \$\{week\.total\}` : '—'/,
    '"0 / 0 replied" reads as a real measurement of nothing');
});

test('an account-less player is explained, with no button', () => {
  const noAcc = CARD_CODE.slice(CARD_CODE.indexOf('} else if (!target.ok)'), CARD_CODE.indexOf('} else {'));
  assert.match(noAcc, /no CoachEasier account yet/);
  assert.ok(!/<button/.test(noAcc), 'never offer to send where nothing can arrive');
});

test('a coach without messaging permission sees the state but not the action', () => {
  assert.match(CARD, /const canSend = isCoach\(\) && canI\('messaging'\)/);
  const noPerm = CARD_CODE.slice(CARD_CODE.indexOf('} else if (!canSend)'), CARD_CODE.indexOf('} else if (!target.ok)'));
  assert.ok(!/<button/.test(noPerm));
});

test('the card introduces no colour of its own', () => {
  const hexes = [...CARD_CODE.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]);
  assert.deepEqual(hexes, [], 'tokens only — light and dark both come free');
});

test('the group chase is untouched and still a group chase', () => {
  const chase = stripComments(extractFn(html, 'chaseAllNonResponders'));
  assert.match(chase, /audience: 'no-reply'/);
  assert.match(chase, /availabilityNonResponders\(sessions\)/);
  assert.ok(!/targetUserId/.test(chase), 'the group chase names nobody');
});

// ───────────────────────── SERVER: the single-recipient contract ─────────────

const kv = new Map(), lists = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'LPUSH') { const l = lists.get(args[0]) || []; l.unshift(args[1]); lists.set(args[0], l); result = l.length; }
  if (command === 'LRANGE') result = (lists.get(args[0]) || []).slice(0);
  if (command === 'LTRIM') result = 'OK';
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  return { ok: true, json: async () => ({ result }) };
};

const { default: pushHandler } = await import('../api/push.js');
const idStore = await import('../api/_identityStore.js');

const CLUB = 'riverside', OTHER = 'other-club';
const SEN = 'grp_sen', U18 = 'grp_u18';
const staffScope = gids => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });
const MEMBERS = [
  { id: 'm-head', teamId: CLUB, userId: 'u-head', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
  { id: 'm-u18c', teamId: CLUB, userId: 'u-u18c', role: 'coach', staffLevel: 'assistant', status: 'active', accessProfile: 'coach', accessScope: staffScope([U18]) },
  { id: 'm-ana',  teamId: CLUB, userId: 'u1', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-ben',  teamId: CLUB, userId: 'u2', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-yth',  teamId: CLUB, userId: 'u9', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-out',  teamId: OTHER, userId: 'u-out', role: 'player', status: 'active' },
];

function seed() {
  kv.clear(); lists.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Riverside' }, { id: OTHER, name: 'Other' }]));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@t.test`, displayName: m.userId }))));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1, groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'general', status: 'active' }], teams: [] }));
  // One subscription per player. `label` is the display name on purpose: the
  // individual path must not be able to select by it.
  kv.set('app:subscriptions', JSON.stringify([
    { userId: 'u1', label: 'Ana Silva',  subscription: { endpoint: 'https://push.test/ana',  keys: { p256dh: 'k', auth: 'a' } } },
    { userId: 'u2', label: 'Ben Okafor', subscription: { endpoint: 'https://push.test/ben',  keys: { p256dh: 'k', auth: 'a' } } },
    { userId: 'u9', label: 'Youth One',  subscription: { endpoint: 'https://push.test/yth',  keys: { p256dh: 'k', auth: 'a' } } },
    { userId: 'u-out', label: 'Outsider', subscription: { endpoint: 'https://push.test/out', keys: { p256dh: 'k', auth: 'a' } } },
  ]));
}

function response() {
  return { statusCode: null, body: null, headers: {},
    setHeader(n, v) { this.headers[n] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }, end() { return this; } };
}

async function push(userId, body) {
  const s = await idStore.createSession({ userId, teamId: MEMBERS.find(m => m.userId === userId).teamId, role: 'coach' });
  const res = response();
  await pushHandler({ method: 'POST',
    headers: { cookie: `${idStore.SESSION_COOKIE}=${encodeURIComponent(s.token)}` },
    body }, res);
  return res;
}

const REMINDER = { title: 'Availability request', body: 'Please confirm your availability.', type: 'availability' };

test('audience individual without a durable id is REFUSED — it must never widen to everyone', async () => {
  seed();
  for (const bad of [{}, { targetUserId: '' }, { targetUserId: '   ' }, { targetUserId: null }]) {
    const res = await push('u-head', { ...REMINDER, audience: 'individual', ...bad });
    assert.equal(res.statusCode, 400, JSON.stringify(bad));
    assert.match(res.body.error, /requires targetUserId/);
  }
});

test('an individual send reaches exactly one device — and it is the named one', async () => {
  seed();
  const res = await push('u-head', { ...REMINDER, audience: 'individual', targetUserId: 'u1' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 1, 'one recipient, not the squad');
  assert.equal(res.body.results[0].userId, 'u1');
});

test('the OTHER players receive nothing', async () => {
  seed();
  const res = await push('u-head', { ...REMINDER, audience: 'individual', targetUserId: 'u1' });
  const reached = (res.body.results || []).map(r => r.userId);
  assert.ok(!reached.includes('u2'), 'Ben was not asked');
  assert.ok(!reached.includes('u9'), 'the U18 player was not asked');
  assert.equal(res.body.total, 1);
});

test('a display name cannot select an individual recipient', async () => {
  seed();
  // targetLabel alone → refused outright (no durable id).
  const noId = await push('u-head', { ...REMINDER, audience: 'individual', targetLabel: 'Ana Silva' });
  assert.equal(noId.statusCode, 400);
  // A label naming somebody ELSE cannot widen or redirect a valid id send.
  const withId = await push('u-head', { ...REMINDER, audience: 'individual', targetUserId: 'u1', targetLabel: 'Ben Okafor' });
  assert.equal(withId.statusCode, 200);
  assert.equal(withId.body.total, 1, 'the label added nobody');
});

test('a CROSS-CLUB target reaches nobody', async () => {
  seed();
  const res = await push('u-head', { ...REMINDER, audience: 'individual', targetUserId: 'u-out' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 0, 'another club’s player is not reachable');
  assert.equal(res.body.sent, 0);
});

test('a CROSS-GROUP target reaches nobody when a group is named', async () => {
  seed();
  const res = await push('u-head', { ...REMINDER, audience: 'individual', targetUserId: 'u9', group: SEN });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 0, 'a U18 player is not in the Seniors send');
});

test('a group the sender does not operate is refused outright', async () => {
  seed();
  const res = await push('u-u18c', { ...REMINDER, audience: 'individual', targetUserId: 'u1', group: SEN });
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /do not operate that group/);
});

test('a U18 coach CAN remind their own player', async () => {
  seed();
  const res = await push('u-u18c', { ...REMINDER, audience: 'individual', targetUserId: 'u9', group: U18 });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 1);
});

test('an unknown group is refused, not silently ignored', async () => {
  seed();
  const res = await push('u-head', { ...REMINDER, audience: 'individual', targetUserId: 'u1', group: 'grp_forged' });
  assert.equal(res.statusCode, 404);
});

test('a player with no subscription yields sent 0 — never a false success', async () => {
  seed();
  kv.set('app:subscriptions', JSON.stringify([]));
  const res = await push('u-head', { ...REMINDER, audience: 'individual', targetUserId: 'u1' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sent, 0);
  assert.equal(res.body.total, 0);
});

test('an unauthenticated send is refused', async () => {
  seed();
  const res = response();
  await pushHandler({ method: 'POST', headers: {}, body: { ...REMINDER, audience: 'individual', targetUserId: 'u1' } }, res);
  assert.equal(res.statusCode, 401);
});

test('a PLAYER cannot send an availability reminder', async () => {
  seed();
  const s = await idStore.createSession({ userId: 'u1', teamId: CLUB, role: 'player' });
  const res = response();
  await pushHandler({ method: 'POST',
    headers: { cookie: `${idStore.SESSION_COOKIE}=${encodeURIComponent(s.token)}` },
    body: { ...REMINDER, audience: 'individual', targetUserId: 'u2' } }, res);
  assert.equal(res.statusCode, 403);
});

test('an unknown audience is still refused, and the group chase still works', async () => {
  seed();
  const bad = await push('u-head', { ...REMINDER, audience: 'everyone' });
  assert.equal(bad.statusCode, 400);
  assert.match(bad.body.error, /all, no-reply or individual/);
  // The EXISTING group chase is unchanged.
  const chase = await push('u-head', { ...REMINDER, audience: 'no-reply', group: SEN });
  assert.equal(chase.statusCode, 200);
  assert.ok(chase.body.total >= 2, 'the group chase still reaches the group');
});

test('an all-send still needs no target — the broadcast path is not broken', async () => {
  seed();
  const res = await push('u-head', { ...REMINDER, audience: 'all' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 3, 'all three club players');
});
