/**
 * Manual Provider — pasted text and coaching notes
 *
 * Reads .txt and .md files from qa/rugby-input/notes/
 * Best for: WhatsApp forwards, pasted blog posts, personal coaching notes.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripHTML, cleanText } from '../normalize.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../');
const DEFAULT_DIR = join(ROOT, 'qa/rugby-input/notes');
const SUPPORTED = new Set(['.txt', '.md', '.text']);

export async function* provide({ dir = DEFAULT_DIR } = {}) {
  let files;
  try {
    files = readdirSync(dir).filter(f => SUPPORTED.has(extname(f).toLowerCase()) && !f.startsWith('_'));
  } catch { return; }

  for (const file of files) {
    const filePath = join(dir, file);
    try {
      const raw = readFileSync(filePath, 'utf8');
      const text = cleanText(raw);
      if (text.length < 50) continue;
      yield {
        text,
        filePath,
        source: `notes:${basename(file)}`,
        provider: 'manual',
        mtime: statSync(filePath).mtime.toISOString(),
      };
    } catch (err) {
      console.warn(`  manual-provider: skipping ${file} (${err.message})`);
    }
  }
}

export const meta = {
  name: 'manual',
  displayName: 'Manual Notes',
  inputDir: 'qa/rugby-input/notes/',
  formats: ['.txt', '.md'],
  description: 'Pasted text, coaching notes, WhatsApp forwards',
};
