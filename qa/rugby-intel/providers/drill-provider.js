/**
 * Drill Provider — training exercises and session plans
 *
 * Reads .txt, .md, and .json files from qa/rugby-input/drills/
 * Best for: drill descriptions, session plans, exercise libraries.
 *
 * JSON format (optional structured input):
 * {
 *   "name": "Tackle Circuit",
 *   "duration": "20 min",
 *   "ageGroup": "youth",
 *   "focus": "contact-skills",
 *   "equipment": ["tackle bags", "shields"],
 *   "description": "...",
 *   "coachingPoints": ["..."],
 *   "progressions": ["..."]
 * }
 *
 * Plain text is also accepted — the classifier will detect drill structure.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanText } from '../normalize.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../');
const DEFAULT_DIR = join(ROOT, 'qa/rugby-input/drills');
const SUPPORTED = new Set(['.txt', '.md', '.json', '.text']);

function drillJsonToText(obj) {
  const parts = [
    obj.name && `Drill: ${obj.name}`,
    obj.duration && `Duration: ${obj.duration}`,
    obj.ageGroup && `Age group: ${obj.ageGroup}`,
    obj.focus && `Focus: ${obj.focus}`,
    obj.equipment?.length && `Equipment: ${obj.equipment.join(', ')}`,
    obj.description && `\n${obj.description}`,
    obj.coachingPoints?.length && `\nCoaching points:\n${obj.coachingPoints.map(p => `- ${p}`).join('\n')}`,
    obj.progressions?.length && `\nProgressions:\n${obj.progressions.map(p => `- ${p}`).join('\n')}`,
  ].filter(Boolean);
  return parts.join('\n');
}

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
      let text;
      if (ext === '.json') {
        const parsed = JSON.parse(raw);
        text = Array.isArray(parsed)
          ? parsed.map(drillJsonToText).join('\n\n---\n\n')
          : drillJsonToText(parsed);
      } else {
        text = cleanText(raw);
      }
      if (text.length < 30) continue;
      yield {
        text,
        filePath,
        source: `drill:${basename(file)}`,
        provider: 'drill',
        mtime: statSync(filePath).mtime.toISOString(),
        _forceCategory: 'drill',
      };
    } catch (err) {
      console.warn(`  drill-provider: skipping ${file} (${err.message})`);
    }
  }
}

export const meta = {
  name: 'drill',
  displayName: 'Training Drills',
  inputDir: 'qa/rugby-input/drills/',
  formats: ['.txt', '.md', '.json'],
  description: 'Drill descriptions, session plans, exercise libraries',
};
