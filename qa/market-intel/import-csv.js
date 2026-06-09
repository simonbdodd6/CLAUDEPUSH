import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLeads, saveLeads, upsertLead } from './lead-db.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../');
const CSV_DIR = join(ROOT, 'qa/market-input/csv');

// Maps various CSV header spellings to canonical lead fields
const ALIASES = {
  club_name: 'clubName', name: 'clubName', club: 'clubName',
  country: 'country',
  website: 'website', url: 'website', site: 'website',
  email: 'email', email_address: 'email', contact_email: 'email',
  phone: 'phone', tel: 'phone',
  social_facebook: 'socialFacebook', facebook: 'socialFacebook', fb: 'socialFacebook',
  social_instagram: 'socialInstagram', instagram: 'socialInstagram', ig: 'socialInstagram',
  level: 'level', tier: 'level',
  notes: 'notes', comment: 'notes',
  estimated_players: 'estimatedPlayers', players: 'estimatedPlayers',
};

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmpty = lines.filter(l => l.trim() && !l.startsWith('#'));
  if (nonEmpty.length < 2) return [];

  const headers = nonEmpty[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  return nonEmpty.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((header, i) => {
      const canonical = ALIASES[header] ?? header;
      row[canonical] = vals[i] ?? '';
    });
    return row;
  }).filter(row => Object.values(row).some(v => v));
}

function normaliseLevel(raw) {
  const s = (raw || '').toLowerCase().trim();
  if (/adult|amateur|club/.test(s)) return 'adult_amateur';
  if (/youth|junior|u\d/.test(s)) return 'youth';
  if (/semi|semipro/.test(s)) return 'semi_pro';
  if (/pro|professional|premier|elite/.test(s)) return 'professional';
  return 'unknown';
}

export function importCSVFile(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const rows = parseCSV(text);
  const fileName = basename(filePath);
  const db = loadLeads();

  let added = 0, updated = 0, skipped = 0;

  rows.forEach(row => {
    const name = row.clubName || row.name || '';
    if (!name) { skipped++; return; }
    const result = upsertLead({
      clubName: name,
      country: row.country || '',
      website: row.website || null,
      email: row.email || null,
      phone: row.phone || null,
      socialFacebook: row.socialFacebook || null,
      socialInstagram: row.socialInstagram || null,
      level: normaliseLevel(row.level),
      estimatedPlayers: row.estimatedPlayers ? Number(row.estimatedPlayers) || null : null,
      notes: row.notes || '',
      source: `csv:${fileName}`,
    }, db);

    if (result.isNew) added++;
    else updated++;
  });

  saveLeads(db);
  return { file: fileName, rows: rows.length, added, updated, skipped };
}

export async function importAllCSVs(csvDir = CSV_DIR) {
  let files;
  try {
    files = readdirSync(csvDir).filter(f => f.endsWith('.csv') && !f.startsWith('clubs-template'));
  } catch {
    console.log(`  No CSV directory at ${csvDir} — skipping`);
    return [];
  }

  if (!files.length) {
    console.log('  No CSV files in qa/market-input/csv/ (excluding template)');
    return [];
  }

  const results = [];
  for (const file of files) {
    const result = importCSVFile(join(csvDir, file));
    results.push(result);
    console.log(`  ✓ ${result.file}: ${result.added} added, ${result.updated} updated, ${result.skipped} skipped`);
  }
  return results;
}
