/**
 * BUILD I — the pre-V2 coach broadcast is gone.
 *
 * sendInAppMessage() was the coach's message send before V2 split availability
 * from messaging. It had no caller left — the only one was the legacy
 * message-centre body deleted in the previous build — but it was not harmless
 * dead code. It encoded the architecture that group isolation replaced:
 *
 *   · convId: 'squad'  — the hardcoded CLUB-WIDE channel, so a U18 coach's
 *                        message would land in Seniors' inbox
 *   · audience: 'all'  — a club-wide push
 *   · and on an INDIVIDUAL send it copied the private direct message into that
 *     same club-wide channel, prefixed with the player's name
 *
 * Anyone finding it would reasonably have assumed it was a working
 * implementation waiting to be re-wired. This file makes sure it stays gone,
 * and that removing it took nothing live with it.
 *
 * Coach messaging lives in the Messages section (renderCoachMessages +
 * api/chat.js), which is group-scoped and permission-gated. The Availability
 * board keeps its own request and chase paths. Neither is changed here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(src, name, indent = '    ') {
  let start = src.indexOf(indent + 'function ' + name + '(');
  if (start === -1) start = src.indexOf(indent + 'async function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = src.indexOf('{', i), depth = 0;
  for (let k = brace; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}
/** Source with comments removed — a comment may still NAME what was deleted. */
const code = html.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n').replace(/<!--[\s\S]*?-->/g, '');

// ═══════════════ GONE ══════════════════════════════════════════════════════

test('the pre-V2 broadcast and its private helpers are gone', () => {
  for (const fn of ['sendInAppMessage', 'getMessageRecipients', 'byStatus',
                    'applyTemplate', 'prefillCoachMessage']) {
    assert.ok(!code.includes(`function ${fn}(`), `${fn} must not be defined`);
    assert.ok(!code.includes(`${fn}(`), `${fn} must not be called either`);
  }
});

test('no client path sends to the hardcoded club-wide chat channel as the old one did', () => {
  // The DELETED path posted `action:'send'` to convId 'squad' as a coach
  // broadcast. Availability still has one such write (sendAvailabilityRequest)
  // — a separate, LIVE issue reported rather than changed here, since the
  // availability paths are out of this build's scope. What must not exist is a
  // second, caller-less one, and no path may pair it with audience:'all'.
  const squadSends = [...code.matchAll(/action: *'send'[\s\S]{0,300}?convId: *'squad'|convId: *'squad'[\s\S]{0,300}?action: *'send'/g)];
  assert.ok(squadSends.length <= 1, `expected at most the known availability write, found ${squadSends.length}`);
  for (const m of squadSends) {
    assert.ok(!/audience: *'all'/.test(m[0]), 'a club-wide channel write must not also force a club-wide push');
  }
});

