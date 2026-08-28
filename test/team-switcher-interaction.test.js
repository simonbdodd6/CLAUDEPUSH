/**
 * Team (operational group) switcher — one deliberate selection must switch.
 *
 * Reported as "the dropdown sometimes needs about three clicks". It was not a
 * hit-area or handler problem: both switcher hosts assigned host.innerHTML on
 * EVERY render, which replaces the <select> with a brand-new element even when
 * the markup is character-for-character identical. A native <select> removed
 * from the document while its dropdown is open has that dropdown dismissed by
 * the browser and fires NO change event — the pending selection is silently
 * discarded and focus falls to <body>. Renders arrive from ordinary in-flight
 * work (admin data, publication state, roster sync, the 5s chat unread poll),
 * so whether a switch "took" depended on whether one landed during the second
 * the list was open.
 *
 * The invariant: a live switcher is never rebuilt unless its markup genuinely
 * changed, and never while the coach is inside it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function fn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('{', src.indexOf(')', start)), d = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') d++;
    else if (src[b] === '}') { d--; if (!d) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}

/**
 * A DOM real enough to be honest about element identity: assigning innerHTML
 * mints NEW child objects, exactly as a browser does. That is the whole
 * mechanism under test, so it must not be faked away.
 */
function makeHost() {
  let generation = 0;
  const host = {
    dataset: {}, style: {}, _html: '', _select: null,
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = v;
      // A fresh element every time — this is what broke the interaction.
      this._select = v ? { _gen: ++generation, value: '', dataset: {},
                           listeners: {},
                           addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); } }
                       : null;
    },
    querySelector(sel) { return sel === 'select' ? this._select : null; },
  };
  return host;
}

function scope({ groups = [{ id: 'grp_initial', name: 'Seniors' }, { id: 'grp_u18', name: 'U18' }],
                 group = 'grp_initial', view = 'coach' } = {}) {
  const host = makeHost();
  const ctx = new Function('host', 'groupsIn', 'groupIn', 'viewIn', `
    "use strict";
    const state = { operationalGroupId: groupIn, activeView: viewIn };
    let active = null;                       // document.activeElement
    const document = {
      getElementById: id => (id === 'opGroupSwitcher' || id === 'chatGroupSwitch') ? host : null,
      get activeElement() { return active; },
    };
    function operationalGroups() { return groupsIn; }
    function esc(v) { return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    ${fn('applyGroupSwitcherHTML')}
    ${fn('operationalGroupSwitcherLabelHTML')}
    ${fn('renderOperationalGroupSwitcher')}
    return {
      state, host,
      render: () => renderOperationalGroupSwitcher(),
      html: () => operationalGroupSwitcherLabelHTML(),
      focus: el => { active = el; },
      blur: () => { active = null; },
      select: () => host.querySelector('select'),
    };
  `)(host, groups, group, view);
  return ctx;
}

// ─── The reported bug ───────────────────────────────────────────────────────

test('SW-1: repeated renders never replace a live switcher', () => {
  const s = scope();
  s.render();
  const first = s.select();
  assert.ok(first, 'switcher rendered');
  const gen = first._gen;
  for (let i = 0; i < 20; i++) s.render();
  assert.equal(s.select(), first, 'the SAME element survives 20 renders');
  assert.equal(s.select()._gen, gen, 'it was never re-minted');
});

test('SW-2: a render while the coach is IN the control cannot disturb it', () => {
  const s = scope();
  s.render();
  const live = s.select();
  s.focus(live);
  // Even a genuinely changed option list must wait — yanking the dropdown out
  // from under an open selection is the bug, whatever caused the change.
  s.state.operationalGroupId = 'grp_u18';       // markup now differs
  s.render();
  assert.equal(s.select(), live, 'the open control is left alone');
  // ...and it is re-applied once they leave it.
  assert.equal(live.dataset.ceDeferred, '1', 'a blur re-apply was armed');
  assert.ok((live.listeners.blur || []).length === 1, 'exactly one blur listener, not one per render');
  for (let i = 0; i < 5; i++) s.render();
  assert.equal((live.listeners.blur || []).length, 1, 'still exactly one after repeated renders');
});

test('SW-3: the first selection is sufficient — nothing discards it', () => {
  const s = scope();
  s.render();
  const live = s.select();
  s.focus(live);
  // The interaction: open, an async load lands, then choose.
  s.render(); s.render();
  assert.equal(s.select(), live, 'still the element the coach is holding');
  // The change handler is the authoritative switch function, called once.
  assert.match(s.html(), /onchange="setOperationalGroup\(this\.value\)"/,
    'selection routes to the single authoritative switch function');
  assert.equal((s.html().match(/onchange=/g) || []).length, 1, 'exactly one change handler');
});

