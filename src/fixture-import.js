// src/fixture-import.js — pure fixture-import helpers (RC4.10B).
//
// Shared by the browser import wizard and the server commit endpoint so both
// interpret a spreadsheet identically. Everything here is pure: no I/O, no
// storage, no formula evaluation. Cell FORMULAS are never read or executed —
// only cached values and shared strings — so a spreadsheet cannot compute
// anything during import.

export const FIXTURE_TARGET_FIELDS = [
  'team', 'opponent', 'date', 'time', 'home_away', 'venue',
  'competition', 'arrival_time', 'notes', 'external_id',
];

// Header aliases, normalised (lowercase, non-alphanumerics stripped).
const HEADER_ALIASES = {
  team:         ['team', 'squad', 'ourteam', 'teamname'],
  opponent:     ['opponent', 'opposition', 'opponents', 'versus', 'vs', 'against'],
  date:         ['date', 'matchdate', 'fixturedate', 'day'],
  time:         ['time', 'kickoff', 'kickofftime', 'ko', 'start', 'starttime'],
  home_away:    ['homeaway', 'hometeamaway', 'venuetype', 'h a', 'ha', 'homeoraway', 'location type'],
  venue:        ['venue', 'ground', 'pitch', 'place', 'location'],
  competition:  ['competition', 'league', 'cup', 'comp', 'tournament'],
  arrival_time: ['arrivaltime', 'arrive', 'arrival', 'meettime', 'meetingtime'],
  notes:        ['notes', 'note', 'comments', 'remarks', 'info'],
  external_id:  ['externalid', 'id', 'ref', 'reference', 'fixtureid', 'externalref'],
};

const normaliseHeader = h => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Suggest a target field for each incoming column header. */
export function autoMapColumns(headers = []) {
  const mapping = {};
  const taken = new Set();
  headers.forEach((header, index) => {
    const norm = normaliseHeader(header);
    if (!norm) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (taken.has(field)) continue;
      if (aliases.some(a => normaliseHeader(a) === norm)) {
        mapping[index] = field;
        taken.add(field);
        return;
      }
    }
  });
  return mapping;
}

// ── CSV ─────────────────────────────────────────────────────────────────────
/** RFC4180-ish CSV parser: quoted fields, escaped quotes, CRLF, embedded commas. */
export function parseCsv(text = '') {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const src = String(text).replace(/^﻿/, '');   // strip BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => String(cell).trim() !== ''));
}

