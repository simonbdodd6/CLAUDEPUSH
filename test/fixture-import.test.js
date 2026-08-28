/**
 * RC4.10B — fixture entry and bulk import.
 *
 * Covers the pure parsing layer (CSV, XLSX, aliases, dates, duplicates) and the
 * server commit path (permissions, tenant isolation, duplicate resolution,
 * downstream-data protection, audit).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';

import {
  parseCsv, autoMapColumns, parseDateCell, parseTimeCell, parseHomeAway,
  buildImportRows, findDuplicate, findInternalDuplicates, excelSerialToIso,
  CSV_TEMPLATE, FIXTURE_TARGET_FIELDS,
} from '../src/fixture-import.js';
import { parseXlsx } from '../src/xlsx-read.js';

const nodeInflateRaw = async data => new Uint8Array(zlib.inflateRawSync(Buffer.from(data)));

// ── CSV parsing and column mapping ──────────────────────────────────────────
test('CSV parser handles quotes, embedded commas, CRLF and BOM', () => {
  const rows = parseCsv('﻿date,opponent,venue\r\n2026-09-12,"Rovers, AFC","The ""Big"" Ground"\r\n');
  assert.deepEqual(rows[0], ['date', 'opponent', 'venue']);
  assert.deepEqual(rows[1], ['2026-09-12', 'Rovers, AFC', 'The "Big" Ground']);
});

test('column aliases map to target fields', () => {
  const map = autoMapColumns(['Date', 'Opposition', 'Kick Off', 'Ground', 'League', 'Home/Away', 'External Ref']);
  assert.equal(map[0], 'date');
  assert.equal(map[1], 'opponent');
  assert.equal(map[2], 'time');
  assert.equal(map[3], 'venue');
  assert.equal(map[4], 'competition');
  assert.equal(map[5], 'home_away');
  assert.equal(map[6], 'external_id');
});

test('the CSV template exposes exactly the documented columns and one example row', () => {
  const rows = parseCsv(CSV_TEMPLATE);
  assert.deepEqual(rows[0], ['date', 'time', 'team', 'opponent', 'home_away', 'venue',
    'competition', 'arrival_time', 'notes', 'external_id'], 'documented column order');
  assert.deepEqual([...rows[0]].sort(), [...FIXTURE_TARGET_FIELDS].sort(), 'covers every target field');
  assert.equal(rows.length, 2, 'header + exactly one example row');
  // The template must map cleanly onto itself.
  const built = buildImportRows(rows, autoMapColumns(rows[0]));
  assert.equal(built[0].errors.length, 0, JSON.stringify(built[0].errors));
  assert.equal(built[0].fixture.opposition, 'Riverside Rovers');
});

// ── Dates ───────────────────────────────────────────────────────────────────
test('supported date formats parse correctly', () => {
  assert.equal(parseDateCell('2026-09-12').iso, '2026-09-12');
  assert.equal(parseDateCell('12/09/2026').iso, '2026-09-12');       // day-first club
  assert.equal(parseDateCell('12-09-2026').iso, '2026-09-12');
  assert.equal(parseDateCell(46277).iso, '2026-09-12');              // Excel serial
});

test('Excel serial conversion accounts for the phantom 1900 leap day', () => {
  assert.equal(excelSerialToIso(1).iso, '1900-01-01');
  assert.equal(excelSerialToIso(60).iso, '1900-02-28');
  assert.equal(excelSerialToIso(61).iso, '1900-03-01');
});

test('ambiguous dates are flagged with the alternative, never silently guessed', () => {
  const r = parseDateCell('04/05/2026', { dayFirst: true });
  assert.equal(r.ambiguous, true);
  assert.equal(r.iso, '2026-05-04');
  assert.equal(r.alternative, '2026-04-05');
  // Unambiguous when the first number cannot be a month.
  assert.equal(parseDateCell('22/05/2026').ambiguous, false);
  // Locale flips the primary reading but keeps the flag.
  const us = parseDateCell('04/05/2026', { dayFirst: false });
  assert.equal(us.iso, '2026-04-05');
  assert.equal(us.ambiguous, true);
});

test('impossible and unreadable dates are errors, not guesses', () => {
  assert.ok(parseDateCell('32/01/2026').error);
  assert.ok(parseDateCell('2026-02-30').error);
  assert.ok(parseDateCell('next tuesday').error);
  assert.ok(parseDateCell('').error);
});

test('time cells accept the common spreadsheet spellings', () => {
  assert.equal(parseTimeCell('15:00').time, '15:00');
  assert.equal(parseTimeCell('3.30pm').time, '15:30');
  assert.equal(parseTimeCell('7pm').time, '19:00');
  assert.equal(parseTimeCell('1930').time, '19:30');
  assert.equal(parseTimeCell(0.5).time, '12:00');          // Excel day fraction
  assert.equal(parseTimeCell('').time, '');
  assert.ok(parseTimeCell('99:99').error);
});

test('home/away accepts common spellings including neutral', () => {
  assert.equal(parseHomeAway('H'), 'home');
  assert.equal(parseHomeAway('Away'), 'away');
  assert.equal(parseHomeAway('neutral'), 'neutral');
  assert.equal(parseHomeAway('somewhere'), '');
});

// ── Row building and validation ─────────────────────────────────────────────
const CSV_FIVE = [
  'Date,Kick Off,Team,Opposition,Home/Away,Ground,League,Arrival,Notes,Ref',
  '12/09/2026,15:00,1st XV,Riverside Rovers,H,Memorial Ground,Div 2,13:45,Bring both jerseys,EXT-1',
  '19/09/2026,14:30,1st XV,Northside,A,Northside Park,Div 2,13:00,,EXT-2',
  '26/09/2026,15:00,1st XV,Eastfield,N,Neutral Park,Cup,13:45,,EXT-3',
  '03/10/2026,15:00,1st XV,Westgate,H,Memorial Ground,Div 2,,,EXT-4',
  '10/10/2026,15:00,1st XV,Southbank,A,Southbank Rd,Div 2,,,EXT-5',
].join('\n');

function rowsFromCsv(csv, opts) {
  const raw = parseCsv(csv);
  return buildImportRows(raw, autoMapColumns(raw[0]), opts);
}

test('a five-fixture CSV builds clean, fully-mapped rows', () => {
  const rows = rowsFromCsv(CSV_FIVE);
  assert.equal(rows.length, 5);
  assert.equal(rows.every(r => r.errors.length === 0), true, JSON.stringify(rows.flatMap(r => r.errors)));
  assert.deepEqual(rows.map(r => r.fixture.opposition),
    ['Riverside Rovers', 'Northside', 'Eastfield', 'Westgate', 'Southbank']);
  assert.deepEqual(rows.map(r => r.fixture.homeAway), ['home', 'away', 'neutral', 'home', 'away']);
  assert.equal(rows[0].fixture.date, '2026-09-12');
  assert.equal(rows[0].fixture.time, '15:00');
  assert.equal(rows[0].fixture.arrivalTime, '13:45');
  assert.equal(rows[0].fixture.externalId, 'EXT-1');
  assert.equal(rows[0].fixture.notes, 'Bring both jerseys');
});

test('a missing opponent is a row error and an ambiguous date is a warning', () => {
  const rows = rowsFromCsv([
    'Date,Opposition', '12/09/2026,', '04/05/2026,Rovers',
  ].join('\n'));
  assert.match(rows[0].errors[0], /opponent is required/);
  assert.equal(rows[1].errors.length, 0);
  assert.equal(rows[1].ambiguousDate, true);
  assert.match(rows[1].warnings[0], /ambiguous date/);
  assert.equal(rows[1].confirmed, false, 'ambiguous rows start unconfirmed');
});

test('duplicates are detected inside the file and against existing fixtures', () => {
  const rows = rowsFromCsv([
    'Date,Kick Off,Team,Opposition,Home/Away',
    '12/09/2026,15:00,1st XV,Rovers,H',
    '12/09/2026,15:00,1st XV,Rovers,H',
  ].join('\n'));
  assert.deepEqual(findInternalDuplicates(rows), [{ index: 1, firstIndex: 0 }]);

  const existing = [{ id: 'fx1', team: '1st XV', opposition: 'Rovers', date: '2026-09-12', time: '15:00', homeAway: 'home' }];
  const byFields = findDuplicate(rows[0].fixture, existing);
  assert.ok(byFields);
  assert.match(byFields.reason, /team \+ opponent \+ date/);

  const byExt = findDuplicate({ opposition: 'Anything', date: '2030-01-01', externalId: 'EXT-9' },
    [{ id: 'fx2', externalId: 'EXT-9' }]);
  assert.equal(byExt.reason, 'external_id');
  assert.equal(findDuplicate({ opposition: 'New Team', date: '2027-01-01' }, existing), null);

  // A spreadsheet that omits the kick-off must STILL match an existing fixture,
  // or the import would quietly create a second copy of the same match.
  const noTime = findDuplicate({ team: '1st XV', opposition: 'Rovers', date: '2026-09-12', homeAway: 'home' }, existing);
  assert.ok(noTime, 'missing kick-off still detected as a likely duplicate');
  assert.match(noTime.reason, /kick-off missing/);
  // A genuinely different kick-off on the same day is not silently merged.
  assert.equal(findDuplicate({ team: '1st XV', opposition: 'Rovers', date: '2026-09-12', time: '18:00', homeAway: 'home' }, existing), null);
});

// ── XLSX ────────────────────────────────────────────────────────────────────
/** Build a real .xlsx in-memory (stored entries, no compression) so the reader
 *  is exercised end-to-end without a fixture binary in the repo. */
