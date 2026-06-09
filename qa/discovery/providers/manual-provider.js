/**
 * Manual Entry Provider
 *
 * Reads structured JSON files from qa/market-input/manual/.
 * This is the highest-confidence input method because fields are explicitly named.
 *
 * Expected file format: a JSON array of club objects.
 * See qa/market-input/examples/manual-example.json for the schema.
 *
 * Options:
 *   dir: string — override input directory
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../');
const DEFAULT_DIR = join(ROOT, 'qa/market-input/manual');

export async function* provide({ dir = DEFAULT_DIR } = {}) {
  let files;
  try {
    files = readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  } catch {
    return;
  }

  for (const file of files) {
    let clubs;
    try {
      clubs = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      if (!Array.isArray(clubs)) clubs = [clubs];
    } catch (err) {
      console.warn(`  manual-provider: skipping ${file} (parse error: ${err.message})`);
      continue;
    }

    for (const club of clubs) {
      if (!club.clubName && !club.name) continue;
      yield {
        clubName: club.clubName || club.name || '',
        country: club.country || '',
        city: club.city || null,
        website: club.website || null,
        email: club.email || null,
        facebook: club.facebook || club.social_facebook || null,
        instagram: club.instagram || club.social_instagram || null,
        level: club.level || '',
        league: club.league || null,
        notes: club.notes || '',
        source: `manual:${basename(file)}`,
      };
    }
  }
}

export const meta = {
  name: 'manual-provider',
  displayName: 'Manual Entry',
  description: 'Reads JSON arrays of clubs from qa/market-input/manual/',
  inputDir: 'qa/market-input/manual/',
  exampleFile: 'qa/market-input/examples/manual-example.json',
};
