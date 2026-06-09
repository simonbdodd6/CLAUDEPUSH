/**
 * Normalization layer for Discovery Agent.
 *
 * Two levels:
 *   - Display normalization: human-readable, preserves character accents.
 *   - Match key: aggressive stripping used for deduplication only.
 */

// Canonical country names. Covers the most common aliases in rugby club data.
const COUNTRY_ALIASES = {
  'united kingdom': 'England', uk: 'England',
  'great britain': 'England', britain: 'England',
  'northern ireland': 'Northern Ireland',
  'republic of ireland': 'Ireland', ire: 'Ireland', roi: 'Ireland',
  'new zealand': 'New Zealand', nz: 'New Zealand', nzl: 'New Zealand',
  'south africa': 'South Africa', rsa: 'South Africa', 'south african': 'South Africa',
  aus: 'Australia', au: 'Australia',
  arg: 'Argentina',
  jpn: 'Japan',
  ita: 'Italy',
  fra: 'France',
  eng: 'England',
  sco: 'Scotland',
  wal: 'Wales',
  usa: 'United States', 'united states of america': 'United States',
  can: 'Canada',
  uru: 'Uruguay',
  geo: 'Georgia',
  rom: 'Romania', rou: 'Romania',
  esp: 'Spain',
  por: 'Portugal',
};

// Suffixes stripped from club names when building a match key.
const CLUB_SUFFIXES = /\s+(rfc|fc|ru|rfc|afc|rugby football club|rugby club|rugby union|sporting club|sc|ac|afc|cf)\s*$/i;

// Diacritic → ASCII map for match key generation.
const DIACRITIC_MAP = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a', æ: 'ae',
  ç: 'c', è: 'e', é: 'e', ê: 'e', ë: 'e', ì: 'i', í: 'i',
  î: 'i', ï: 'i', ñ: 'n', ò: 'o', ó: 'o', ô: 'o', õ: 'o',
  ö: 'o', ø: 'o', ù: 'u', ú: 'u', û: 'u', ü: 'u', ý: 'y',
};

export function normalizeCountry(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  return COUNTRY_ALIASES[s] ?? raw.trim().replace(/\b\w/g, c => c.toUpperCase());
}

export function normalizeClubName(raw) {
  if (!raw) return null;
  return raw.trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function clubMatchKey(name, country) {
  const stripDiacritics = s => [...s].map(c => DIACRITIC_MAP[c] ?? c).join('');
  const n = stripDiacritics((name || '').toLowerCase())
    .replace(CLUB_SUFFIXES, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const c = stripDiacritics((country || '').toLowerCase()).trim();
  return `${n}::${c}`;
}

export function normalizeURL(raw) {
  if (!raw || !raw.trim()) return null;
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    // Remove trailing slash on path
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname.replace(/\/$/, '') || ''}`;
  } catch {
    return null;
  }
}

export function normalizeDomain(url) {
  if (!url) return null;
  try {
    return new URL(normalizeURL(url)).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeEmail(raw) {
  if (!raw || !raw.trim()) return null;
  const e = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export function normalizeSocialURL(raw) {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  // Accept bare handles and full URLs
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('@')) return s;
  return s;
}

export function normalizeLevel(raw) {
  const s = (raw || '').toLowerCase().trim();
  if (/adult|amateur|club(?!\s*de)/.test(s)) return 'adult_amateur';
  if (/youth|junior|u\d|under/.test(s)) return 'youth';
  if (/semi|semipro/.test(s)) return 'semi_pro';
  if (/pro(?:fessional)?|premier|elite|superliga/.test(s)) return 'professional';
  return 'unknown';
}

/**
 * Normalize a raw provider record into a canonical DiscoveryRecord shape.
 * Does not write to any database — pure transformation.
 */
export function normalizeRecord(raw) {
  const clubName = normalizeClubName(raw.clubName || raw.name || raw.club || '');
  const country = normalizeCountry(raw.country);
  const website = normalizeURL(raw.website || raw.url || raw.site);
  const email = normalizeEmail(raw.email || raw.contact_email || raw.email_address);
  const facebook = normalizeSocialURL(raw.facebook || raw.social_facebook || raw.fb);
  const instagram = normalizeSocialURL(raw.instagram || raw.social_instagram || raw.ig);
  const level = normalizeLevel(raw.level || raw.tier || '');

  return {
    // Identity
    clubName,
    country: country || 'Unknown',
    city: raw.city ? raw.city.trim() : null,

    // Contact
    website,
    websiteDomain: normalizeDomain(website),
    email,
    facebook,
    instagram,

    // Classification
    league: raw.league ? raw.league.trim() : null,
    level,

    // Provenance (filled by engine)
    source: raw.source || 'unknown',
    providers: raw.providers || [raw.source || 'unknown'],
    rawData: [raw],

    // Match keys (used by deduplicator)
    _matchKey: clubMatchKey(clubName, country),

    // Quality (filled by confidence.js)
    confidence: null,
    confidenceFactors: [],

    // Dedup status (filled by deduplicate.js)
    isDuplicate: false,
    duplicateOf: null,
  };
}