function buildXlsx(sheetXml, sharedXml) {
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['xl/sharedStrings.xml', sharedXml],
    ['xl/worksheets/sheet1.xml', sheetXml],
  ];
  const enc = new TextEncoder();
  const chunks = []; const central = []; let offset = 0;
  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c; }
    return t;
  })();
  const crc32 = buf => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const num = (v, n) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (v >>> (8 * i)) & 0xff; return a; };
  for (const [name, content] of files) {
    const nameBytes = enc.encode(name); const data = enc.encode(content);
    const crc = crc32(data);
    const local = [num(0x04034b50, 4), num(20, 2), num(0, 2), num(0, 2), num(0, 2), num(0, 2),
      num(crc, 4), num(data.length, 4), num(data.length, 4), num(nameBytes.length, 2), num(0, 2), nameBytes, data];
    const localBytes = local.reduce((acc, a) => [...acc, ...a], []);
    central.push({ name: nameBytes, crc, size: data.length, offset });
    chunks.push(...localBytes); offset += localBytes.length;
  }
  const cdStart = offset; const cd = [];
  for (const e of central) {
    cd.push(...[num(0x02014b50, 4), num(20, 2), num(20, 2), num(0, 2), num(0, 2), num(0, 2), num(0, 2),
      num(e.crc, 4), num(e.size, 4), num(e.size, 4), num(e.name.length, 2), num(0, 2), num(0, 2),
      num(0, 2), num(0, 2), num(0, 4), num(e.offset, 4), e.name].reduce((acc, a) => [...acc, ...a], []));
  }
  const eocd = [num(0x06054b50, 4), num(0, 2), num(0, 2), num(central.length, 2), num(central.length, 2),
    num(cd.length, 4), num(cdStart, 4), num(0, 2)].reduce((acc, a) => [...acc, ...a], []);
  return new Uint8Array([...chunks, ...cd, ...eocd]);
}

