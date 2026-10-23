/**
 * SETTINGS — who may save club branding, season dates and default match day.
 *
 * Approved policy: a coach with MANAGE_TEAMS may change these even when scoped
 * to one group; staff without it may not; renaming the club and the Danger
 * zone keep their stricter, club-wide authority. The Settings page hides the
 * card from exactly the members this endpoint refuses
 * (test/settings-club-access.test.js) — these tests pin the endpoint itself,
 * so the page is never the only thing standing in the way.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, publishCall, read, addMember } from './build134-fixture.js';

const clubName = 'Alpha RFC';
const stored = w => read(`app:club:${w.a}`);
const LOGO = 'data:image/png;base64,iVBORw0KGgo=';
const settingsSave = (over = {}) => ({ club: { clubName, logoDataUrl: LOGO, colours: { primary: '#112233', secondary: '#445566' },
  matchDay: 'Sat', seasonStart: '2026-09-01', seasonEnd: '2027-05-31', ...over } });

async function seeded() {
  const w = await world();
  const set = await publishCall('POST', { resource: 'club' }, { club: { clubName } }, w.owner);
  assert.equal(set.statusCode, 200, JSON.stringify(set.body));
  w.medical = await addMember(w.a, { role: 'medical' });
  w.snc = await addMember(w.a, { role: 'snc' });
  return w;
}

test('a GROUP-SCOPED head coach (MANAGE_TEAMS) may save branding, season dates and default match day', async () => {
  const w = await seeded();
  const r = await publishCall('POST', { resource: 'club' }, settingsSave(), w.headU18);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const club = stored(w);
  assert.equal(club.logoDataUrl, LOGO);
  assert.deepEqual(club.colours, { primary: '#112233', secondary: '#445566' });
  assert.equal(club.matchDay, 'Sat');
  assert.equal(club.seasonStart, '2026-09-01');
  assert.equal(club.seasonEnd, '2027-05-31');
});

test('a manager (Manager profile, MANAGE_TEAMS) may save them too', async () => {
  const w = await seeded();
  const r = await publishCall('POST', { resource: 'club' }, settingsSave({ matchDay: 'Sun' }), w.manager);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(stored(w).matchDay, 'Sun');
});

test('staff without MANAGE_TEAMS are refused and nothing is written: medical, S&C, a Coach Access assistant', async () => {
  for (const actor of ['medical', 'snc', 'assistant']) {
    const w = await seeded();
    const before = JSON.stringify(stored(w));
    const r = await publishCall('POST', { resource: 'club' }, settingsSave(), w[actor]);
    assert.equal(r.statusCode, 403, `${actor}: ${JSON.stringify(r.body)}`);
    assert.equal(JSON.stringify(stored(w)), before, `${actor}: the club record is untouched`);
  }
});

test('genuinely club-wide operations keep their stricter authority: a group-scoped head coach cannot rename or wipe the club', async () => {
  const w = await seeded();
  const rename = await publishCall('POST', { resource: 'club' }, settingsSave({ clubName: 'U18 Takeover RFC' }), w.headU18);
  assert.equal(rename.statusCode, 403, JSON.stringify(rename.body));
  assert.equal(stored(w).clubName, clubName);
  const wipe = await publishCall('POST', { resource: 'club' }, { action: 'delete_club_data', confirmName: clubName }, w.headU18);
  assert.equal(wipe.statusCode, 403, JSON.stringify(wipe.body));
  assert.equal(stored(w).clubName, clubName, 'not wiped');
});

test('a reversed season window is still refused, whoever saves it', async () => {
  const w = await seeded();
  const r = await publishCall('POST', { resource: 'club' }, settingsSave({ seasonStart: '2027-06-01', seasonEnd: '2027-05-31' }), w.headU18);
  assert.equal(r.statusCode, 400, JSON.stringify(r.body));
});
