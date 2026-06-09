/**
 * CSV Provider
 *
 * Yields discovery records from CSV files in qa/market-input/csv/.
 *
 * Accepts flexible column names — see ALIASES below.
 * Skips files named clubs-template.csv and files starting with _.
 *
 * Options:
 *   dir: string   — override CSV directory path
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../');
const DEFAULT_DIR = join(ROOT, 'qa/market-input/csv');

const ALIASES = {
  club_name: 'clubName', name: 'clubName', club: 'clubName',
  country: 'country',
  city: 'city', town: 'city',
  website: 'website', url: 'website', site: 'website',
  email: 'email', email_address: 'email', contact_email: 'email',
  social_facebook: 'facebook', facebook: 'facebook', fb: 'facebook',
  social_instagram: 'instagram', instagram: 'instagram', ig: 'instagram',
  level: 'level', tier: 'level',
  league: 'league', division: 'league',
  notes: 'notes', comment: 'notes',
};

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const dataLines = lines.filter(l => l.trim() && !l.startsWith('#'));
  if (dataLines.length < 2) return [];

  const headers = dataLines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  return dataLines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, i) => {
      const canonical = ALIASES[h] ?? h;
      row[canonical] = vals[i] ?? '';
    });
    return row;
  }).filter(row => Object.values(row).some(v => v));
}

export async function* provide({ dir = DEFAULT_DIR } = {}) {
  let files;
  try {
    files = readdirSync(dir).filter(f =>
      f.endsWith('.csv') &&
      !f.startsWith('clubs-template') &&
      !f.startsWith('_')
    );
  } catch {
    return; // directory doesn't exist yet — silently yield nothing
  }

  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8');
    const rows = parseCSV(text);
    for (const row of rows) {
      if (!row.clubName && !row.name) continue;
      yield {
        clubName: row.clubName || row.name || '',
        country: row.country || '',
        city: row.city || null,
        website: row.website || null,
        email: row.email || null,
        facebook: row.facebook || null,
        instagram: row.instagram || null,
        level: row.level || '',
        league: row.league || null,
        notes: row.notes || '',
        source: `csv:${basename(file)}`,
      };
    }
  }
}

export const meta = {
  name: 'csv-provider',
  displayName: 'CSV Import',
  description: 'Reads CSV files from qa/market-input/csv/',
  inputDir: 'qa/market-input/csv/',
  templateFile: 'qa/market-input/csv/clubs-template.csv',
};