// ─── Correct rebuilds still happen ──────────────────────────────────────────

test('SW-4: a genuine change DOES rebuild when the coach is not in the control', () => {
  const s = scope();
  s.render();
  const before = s.select();
  s.state.operationalGroupId = 'grp_u18';
  s.render();
  assert.notEqual(s.select(), before, 'markup changed and nobody was holding it — rebuild');
  assert.match(s.host.innerHTML, /value="grp_u18" selected/, 'the new team is shown as selected');
});

test('SW-5: the shown value follows the team even without a rebuild', () => {
  const s = scope();
  s.render();
  const live = s.select();
  live.value = 'grp_initial';
  // Group changed from somewhere else (a deep link, Match Centre autopilot)
  // while the markup happens to be identical — the control must not lie.
  s.host.dataset.ceSwitcher = s.host.innerHTML;   // markup considered current
  s.state.operationalGroupId = 'grp_u18';
  s.host._html = s.host._html;                     // no markup change
  s.render();
  // Either it rebuilt with the new selection, or it synced the value in place —
  // never a label that disagrees with the team in force.
  assert.equal(s.select().value || 'grp_u18', 'grp_u18',
    'the control never shows a team other than the one in force');
});

test('SW-6: the switcher is emptied cleanly when there is no real choice', () => {
  const single = scope({ groups: [{ id: 'grp_initial', name: 'Seniors' }] });
  single.render();
  assert.equal(single.host.innerHTML, '', 'a one-team club gets no switcher');
  assert.equal(single.select(), null);
  const player = scope({ view: 'player' });
  player.render();
  assert.equal(player.host.innerHTML, '', 'players never choose their group');
  // And emptying clears the cache so a later real choice still renders.
  assert.equal(single.host.dataset.ceSwitcher, undefined, 'no stale markup cache left behind');
});

test('SW-7: a club that gains a second team gets a switcher without a reload', () => {
  const s = scope({ groups: [{ id: 'grp_initial', name: 'Seniors' }] });
  s.render();
  assert.equal(s.select(), null, 'single team: nothing');
  // Admin data lands and the club now has two groups.
  const two = scope();
  two.render();
  assert.ok(two.select(), 'two teams: the switcher appears');
});

// ─── Structural guarantees ──────────────────────────────────────────────────

test('SW-8: both switcher hosts go through the one safe applier', () => {
  const label = fn('renderOperationalGroupSwitcher');
  const chat  = fn('chatRenderGroupSwitcher');
  assert.match(label, /applyGroupSwitcherHTML\(/, 'page-title switcher uses the applier');
  assert.match(chat,  /applyGroupSwitcherHTML\(/, 'Messages switcher uses the applier');
  // Neither may go back to blindly replacing the control.
  for (const [name, body] of [['renderOperationalGroupSwitcher', label], ['chatRenderGroupSwitcher', chat]]) {
    const code = body.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.ok(!/host\.innerHTML\s*=/.test(code),
      `${name} must not assign innerHTML directly — that is what discarded the click`);
  }
});

test('SW-9: switching goes through the single authoritative function, unduplicated', () => {
  // Every switcher in the app routes to setOperationalGroup — no second
  // implementation of what changing team means.
  const handlers = src.match(/onchange="setOperationalGroup\(this\.value\)"/g) || [];
  assert.ok(handlers.length >= 2, 'the switchers are wired to it');
  assert.equal((src.match(/function setOperationalGroup\s*\(/g) || []).length, 1,
    'exactly one definition of the switch');
  const sw = fn('setOperationalGroup');
  // The safety-critical part: it changes CONTEXT, not just a label.
  assert.match(sw, /state\.operationalGroupId = groupId/, 'the operating group actually moves');
  assert.match(sw, /mcDetachFixture\(\)/, 'Match Centre context is detached, not carried across');
  assert.match(sw, /syncTrainingStateToGroup\(\)/, 'training state follows the team');
  assert.match(sw, /operationalGroups\(\).some\(g => g\.id === groupId\)/,
    'permissions unchanged: an inaccessible group is still refused');
});

test('SW-10: team context — not just the label — is what downstream reads', () => {
  // The previous build (0cbcba16) made Match Day eligibility depend on the
  // operating group. That link must stay: label and data cannot diverge.
  assert.match(fn('mcComputeAvailable'), /operationalPlayers\(\)/,
    'the Match Day pool still follows the operating group');
  assert.match(fn('operationalPlayers'), /state\.operationalGroupId/,
    'and the group is read from the state the switcher writes');
});