const SHARED = `<sst><si><t>Date</t></si><si><t>Opposition</t></si><si><t>Home/Away</t></si>
  <si><t>Riverside Rovers</t></si><si><t>Northside</t></si><si><t>Eastfield</t></si>
  <si><t>Westgate</t></si><si><t>Southbank</t></si><si><t>H</t></si><si><t>A</t></si></sst>`;
const SHEET = `<worksheet><sheetData>
  <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
  <row r="2"><c r="A2"><v>46277</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" t="s"><v>8</v></c></row>
  <row r="3"><c r="A3"><v>46284</v></c><c r="B3" t="s"><v>4</v></c><c r="C3" t="s"><v>9</v></c></row>
  <row r="4"><c r="A4"><v>46291</v></c><c r="B4" t="s"><v>5</v></c><c r="C4" t="s"><v>8</v></c></row>
  <row r="5"><c r="A5"><v>46298</v></c><c r="B5" t="s"><v>6</v></c><c r="C5" t="s"><v>9</v></c></row>
  <row r="6"><c r="A6"><v>46305</v></c><c r="B6" t="s"><v>7</v></c><c r="C6" t="s"><v>8</v></c></row>
</sheetData></worksheet>`;

test('XLSX import reads five fixtures with native Excel date cells', async () => {
  const rows = await parseXlsx(buildXlsx(SHEET, SHARED), nodeInflateRaw);
  assert.deepEqual(rows[0], ['Date', 'Opposition', 'Home/Away']);
  const built = buildImportRows(rows, autoMapColumns(rows[0]));
  assert.equal(built.length, 5);
  assert.equal(built.every(r => r.errors.length === 0), true, JSON.stringify(built.flatMap(r => r.errors)));
  assert.equal(built[0].fixture.date, '2026-09-12', 'Excel serial converted');
  assert.deepEqual(built.map(r => r.fixture.opposition),
    ['Riverside Rovers', 'Northside', 'Eastfield', 'Westgate', 'Southbank']);
});

