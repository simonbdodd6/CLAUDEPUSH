#!/usr/bin/env node
/**
 * Drill Finder CLI
 *
 * Usage:
 *   npm run rugby:drills -- "ruck speed"
 *   npm run rugby:drills -- "U14 lineout"
 *   npm run rugby:drills -- "contact skills"
 */

import { findDrills } from './drill-finder.js';
import { header, section, bullet, footer, dim, bold, tag, hr, warn } from './format.js';

const query = process.argv.slice(2).join(' ').trim();

if (!query) {
  console.log(`
Drill Finder

Usage: npm run rugby:drills -- "<topic>"

Examples:
  npm run rugby:drills -- "ruck speed"
  npm run rugby:drills -- "U14 lineout"
  npm run rugby:drills -- "contact skills"
  npm run rugby:drills -- "defensive line speed"
`);
  process.exit(0);
}

console.log(`\n${header('DRILL FINDER', `Topic: "${query}"`)}`);
console.log(dim('\n  Searching knowledge base for matching drills…\n'));

try {
  const { drills, enriched, detectedAgeGroup, elapsed, knowledgeBaseSize } = await findDrills(query);

  if (!drills.length) {
    console.log(`  ${dim('No drills found in the knowledge base for this topic.')}`);
    console.log(`  ${dim('Add drill files to qa/rugby-input/drills/ and run: npm run rugby:intel')}`);
    console.log(footer(elapsed, 'heuristic', knowledgeBaseSize));
    process.exit(0);
  }

  if (detectedAgeGroup) {
    console.log(`  ${dim('Age group detected:')} ${bold(detectedAgeGroup)}\n`);
  }

  drills.forEach((drill, i) => {
    const e = enriched.find(x => x.id === drill.id);
    const cats = (drill.categories || []).map(c => tag(c, '\x1b[36m')).join(' ');
    const ages = (drill.ageGroup || []).filter(a => a !== 'all').map(a => tag(a, '\x1b[33m')).join(' ');

    console.log(`\n${hr()}`);
    console.log(`  ${bold(`${i + 1}. ${drill.title}`)}  ${cats} ${ages}`);
    console.log(`  ${drill.summary || ''}`);

    if (e) {
      if (e.coachingNotes) {
        console.log(`\n  ${dim('Coach notes:')} ${e.coachingNotes}`);
      }
      if (e.keyPoints?.length) {
        console.log(`\n  ${dim('Key points:')}`);
        e.keyPoints.forEach(p => console.log(bullet(p)));
      }
      if (e.progressions?.length) {
        console.log(`\n  ${dim('Progressions:')}`);
        e.progressions.forEach(p => console.log(bullet(p)));
      }
      if (e.suitableFor) {
        console.log(`\n  ${dim('Best for:')} ${e.suitableFor}`);
      }
    } else {
      if (drill.takeaway) console.log(`\n  ${dim('Key takeaway:')} ${drill.takeaway}`);
    }

    if (drill.isSafetyAlert) console.log(`\n  ${warn('Safety consideration — review before running this drill.')}`);
  });

  console.log(`\n${hr()}`);
  console.log(footer(elapsed, enriched.length ? 'claude' : 'heuristic', knowledgeBaseSize));

} catch (err) {
  console.error(`\n  Error: ${err.message}`);
  process.exit(1);
}