test('nothing copies a direct message into a club-wide channel', () => {
  // The deleted code sent the DM, then re-sent its text to 'squad' prefixed
  // with the recipient's name — publishing a private message to the whole club.
  assert.ok(!/Also write to squad/.test(html));
  assert.ok(!/\$\{target\?\.name \|\| 'Player'\}: \$\{body\}/.test(code));
  const dmThenSquad = /dmConvId\([\s\S]{0,900}?convId: *'squad'/.test(code);
  assert.ok(!dmThenSquad, 'a DM send must not be followed by a club-wide write');
});

test('no client send forces a club-wide push audience', () => {
  // audience:'all' survives only as stored automation-schedule config, never as
  // a live /api/push payload built by a coach action.
  const pushCalls = [...code.matchAll(/sendPushToPlayers\([\s\S]{0,400}?\)/g)].map(m => m[0]);
  for (const call of pushCalls) {
    assert.ok(!/audience: *'all'/.test(call), 'no coach send may force a club-wide audience: ' + call.slice(0, 90));
  }
  // And the push helper still attaches the operating group for staff sends.
  assert.match(extractFn(html, 'sendPushToPlayers'),
    /_pushGroup = state\.activeView !== 'player' \? \(state\.operationalGroupId \|\| ''\) : ''/);
});

test('the ids whose last reader went with the deletions are unreferenced', () => {
  for (const id of ['messageBody', 'templateSelect', 'requestType', 'avail-debug-btn']) {
    assert.ok(!code.includes(`id="${id}"`), `${id} must not be rendered`);
    assert.ok(!code.includes(`getElementById('${id}')`) && !code.includes(`getElementById("${id}")`),
      `${id} must not be looked up`);
  }
});

// ═══════════════ KEPT, AND PROVEN LIVE ═════════════════════════════════════

test('createCoachMessage is KEPT — four live callers depend on it', () => {
  // The one candidate that could not be deleted. It writes the coach's
  // device-local message rows, and the availability paths this build must not
  // touch are its callers.
  assert.ok(code.includes('function createCoachMessage('), 'still defined');
  for (const caller of ['sendAvailabilityNow', 'sendTrainingSheet',
                        'sendAvailabilityRequest', 'sendAllAvailabilityRequests']) {
    assert.match(extractFn(html, caller), /createCoachMessage\(/, caller + ' calls it');
  }
});

test('the four availability send paths are intact and still reachable', () => {
  for (const [fn, reachedBy] of [
    ['sendAvailabilityRequest',     /onclick="sendAvailabilityRequest\('/],
    ['sendAllAvailabilityRequests', /onclick="sendAllAvailabilityRequests\(\)"/],
    ['chaseAllNonResponders',       /chaseAllNonResponders\(\)/],
    ['requestPlayerAvailability',   /onclick="requestPlayerAvailability\('/],
  ]) {
    assert.ok(html.includes('function ' + fn + '(') || html.includes('async function ' + fn + '('),
      fn + ' must still be defined');
    assert.match(html, reachedBy, fn + ' must still be reachable from the UI');
  }
});

test('the live Messages implementation is untouched and still mounted', () => {
  assert.ok(html.includes('function renderCoachMessages('), 'renderCoachMessages defined');
  assert.match(code, /safeRender\('coach-messages',\s*\(\) => renderCoachMessages\(\)\)/, 'and mounted');
  assert.ok(html.includes('async function chatSendMessage('), 'the live composer survives');
  assert.match(extractFn(html, 'chatSendMessage'), /action: *'send'/, 'and still posts to api/chat');
});

test('the Availability implementation and its wrapper are untouched', () => {
  assert.ok(html.includes('function renderMessageCenterV2('), 'V2 defined');
  assert.equal(html.split('function renderMessageCenterV2(').length - 1, 1, 'exactly one');
  const wrapper = extractFn(html, 'renderMessageCenter');
  assert.match(wrapper, /return renderMessageCenterV2\(\);/, 'the wrapper still delegates');
});

test('permissions, navigation and group isolation are unchanged', () => {
  // Pinned literally: this build must not have moved a section between gates.
  assert.match(code, /message: 'reports'/, 'Availability stays reports-gated');
  assert.match(code, /messages: 'messaging'/, 'Messages stays messaging-gated');
  assert.match(code, /const BETA_NAV_IDS = \["overview", "message", "training", "tactics", "performance", "matchday", "messages", "players", "medical", "settings"\]/);
  // The group-scoped channel path a coach actually uses.
  assert.ok(html.includes('async function chatEnsureGroupChannel('), 'group channels still created');
  assert.match(extractFn(html, 'chatEnsureGroupChannel'), /operationalGroups\(\)\.find/,
    'and still only for groups this identity operates');
});

test('the diagnostic and the deliberately-parked full-build panels survive', () => {
  assert.match(code, /window\.debugAvailabilityMatch = debugAvailabilityMatch/);
  for (const fn of ['loadLiveTemplates', 'loadLiveLog', 'renderAudiencePicker']) {
    assert.ok(html.includes('function ' + fn + '(') || html.includes('async function ' + fn + '('),
      fn + ' is retained deliberately — it is reachable or parked for the full build, not dormant pre-V2 code');
  }
});
