/**
 * Phase 31 hotfix — wire Members list row click to the premium Member Centre.
 *
 * The production Members list (player-db-table) renders one <tr class="member-row">
 * per player. Before this fix the row was inert — only the action buttons worked.
 * The row now opens the Member Centre (playerOpenDetail), and every interactive
 * control inside the row calls event.stopPropagation() so it keeps working
 * WITHOUT also opening the centre.
 *
 * Rather than substring-match the markup, this test extracts the real onclick
 * handler strings from index.html and EXECUTES them with spies + a fake event,
 * proving the actual click behaviour.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Isolate the production members-table row template.
const rowStart = src.indexOf('class="member-row"');
assert.ok(rowStart > -1, 'member-row template must exist in production Members list');
const region = src.slice(rowStart, rowStart + 6000);

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// First onclick string in `region` whose body contains `token`. onclick values
// use single quotes for ids, so [^"]* never crosses an attribute boundary.
function onclickWith(token) {
  const m = region.match(new RegExp(`onclick="([^"]*${escapeRe(token)}[^"]*)"`));
  return m ? m[1] : null;
}

// Execute an onclick handler string with stubbed globals + a fake event.
function simulate(onclickStr) {
  assert.ok(onclickStr, 'onclick handler must be present');
  const calls = [];
  let stopped = false;
  const event = { stopPropagation() { stopped = true; } };
  const stub = name => (...args) => calls.push([name, ...args]);
  const code = onclickStr.replace(/\$\{p\.id\}/g, 'p1'); // ${p.id} is already inside quotes
  const fn = new Function(
    'event', 'playerOpenDetail', 'requestMedical', 'archivePlayer',
    'restorePlayer', 'toggleMediaConsent', 'savePlayerPhoto',
    code,
  );
  fn(event,
    stub('playerOpenDetail'), stub('requestMedical'), stub('archivePlayer'),
    stub('restorePlayer'), stub('toggleMediaConsent'), stub('savePlayerPhoto'));
  return { calls, stopped, opened: calls.some(c => c[0] === 'playerOpenDetail') };
}

test('clicking a member row opens the Member Centre', () => {
  // The row's own onclick is the first playerOpenDetail in the template.
  const rowOnclick = onclickWith('playerOpenDetail');
  const { calls, opened } = simulate(rowOnclick);
  assert.equal(opened, true, 'row click must call playerOpenDetail');
  assert.deepEqual(calls.find(c => c[0] === 'playerOpenDetail'), ['playerOpenDetail', 'p1']);
});

test('Remove (Archive) button does NOT open the Member Centre and stops propagation', () => {
  const archiveOnclick = onclickWith('archivePlayer');
  const { calls, stopped, opened } = simulate(archiveOnclick);
  assert.ok(calls.some(c => c[0] === 'archivePlayer' && c[1] === 'p1'), 'archive must still fire');
  assert.equal(stopped, true, 'archive must stop propagation so the row handler does not also run');
  assert.equal(opened, false, 'archive must not open the member centre');
});

test('Restore button (archived view) stops propagation and does not open the centre', () => {
  const { calls, stopped, opened } = simulate(onclickWith('restorePlayer'));
  assert.ok(calls.some(c => c[0] === 'restorePlayer' && c[1] === 'p1'));
  assert.equal(stopped, true);
  assert.equal(opened, false);
});

test('Medical button still works and stops propagation', () => {
  const { calls, stopped, opened } = simulate(onclickWith('requestMedical'));
  assert.ok(calls.some(c => c[0] === 'requestMedical' && c[1] === 'p1'), 'medical must still fire');
  assert.equal(stopped, true, 'medical must stop propagation');
  assert.equal(opened, false, 'medical must not open the member centre');
});

test('Media-consent control stops propagation and still toggles', () => {
  const { calls, stopped, opened } = simulate(onclickWith('toggleMediaConsent'));
  assert.ok(calls.some(c => c[0] === 'toggleMediaConsent' && c[1] === 'p1'));
  assert.equal(stopped, true);
  assert.equal(opened, false);
});

test('Edit profile tab still works (Phase 31 wiring intact)', () => {
  // The Member Centre overview offers an Edit-profile switch, and setMemberTab
  // toggles to the existing editable form — both must remain present.
  assert.ok(/function setMemberTab\s*\(/.test(src), 'setMemberTab must exist');
  assert.ok(/setMemberTab\('edit'\)/.test(src), 'an Edit-profile control must call setMemberTab(edit)');
  assert.ok(/function renderMemberCentre\s*\(/.test(src), 'renderMemberCentre must exist');
  assert.ok(/function renderPlayerDetail\s*\(/.test(src), 'the editable profile form must remain');
});