// ── Dates ───────────────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');
const isRealDate = (y, m, d) => {
  if (!(y >= 1900 && y <= 2999 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/**
 * Interpret a date cell.
 * Returns { iso, ambiguous, alternative, raw, error }.
 * A day/month pair that is valid BOTH ways (e.g. 04/05/2026) is flagged
 * `ambiguous` with the alternative reading — never silently guessed.
 * `dayFirst` reflects the club locale (true for en-GB style clubs).
 */
export function parseDateCell(value, { dayFirst = true } = {}) {
  const raw = value;
  // Excel-native date cells arrive as a serial number (1900 date system).
  if (typeof value === 'number' && Number.isFinite(value)) return excelSerialToIso(value);
  const text = String(value ?? '').trim();
  if (!text) return { iso: '', ambiguous: false, raw, error: 'missing date' };

  // Already ISO.
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isRealDate(y, mo, d)
      ? { iso: `${y}-${pad(mo)}-${pad(d)}`, ambiguous: false, raw }
      : { iso: '', ambiguous: false, raw, error: `not a real date: ${text}` };
  }
  // A pure number in text form is still an Excel serial.
  if (/^\d+(\.\d+)?$/.test(text)) return excelSerialToIso(Number(text));

  // DD/MM/YYYY or DD-MM-YYYY (and the US transposition).
  m = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    const dayFirstValid = isRealDate(year, b, a);   // a=day,  b=month
    const monthFirstValid = isRealDate(year, a, b); // a=month,b=day
    if (!dayFirstValid && !monthFirstValid) return { iso: '', ambiguous: false, raw, error: `not a real date: ${text}` };
    if (dayFirstValid && monthFirstValid && a !== b) {
      const primary = dayFirst ? `${year}-${pad(b)}-${pad(a)}` : `${year}-${pad(a)}-${pad(b)}`;
      const alternative = dayFirst ? `${year}-${pad(a)}-${pad(b)}` : `${year}-${pad(b)}-${pad(a)}`;
      return { iso: primary, alternative, ambiguous: true, raw };
    }
    const iso = dayFirstValid ? `${year}-${pad(b)}-${pad(a)}` : `${year}-${pad(a)}-${pad(b)}`;
    return { iso, ambiguous: false, raw };
  }
  return { iso: '', ambiguous: false, raw, error: `unrecognised date: ${text}` };
}

/** Excel 1900 serial → ISO. Accounts for Excel's fictional 1900-02-29. */
export function excelSerialToIso(serial) {
  const n = Math.floor(Number(serial));
  if (!Number.isFinite(n) || n <= 0 || n > 80000) {
    return { iso: '', ambiguous: false, raw: serial, error: `unrecognised date: ${serial}` };
  }
  const days = n > 59 ? n - 1 : n;                       // skip the phantom leap day
  const ms = Date.UTC(1899, 11, 31) + days * 86400000;
  const d = new Date(ms);
  return { iso: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, ambiguous: false, raw: serial };
}

/** Interpret a time cell: "19:30", "7.30pm", "1930", or an Excel day fraction. */
export function parseTimeCell(value) {
  if (value === null || value === undefined || value === '') return { time: '', error: null };
  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1) {
    const mins = Math.round(value * 24 * 60);
    return { time: `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`, error: null };
  }
  const text = String(value).trim().toLowerCase();
  if (!text) return { time: '', error: null };
  let m = text.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/);
  if (m) {
    let h = Number(m[1]); const mi = Number(m[2]);
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    if (h > 23 || mi > 59) return { time: '', error: `invalid time: ${value}` };
    return { time: `${pad(h)}:${pad(mi)}`, error: null };
  }
  m = text.match(/^(\d{1,2})\s*(am|pm)$/);
  if (m) {
    let h = Number(m[1]);
    if (m[2] === 'pm' && h < 12) h += 12;
    if (m[2] === 'am' && h === 12) h = 0;
    return h <= 23 ? { time: `${pad(h)}:00`, error: null } : { time: '', error: `invalid time: ${value}` };
  }
  m = text.match(/^(\d{3,4})$/);
  if (m) {
    const digits = m[1].padStart(4, '0');
    const h = Number(digits.slice(0, 2)), mi = Number(digits.slice(2));
    if (h > 23 || mi > 59) return { time: '', error: `invalid time: ${value}` };
    return { time: `${pad(h)}:${pad(mi)}`, error: null };
  }
  return { time: '', error: `invalid time: ${value}` };
}

export function parseHomeAway(value) {
  const t = String(value ?? '').trim().toLowerCase();
  if (!t) return '';
  if (['h', 'home', 'hom'].includes(t)) return 'home';
  if (['a', 'away', 'aw'].includes(t)) return 'away';
  if (['n', 'neutral', 'neut'].includes(t)) return 'neutral';
  return '';
}

// ── Row validation ──────────────────────────────────────────────────────────
/**
 * Turn raw rows + a column mapping into reviewable fixtures.
 * Nothing is written anywhere — this only produces a preview for confirmation.
 */
