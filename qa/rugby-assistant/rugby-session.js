#!/usr/bin/env node
/**
 * Rugby Session Builder CLI
 *
 * Usage:
 *   npm run rugby:session -- U12
 *   npm run rugby:session -- U16 breakdown
 *   npm run rugby:session -- Senior lineout
 *
 * Age groups: U8, U10, U12, U14, U16, Senior
 */

import { buildSession, VALID_AGE_GROUPS } from './session-builder.js';
import { header, section, bullet, footer, dim, bold, hr, tag, warn } from './format.js';

const args  = process.argv.slice(2);
const ageGroup = args[0]?.trim();
const focus    = args.slice(1).join(' ').trim();

if (!ageGroup || !VALID_AGE_GROUPS.includes(ageGroup)) {
  console.log(`
Rugby Session Builder

Usage: npm run rugby:session -- <age-group> [focus]

Age groups: ${VALID_AGE_GROUPS.join(', ')}

Examples:
  npm run rugby:session -- U12
  npm run rugby:session -- U16 breakdown
  npm run rugby:session -- Senior lineout
  npm run rugby:session -- U10 passing
`);
  process.exit(ageGroup ? 1 : 0);
}

console.log(`\n${header('RUGBY SESSION BUILDER', `${ageGroup}${focus ? ' · ' + focus : ''} training session`)}`);
console.log(dim('\n  Generating session plan…\n'));

try {
  const { session, sources, elapsed, mode, knowledgeBaseSize } = await buildSession(ageGroup, focus);

  // Header info
  console.log(`  ${bold(session.theme)}`);
  console.log(`  ${dim(`Total: ${session.totalDuration} min · Age: ${session.ageGroup}`)}\n`);

  // Equipment
  if (session.equipmentNeeded?.length) {
    console.log(`  ${dim('Equipment:')} ${session.equipmentNeeded.join(', ')}\n`);
  }

  // Safety notes
  if (session.safetyNotes?.length) {
    session.safetyNotes.forEach(n => console.log(`  ${warn(n)}`));
    console.log('');
  }

  // Warm-up
  if (session.warmUp) {
    console.log(section('🔥', `Warm-Up — ${session.warmUp.duration} min`));
    session.warmUp.activities?.forEach(a => {
      console.log(`\n  ${bold(a.name)} ${dim('(' + a.duration + ' min)')}`);
      console.log(`  ${a.description}`);
      if (a.coachingPoints?.length) {
        a.coachingPoints.forEach(p => console.log(bullet(p)));
      }
    });
  }

  // Skill Blocks
  session.skillBlocks?.forEach((block, i) => {
    console.log(section('🎯', `${block.title} — ${block.duration} min`));
    block.activities?.forEach(a => {
      console.log(`\n  ${bold(a.name)} ${dim('(' + a.duration + ' min)')}`);
      console.log(`  ${a.description}`);
      if (a.coachingPoints?.length) {
        console.log(`  ${dim('Coach cues:')}`);
        a.coachingPoints.forEach(p => console.log(bullet(p)));
      }
      if (a.progressions?.length) {
        console.log(`  ${dim('Progressions:')}`);
        a.progressions.forEach(p => console.log(bullet(p)));
      }
    });
    if (block.safetyNotes) console.log(`\n  ${warn(block.safetyNotes)}`);
  });

  // Game
  if (session.game) {
    const g = session.game;
    console.log(section('🏉', `${g.name} — ${g.duration} min`));
    console.log(`\n  ${g.description}`);
    if (g.coachingPoints?.length) {
      console.log(`\n  ${dim('Watch for:')}`);
      g.coachingPoints.forEach(p => console.log(bullet(p)));
    }
    if (g.variations?.length) {
      console.log(`\n  ${dim('Variations:')}`);
      g.variations.forEach(v => console.log(bullet(v)));
    }
  }

  // Cool-down
  if (session.coolDown) {
    console.log(section('🧘', `Cool-Down — ${session.coolDown.duration} min`));
    session.coolDown.activities?.forEach(a => console.log(bullet(a)));
  }

  // Overall coaching points
  if (session.overallCoachingPoints?.length) {
    console.log(section('💡', 'Session Coaching Points'));
    console.log('');
    session.overallCoachingPoints.forEach(p => console.log(bullet(p)));
  }

  // Sources
  if (sources?.length) {
    console.log(`\n  ${dim(`Knowledge base items used: ${sources.map(s => `"${s.title}"`).join(', ')}`)}`);
  }

  console.log(footer(elapsed, mode, knowledgeBaseSize));

} catch (err) {
  console.error(`\n  Error: ${err.message}`);
  process.exit(1);
}