test('spreadsheet formulas are never evaluated — only the cached value is read', async () => {
  const sheet = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Opposition</t></is></c></row>
    <row r="2"><c r="A2" t="str"><f>CONCATENATE("HACK","ED")</f><v>Safe Value</v></c></row>
  </sheetData></worksheet>`;
  const rows = await parseXlsx(buildXlsx(sheet, '<sst/>'), nodeInflateRaw);
  assert.deepEqual(rows[1], ['Safe Value'], 'cached value used, formula ignored');
  assert.equal(JSON.stringify(rows).includes('CONCATENATE'), false, 'formula text never surfaces');
});

test('malformed and non-spreadsheet files fail safely with a clear message', async () => {
  await assert.rejects(() => parseXlsx(new Uint8Array([1, 2, 3, 4, 5]), nodeInflateRaw), /not a valid \.xlsx/i);
  const notZip = new TextEncoder().encode('opponent,date\nRovers,2026-01-01');
  await assert.rejects(() => parseXlsx(notZip, nodeInflateRaw), /not a valid \.xlsx/i);
});

// ── Server: permissions, isolation, duplicates, downstream protection ───────
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.fixtures.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET')  r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'EXPIRE' || c === 'LPUSH' || c === 'LTRIM') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { default: publish } = await import('../api/publish.js');
const { SESSION_COOKIE } = store;

function res() { return { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader(){}, end(){ return this; } }; }
async function call(method, body, cookie) {
  const r = res();
  await publish({ method, query: { resource: 'fixtures' }, headers: cookie ? { cookie } : {}, body: body || {} }, r);
  return r;
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
const audits = () => { try { return JSON.parse(kv.get('app:identity:audit_log') || '[]'); } catch { return []; } };

let _t = 0;
async function club(label) {
  return store.createClub({ clubName: `${label} RFC`, teamName: 'Seniors', sport: 'rugby', name: `${label} Owner`, email: `o${++_t}@fx.test`, password: 'password123' });
}
async function joinPlayer(teamId, name) {
  const token = 'TK' + String(++_t).padStart(8, '0');
  const email = `u${_t}@fx.test`;
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token, email, name, role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  return store.claimInvite({ token, email, name, password: 'password123' });
}
async function staff(teamId, name, accessProfile) {
  const p = await joinPlayer(teamId, name);
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  const m = members.find(x => x.userId === p.user.id && x.teamId === teamId);
  m.role = 'coach';
  m.staffLevel = accessProfile === 'manager' ? 'manager' : accessProfile === 'coach' ? 'assistant' : 'head';
  m.accessProfile = accessProfile;
  kv.set('app:identity:team_members', JSON.stringify(members));
  return { ...p, session: await store.createSession({ userId: p.user.id, teamId, role: 'coach' }) };
}
async function medicalStaff(teamId, name) {
  const p = await joinPlayer(teamId, name);
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  members.find(x => x.userId === p.user.id && x.teamId === teamId).role = 'medical';
  kv.set('app:identity:team_members', JSON.stringify(members));
  return { ...p, session: await store.createSession({ userId: p.user.id, teamId, role: 'medical' }) };
}
const FX = (over = {}) => ({ opposition: 'Riverside Rovers', date: '2026-09-12', time: '15:00', homeAway: 'home', venue: 'Memorial Ground', competition: 'Div 2', ...over });

test('a manual fixture is created and immediately readable', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const created = await call('POST', { action: 'create', fixture: FX() }, ck(A.session));
  assert.equal(created.statusCode, 201, JSON.stringify(created.body));
  assert.equal(created.body.fixture.opposition, 'Riverside Rovers');
  assert.equal(created.body.fixture.status, 'scheduled');
  const list = await call('GET', null, ck(A.session));
  assert.equal(list.body.count, 1);
  assert.equal(list.body.fixtures[0].venue, 'Memorial Ground');
});

test('required-field validation rejects a missing opponent or bad date/time', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  assert.equal((await call('POST', { action: 'create', fixture: FX({ opposition: '' }) }, ck(A.session))).statusCode, 400);
  assert.equal((await call('POST', { action: 'create', fixture: FX({ date: 'not-a-date' }) }, ck(A.session))).statusCode, 400);
  assert.equal((await call('POST', { action: 'create', fixture: FX({ time: '25:99' }) }, ck(A.session))).statusCode, 400);
  assert.equal((await call('GET', null, ck(A.session))).body.count, 0, 'nothing was written');
});

test('a repeated manual submit does not create a duplicate', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const first = await call('POST', { action: 'create', fixture: FX() }, ck(A.session));
  assert.equal(first.statusCode, 201);
  const again = await call('POST', { action: 'create', fixture: FX() }, ck(A.session));
  assert.equal(again.statusCode, 409, 'second identical submit is refused');
  assert.equal((await call('GET', null, ck(A.session))).body.count, 1);
});

test('access profiles: Full/Coach/Manager may create; players and medical may not', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const full = await staff(A.team.id, 'Full', 'full');
  const coach = await staff(A.team.id, 'Coach', 'coach');
  const manager = await staff(A.team.id, 'Manager', 'manager');
  const medic = await medicalStaff(A.team.id, 'Physio');
  const player = await joinPlayer(A.team.id, 'Player');

  let n = 0;
  for (const [label, actor] of [['full', full], ['coach', coach], ['manager', manager]]) {
    const r = await call('POST', { action: 'create', fixture: FX({ opposition: `Team ${++n}` }) }, ck(actor.session));
    assert.equal(r.statusCode, 201, `${label} may create: ${JSON.stringify(r.body)}`);
  }
  for (const [label, actor] of [['medical', medic], ['player', player]]) {
    const r = await call('POST', { action: 'create', fixture: FX({ opposition: 'Blocked' }) }, ck(actor.session));
    assert.equal(r.statusCode, 403, `${label} may NOT create (got ${r.statusCode})`);
    const imp = await call('POST', { action: 'import', confirmed: true, fixtures: [{ fixture: FX() }] }, ck(actor.session));
    assert.equal(imp.statusCode, 403, `${label} may NOT import`);
  }
  // Players may still VIEW the fixture list.
  assert.equal((await call('GET', null, ck(player.session))).statusCode, 200);
});

test('import requires explicit confirmation and writes nothing before it', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const unconfirmed = await call('POST', { action: 'import', fixtures: [{ fixture: FX() }] }, ck(A.session));
  assert.equal(unconfirmed.statusCode, 400);
  assert.match(unconfirmed.body.error, /confirmed after review/i);
  assert.equal((await call('GET', null, ck(A.session))).body.count, 0, 'no fixtures written');
});

test('a five-fixture CSV import commits and refreshes the list', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const rows = rowsFromCsv(CSV_FIVE).map(r => ({ fixture: r.fixture, decision: 'new' }));
  const imported = await call('POST', { action: 'import', confirmed: true, fixtures: rows }, ck(A.session));
  assert.equal(imported.statusCode, 200, JSON.stringify(imported.body));
  assert.equal(imported.body.summary.imported, 5);
  const list = await call('GET', null, ck(A.session));
  assert.equal(list.body.count, 5);
  assert.equal(list.body.fixtures[2].homeAway, 'neutral');
});

test('duplicate rows can be skipped, updated, or imported as new', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  await call('POST', { action: 'create', fixture: FX({ venue: 'Old Ground' }) }, ck(A.session));

  const skip = await call('POST', { action: 'import', confirmed: true, fixtures: [{ fixture: FX(), decision: 'skip' }] }, ck(A.session));
  assert.equal(skip.body.summary.skipped, 1);
  assert.equal((await call('GET', null, ck(A.session))).body.fixtures[0].venue, 'Old Ground');

  const update = await call('POST', { action: 'import', confirmed: true, fixtures: [{ fixture: FX({ venue: 'New Ground' }), decision: 'update' }] }, ck(A.session));
  assert.equal(update.body.summary.updated, 1);
  const afterUpdate = await call('GET', null, ck(A.session));
  assert.equal(afterUpdate.body.count, 1, 'update did not add a second row');
  assert.equal(afterUpdate.body.fixtures[0].venue, 'New Ground');

  const asNew = await call('POST', { action: 'import', confirmed: true, fixtures: [{ fixture: FX(), decision: 'new', allowDuplicate: true }] }, ck(A.session));
  assert.equal(asNew.body.summary.imported, 1);
  assert.equal((await call('GET', null, ck(A.session))).body.count, 2);

  // Without allowDuplicate a matching row is skipped, never silently doubled.
  const guarded = await call('POST', { action: 'import', confirmed: true, fixtures: [{ fixture: FX(), decision: 'new' }] }, ck(A.session));
  assert.equal(guarded.body.summary.skipped, 1);
});

test('a fixture with downstream data is never silently overwritten', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const created = await call('POST', { action: 'create', fixture: FX({ notes: 'Team talk 14:15' }) }, ck(A.session));
  const id = created.body.fixture.id;
  // Mark it completed and give it appearance history.
  const clubRec = JSON.parse(kv.get(`app:club:${A.team.id}`));
  clubRec.fixtures[0].status = 'completed';
  kv.set(`app:club:${A.team.id}`, JSON.stringify(clubRec));
  kv.set(`app:appearance_adj:${A.team.id}`, JSON.stringify([{ id: 'a1', fixtureId: id, amount: 1 }]));

  const attempt = await call('POST', { action: 'import', confirmed: true,
    fixtures: [{ fixture: FX({ venue: 'Overwritten' }), decision: 'update' }] }, ck(A.session));
  assert.equal(attempt.body.summary.blocked, 1, JSON.stringify(attempt.body));
  assert.match(attempt.body.details[0].reason, /completed status|appearance history|notes/);
  const after = await call('GET', null, ck(A.session));
  assert.equal(after.body.fixtures[0].venue, 'Memorial Ground', 'original preserved');
  assert.equal(after.body.fixtures[0].status, 'completed', 'completed status preserved');
});

test('completed status and notes survive the club-config round trip', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const created = await call('POST', { action: 'create', fixture: FX({ notes: 'Meet at 13:00', externalId: 'EXT-9' }) }, ck(A.session));
  const clubRec = JSON.parse(kv.get(`app:club:${A.team.id}`));
  clubRec.fixtures[0].status = 'completed';
  kv.set(`app:club:${A.team.id}`, JSON.stringify(clubRec));

  // Re-save the club config exactly as the client does.
  const r = res();
  await publish({ method: 'POST', query: { resource: 'club' }, headers: { cookie: ck(A.session) },
    body: { club: { clubName: 'Alpha RFC', fixtures: JSON.parse(kv.get(`app:club:${A.team.id}`)).fixtures } } }, r);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const after = await call('GET', null, ck(A.session));
  assert.equal(after.body.fixtures[0].status, 'completed', 'status is no longer dropped');
  assert.equal(after.body.fixtures[0].notes, 'Meet at 13:00');
  assert.equal(after.body.fixtures[0].externalId, 'EXT-9');
  assert.equal(created.body.fixture.id, after.body.fixtures[0].id, 'id is stable');
});

test('cross-club import is denied and leaves the other club untouched', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const B = await club('Bravo');
  await call('POST', { action: 'create', fixture: FX({ opposition: 'Bravo Opponent' }) }, ck(B.session));

  // Naming another club's team is rejected outright.
  const spoof = await call('POST', { action: 'create', fixture: FX(), teamId: B.team.id }, ck(A.session));
  assert.equal(spoof.statusCode, 403, JSON.stringify(spoof.body));
  const spoofImport = await call('POST', { action: 'import', confirmed: true, teamId: B.team.id, fixtures: [{ fixture: FX() }] }, ck(A.session));
  assert.equal(spoofImport.statusCode, 403);

  // A's own import lands only in A.
  await call('POST', { action: 'import', confirmed: true, fixtures: [{ fixture: FX({ opposition: 'Alpha Opponent' }), decision: 'new' }] }, ck(A.session));
  const bList = await call('GET', null, ck(B.session));
  assert.equal(bList.body.count, 1);
  assert.equal(bList.body.fixtures[0].opposition, 'Bravo Opponent', "club B unchanged");
});

test('oversized imports are rejected clearly', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const many = Array.from({ length: 250 }, (_, i) => ({ fixture: FX({ opposition: `Team ${i}` }), decision: 'new' }));
  const r = await call('POST', { action: 'import', confirmed: true, fixtures: many }, ck(A.session));
  assert.equal(r.statusCode, 413);
  assert.match(r.body.error, /at most/i);
  assert.equal((await call('GET', null, ck(A.session))).body.count, 0, 'nothing partially written');
});

test('rows that fail validation do not abort the rest of the import', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const r = await call('POST', { action: 'import', confirmed: true, fixtures: [
    { fixture: FX({ opposition: 'Good One' }), decision: 'new' },
    { fixture: FX({ opposition: '' }), decision: 'new' },
    { fixture: FX({ opposition: 'Good Two', date: '2026-10-01' }), decision: 'new' },
  ] }, ck(A.session));
  assert.equal(r.body.summary.imported, 2);
  assert.equal(r.body.summary.errors, 1);
  const list = await call('GET', null, ck(A.session));
  assert.equal(list.body.count, 2, 'valid rows committed, invalid row skipped');
});

test('fixture creation and import are audited', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  await call('POST', { action: 'create', fixture: FX() }, ck(A.session));
  await call('POST', { action: 'import', confirmed: true, fixtures: [{ fixture: FX({ opposition: 'Imported' }), decision: 'new' }] }, ck(A.session));
  const created = audits().find(e => e.event === 'fixture_created');
  const imported = audits().find(e => e.event === 'fixtures_imported');
  assert.ok(created, 'manual creation audited');
  assert.equal(created.teamId, A.team.id);
  assert.equal(created.createdBy, A.user.id);
  assert.ok(imported, 'import audited');
  assert.equal(imported.imported, 1);
  assert.equal(imported.importedBy, A.user.id);
});

// ── Client surface ──────────────────────────────────────────────────────────
test('Overview offers fixture entry and both importers, gated on the fixtures permission', () => {
  // These lived on renderOverviewFixturesCard until the Overview command
  // centre replaced it. Entry and the two importers moved to Quick actions and
  // the fixture itself is now a card; what this test protects is unchanged —
  // a coach can still start a fixture and import a season list FROM the
  // Overview, and only with manage_fixtures.
  const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const qa = src.slice(src.indexOf('function renderOverviewQuickActions'));
  const fn = qa.slice(0, qa.indexOf('\n    }') + 6);

  assert.match(fn, /fixtureAddOpen\(\)/, 'Add fixture action');
  assert.match(fn, /fixtureImportOpen\('csv'\)/, 'Import CSV action');
  assert.match(fn, /fixtureImportOpen\('xlsx'\)/, 'Import Excel action');
  assert.match(fn, /canI\('manage_fixtures'\)/, 'actions gated on the fixtures permission, matching the API');

  // The fixture card carries the destination and the empty state.
  const card = src.slice(src.indexOf('function renderClubCommandDashboard'));
  assert.match(card, /setSection\('coach','(fixtures|matchday)'\)/, 'fixture card routes to the fixture screens');
  assert.match(card, /No fixture scheduled/i, 'empty state');
});
