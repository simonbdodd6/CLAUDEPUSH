/**
 * Rugby Directory Provider
 *
 * Reads pre-downloaded rugby directory files from qa/market-input/directories/.
 *
 * Supported formats (auto-detected by file extension):
 *   .json   — array of objects with any recognisable field names
 *   .csv    — CSV with recognisable column headers
 *   .html   — basic HTML extraction (tables, lists with rugby-club-like content)
 *   .txt    — line-separated "Club Name, Country" or structured plain text
 *
 * This is NOT live scraping. Drop files here manually, then run discovery.
 *
 * How to use:
 *   1. Visit a rugby club directory (e.g., IRFU clubs page)
 *   2. Save the page as HTML (or copy data as JSON/CSV)
 *   3. Save to qa/market-input/directories/your-filename.html
 *   4. Run: node qa/discovery/discovery.js
 *
 * Options:
 *   dir: string — override input directory
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../');
const DEFAULT_DIR = join(ROOT, 'qa/market-input/directories');

const SUPPORTED = new Set(['.json', '.csv', '.html', '.htm', '.txt']);

// CSV column aliases (same as csv-provider for consistency)
const CSV_ALIASES = {
  club_name: 'clubName', name: 'clubName', club: 'clubName',
  country: 'country', city: 'city', town: 'city',
  website: 'website', url: 'website',
  email: 'email',
  facebook: 'facebook', instagram: 'instagram',
  level: 'level', league: 'league', division: 'league',
};

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim() && !l.startsWith('#'));
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, i) => { row[CSV_ALIASES[h] ?? h] = vals[i] ?? ''; });
    return row;
  });
}

function extractFromHTML(html) {
  // Strip scripts, styles, comments
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  const clubs = [];
  // Simple heuristic: lines containing "RFC", "FC", "Rugby Club", "Rugby Union"
  const lines = cleaned.split(/[.;\n]/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 5 || trimmed.length > 200) continue;
    if (!/\b(rfc|fc|rugby club|rugby union|rugby football club)\b/i.test(trimmed)) continue;
    // Extract a club name candidate (first capitalised phrase up to the keyword)
    const match = trimmed.match(/([A-Z][A-Za-z\s\-'&]+(?:RFC|FC|Rugby Club|Rugby Union|Rugby Football Club))/);
    if (match) clubs.push({ clubName: match[1].trim(), country: '', source_hint: 'html-extract' });
  }
  return clubs;
}

function extractFromTxt(text) {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(line => {
      const parts = line.split(',').map(p => p.trim());
      return {
        clubName: parts[0] || '',
        country: parts[1] || '',
        city: parts[2] || null,
      };
    })
    .filter(r => r.clubName);
}

export async function* provide({ dir = DEFAULT_DIR } = {}) {
  let files;
  try {
    files = readdirSync(dir).filter(f => {
      const ext = extname(f).toLowerCase();
      return SUPPORTED.has(ext) && !f.startsWith('_');
    });
  } catch {
    return;
  }

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const filePath = join(dir, file);
    const source = `rugby-directory:${basename(file)}`;
    let records = [];

    try {
      const content = readFileSync(filePath, 'utf8');

      if (ext === '.json') {
        let parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) parsed = [parsed];
        records = parsed;
      } else if (ext === '.csv') {
        records = parseCSV(content);
      } else if (ext === '.html' || ext === '.htm') {
        records = extractFromHTML(content);
      } else if (ext === '.txt') {
        records = extractFromTxt(content);
      }
    } catch (err) {
      console.warn(`  rugby-directory-provider: error reading ${file}: ${err.message}`);
      continue;
    }

    for (const rec of records) {
      const name = rec.clubName || rec.name || rec.club || '';
      if (!name) continue;
      yield {
        clubName: name,
        country: rec.country || '',
        city: rec.city || rec.town || null,
        website: rec.website || rec.url || null,
        email: rec.email || null,
        facebook: rec.facebook || null,
        instagram: rec.instagram || null,
        level: rec.level || '',
        league: rec.league || rec.division || null,
        notes: rec.notes || '',
        source,
      };
    }
  }
}

export const meta = {
  name: 'rugby-directory-provider',
  displayName: 'Rugby Directory',
  description: 'Reads pre-downloaded directory files (JSON/CSV/HTML/TXT) from qa/market-input/directories/',
  inputDir: 'qa/market-input/directories/',
  supportedFormats: ['.json', '.csv', '.html', '.txt'],
};
