/**
 * Article Provider — saved rugby articles and web pages
 *
 * Reads .txt, .md, and .html files from qa/rugby-input/articles/
 * Best for: saved web articles, downloaded pages, exported PDFs-to-text.
 *
 * How to use:
 *   1. Find a useful rugby article online
 *   2. Select-all and paste into a .txt file, OR save page as .html
 *   3. Save to qa/rugby-input/articles/article-name.txt
 *   4. Run: npm run rugby:intel
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripHTML, cleanText } from '../normalize.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../');
const DEFAULT_DIR = join(ROOT, 'qa/rugby-input/articles');
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
      if (text.length < 80) continue;
      yield {
        text,
        filePath,
        source: `article:${basename(file)}`,
        provider: 'article',
        mtime: statSync(filePath).mtime.toISOString(),
      };
    } catch (err) {
      console.warn(`  article-provider: skipping ${file} (${err.message})`);
    }
  }
}

export const meta = {
  name: 'article',
  displayName: 'Rugby Articles',
  inputDir: 'qa/rugby-input/articles/',
  formats: ['.txt', '.md', '.html'],
  description: 'Saved rugby articles, downloaded pages, exported PDFs',
};
