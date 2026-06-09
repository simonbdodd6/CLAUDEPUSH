/**
 * Law Update Provider — World Rugby law documents and amendments
 *
 * Reads .txt, .md, and .html files from qa/rugby-input/laws/
 * Best for: World Rugby law bulletins, referee circulars, law amendment summaries.
 *
 * All items from this provider are pre-tagged as law-update even if keyword matching
 * misses the signals, ensuring nothing falls through the cracks.
 *
 * How to use:
 *   1. Find a World Rugby law update or referee circular
 *   2. Copy text and save to qa/rugby-input/laws/law-update-YYYY-MM.txt
 *   3. Run: npm run rugby:intel
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripHTML, cleanText } from '../normalize.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../');
const DEFAULT_DIR = join(ROOT, 'qa/rugby-input/laws');
const SUPPORTED = new Set(['.txt', '.md', '.html', '.htm', '.text']);

export async function* provide({ dir = DEFAULT_DIR } = {}) {
  let files;
  try {
    files = readdirSync(dir).filter(f => SUPPORTED.has(extname(f).toLowerCase()) && !f.startsWith('_'));
  } catch { return; }

  for (const file of files) {
    const filePath = join(dir, file);
    const ext = extname(file).toLowerCase();
    try {
      const raw = readFileSync(filePath, 'utf8');
      const text = cleanText(ext === '.html' || ext === '.htm' ? stripHTML(raw) : raw);
      if (text.length < 30) continue;
      yield {
        text,
        filePath,
        source: `law:${basename(file)}`,
        provider: 'law-update',
        mtime: statSync(filePath).mtime.toISOString(),
        // Force law-update category regardless of keyword detection
        _forceCategory: 'law-update',
      };
    } catch (err) {
      console.warn(`  law-update-provider: skipping ${file} (${err.message})`);
    }
  }
}

export const meta = {
  name: 'law-update',
  displayName: 'Law Updates',
  inputDir: 'qa/rugby-input/laws/',
  formats: ['.txt', '.md', '.html'],
  description: 'World Rugby law bulletins, referee circulars, law amendment summaries',
};