export function buildImportRows(rows = [], mapping = {}, { dayFirst = true, defaultTeam = '' } = {}) {
  const [, ...body] = rows;
  return body.map((cells, i) => {
    const get = field => {
      const idx = Object.keys(mapping).find(k => mapping[k] === field);
      return idx === undefined ? '' : cells[Number(idx)];
    };
    const errors = [];
    const warnings = [];

    const opponent = String(get('opponent') ?? '').trim();
    if (!opponent) errors.push('opponent is required');

    const dateResult = parseDateCell(get('date'), { dayFirst });
    if (dateResult.error) errors.push(dateResult.error);
    if (dateResult.ambiguous) warnings.push(`ambiguous date — read as ${dateResult.iso} (could be ${dateResult.alternative})`);

    const timeResult = parseTimeCell(get('time'));
    if (timeResult.error) errors.push(timeResult.error);
    const arrival = parseTimeCell(get('arrival_time'));
    if (arrival.error) warnings.push(arrival.error);

    const homeAwayRaw = get('home_away');
    const homeAway = parseHomeAway(homeAwayRaw);
    if (String(homeAwayRaw ?? '').trim() && !homeAway) warnings.push(`unrecognised home/away: ${homeAwayRaw}`);

    return {
      rowNumber: i + 2,                     // 1-based, allowing for the header row
      fixture: {
        team:        String(get('team') ?? '').trim() || defaultTeam,
        opposition:  opponent,
        date:        dateResult.iso,
        time:        timeResult.time,
        homeAway,
        venue:       String(get('venue') ?? '').trim(),
        competition: String(get('competition') ?? '').trim(),
        arrivalTime: arrival.time,
        notes:       String(get('notes') ?? '').trim(),
        externalId:  String(get('external_id') ?? '').trim(),
        status:      'scheduled',
      },
      errors,
      warnings,
      ambiguousDate: Boolean(dateResult.ambiguous),
      dateAlternative: dateResult.alternative || '',
      confirmed: false,       // ambiguous rows must be explicitly confirmed
    };
  });
}

// ── Duplicates ──────────────────────────────────────────────────────────────
const norm = v => String(v ?? '').trim().toLowerCase();
const dupKey = fx => [norm(fx.team), norm(fx.opposition), norm(fx.date), norm(fx.homeAway)].join('|');

/**
 * Match an incoming fixture against existing ones: external_id first, then
 * team + opponent + date + home/away, with kick-off time as a tie-breaker.
 * A MISSING kick-off on either side is treated as a wildcard — a spreadsheet
 * that omits the time must still be recognised as the same fixture, or the
 * import would quietly create a second copy of a match that already exists.
 */
export function findDuplicate(candidate, existing = []) {
  const ext = String(candidate.externalId || '').trim();
  if (ext) {
    const byExt = existing.find(f => String(f.externalId || '').trim() && String(f.externalId).trim() === ext);
    if (byExt) return { match: byExt, reason: 'external_id' };
  }
  const key = dupKey(candidate);
  const candidateTime = norm(candidate.time);
  const sameSlot = existing.filter(f => dupKey(f) === key);
  if (!sameSlot.length) return null;
  const exactTime = sameSlot.find(f => norm(f.time) === candidateTime);
  if (exactTime) return { match: exactTime, reason: 'team + opponent + date + kick-off + home/away' };
  // Same slot but one side has no kick-off recorded — still a likely duplicate.
  const wildcard = sameSlot.find(f => !norm(f.time) || !candidateTime);
  if (wildcard) return { match: wildcard, reason: 'team + opponent + date + home/away (kick-off missing)' };
  return null;
}

/** Duplicates WITHIN the file itself, so one import cannot insert the same
 *  fixture twice. */
export function findInternalDuplicates(rows = []) {
  const seen = new Map();
  const dupes = [];
  rows.forEach((row, i) => {
    if (row.errors?.length) return;
    const key = dupKey(row.fixture);
    if (seen.has(key)) dupes.push({ index: i, firstIndex: seen.get(key) });
    else seen.set(key, i);
  });
  return dupes;
}

export const CSV_TEMPLATE =
  'date,time,team,opponent,home_away,venue,competition,arrival_time,notes,external_id\n' +
  '2026-09-12,15:00,1st XV,Riverside Rovers,home,Memorial Ground,League Division 2,13:45,Bring both jerseys,RIV-2026-01\n';
