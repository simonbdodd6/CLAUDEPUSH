/**
 * BUILD M — "Message this group" from the Availability board.
 *
 * One tap takes the coach from the group they are viewing in Availability to
 * that SAME group's existing Messages conversation. The destination is
 * availabilityChatChannel() — the canonical answer Build L gave the
 * availability-request write — so the button and the request can never point
 * at different audiences. Navigation only: nothing is sent, nothing created.
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
const fn = n => extractFn(html, n);
const strip = s => s.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n');

/** The real navigation function in a controlled world. */
function world({ groups, opGid, canMessage = true }) {
  return new Function('cfg', `
    "use strict";
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    const state = { operationalGroupId: cfg.opGid, selectedChatId: 'squad',
                    activeView: 'coach', activeCoachSection: 'message' };
    const nav = [];
    function operationalGroups() { return cfg.groups; }
    function canI(p) { return p === 'messaging' ? cfg.canMessage : true; }
    function showToast(m) { state._toast = m; }
    function setSection(view, section) { nav.push({ view, section }); state.activeCoachSection = section; }
    ${fn('availabilityChatChannel')}
    ${fn('availabilityMessageGroup')}
    return { state, nav, availabilityMessageGroup, availabilityChatChannel };
  `)({ groups, opGid, canMessage });
}
const MULTI = [{ id: 'grp_initial', name: 'Seniors' }, { id: 'grp_u18', name: 'U18' }];

test('1. U18 Availability → U18 Messages', () => {
  const w = world({ groups: MULTI, opGid: 'grp_u18' });
  w.availabilityMessageGroup();
  assert.equal(w.state.selectedChatId, 'group:grp_u18', 'the U18 conversation is selected');
  assert.deepEqual(w.nav, [{ view: 'coach', section: 'messages' }], 'and Messages opens');
});

test('2. Seniors Availability → Seniors Messages — never squad in a multi-group club', () => {
  const w = world({ groups: MULTI, opGid: 'grp_initial' });
  w.availabilityMessageGroup();
  assert.equal(w.state.selectedChatId, 'group:grp_initial',
    'squad would put the Seniors note in front of U18 too');
  assert.equal(w.nav.length, 1);
});

test('3. changing the selected group changes the destination', () => {
  const w = world({ groups: MULTI, opGid: 'grp_u18' });
  w.availabilityMessageGroup();
  assert.equal(w.state.selectedChatId, 'group:grp_u18');
  w.state.operationalGroupId = 'grp_initial';
  w.availabilityMessageGroup();
  assert.equal(w.state.selectedChatId, 'group:grp_initial', 'the destination follows the switcher');
});

test('4+8. a legacy single-group club keeps its existing squad behaviour', () => {
  const w = world({ groups: [{ id: 'grp_initial', name: 'Seniors' }], opGid: 'grp_initial' });
  w.availabilityMessageGroup();
  assert.equal(w.state.selectedChatId, 'squad',
    'squad IS that club’s canonical channel — the one its players read');
  assert.deepEqual(w.nav, [{ view: 'coach', section: 'messages' }]);
});

test('G. no group selected → no navigation, and never a fall-through to squad', () => {
  const w = world({ groups: MULTI, opGid: null });
  w.availabilityMessageGroup();
  assert.equal(w.state.selectedChatId, 'squad', 'the persisted selection is untouched');
  assert.deepEqual(w.nav, [], 'nowhere to go until the switcher answers');
});

test('F. without the messaging permission the action refuses and stays put', () => {
  const w = world({ groups: MULTI, opGid: 'grp_u18', canMessage: false });
  w.availabilityMessageGroup();
  assert.deepEqual(w.nav, [], 'no navigation');
  assert.equal(w.state.selectedChatId, 'squad', 'no selection change');
  assert.match(w.state._toast, /permission/);
});

test('5. navigation only — the action sends nothing and creates nothing', () => {
  const src = strip(fn('availabilityMessageGroup'));
  assert.ok(!/fetch\(/.test(src), 'no network call of its own');
  assert.ok(!/create_conv|chatSendMessage|action: *'send'/.test(src), 'no send, no conversation creation');
  // Channel creation stays where it already lives: renderCoachMessages ensures
  // the selected group channel idempotently on arrival.
  const rcm = strip(fn('renderCoachMessages'));
  assert.match(rcm, /startsWith\('group:'\)/);
  assert.match(rcm, /chatEnsureGroupChannel\(state\.selectedChatId\)/);
});

test('the destination is THE canonical channel — the same one the request write uses', () => {
  const src = strip(fn('availabilityMessageGroup'));
  assert.match(src, /state\.selectedChatId = availabilityChatChannel\(\);/,
    'one channel rule for the button AND the availability-request write');
  assert.ok(!/'group:' *\+|`group:\$\{/.test(src), 'no second channel construction');
});

test('the button renders only for an entitled coach with a group in force', () => {
  const render = extractFn(html, 'renderMessageCenterV2');
  const head = render.slice(render.indexOf('class="avail-head-row"'), render.indexOf('avail-weeknav'));
  assert.match(head, /availabilityMessageGroup\(\)/, 'the action is in the header row');
  assert.match(head, /canI\('messaging'\) && state\.operationalGroupId && operationalGroups\(\)\.length/,
    'gated on permission AND a selected group');
  assert.match(head, /Message this group/);
  assert.ok(!render.includes('class="avail-head-actions"'),
    'the removed legacy action row does not come back');
});
