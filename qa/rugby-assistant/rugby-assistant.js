#!/usr/bin/env node
/**
 * Rugby Coaching Assistant CLI
 *
 * Usage:
 *   npm run rugby:assistant -- "ruck speed"
 *   npm run rugby:assistant -- "U10 tackling"
 *   npm run rugby:assistant -- "lineout lifting"
 */

import { askAssistant } from './assistant.js';
import { header, section, bullet, formatList, formatKeyValue, footer, dim, bold, tag, warn, hr } from './format.js';

const query = process.argv.slice(2).join(' ').trim();

if (!query) {
  console.log(`
Rugby Coaching Assistant

Usage: npm run rugby:assistant -- "<topic>"

Examples:
  npm run rugby:assistant -- "ruck speed"
  npm run rugby:assistant -- "U10 tackling drills"
  npm run rugby:assistant -- "lineout lifting technique"
  npm run rugby:assistant -- "defensive line speed"
`);
  process.exit(0);
}

console.log(`\n${header('RUGBY COACHING ASSISTANT', `Query: "${query}"`)}`);
console.log(dim('\n  Searching knowledge base and generating response…\n'));

try {
  const result = await askAssistant(query);

  // Summary
  console.log(section('📋', 'Summary'));
  console.log(`\n  ${result.summary}\n`);

  // Key Coaching Points
  if (result.keyCoachingPoints?.length) {
    console.log(section('⚡', 'Key Coaching Points'));
    console.log('');
    result.keyCoachingPoints.forEach(p => console.log(bullet(p)));
  }

  // Recommended Drills
  if (result.recommendedDrills?.length) {
    console.log(section('🏋️ ', 'Recommended Drills'));
    console.log('');
    result.recommendedDrills.forEach(d => {
      const dur = d.duration ? ` ${dim('(' + d.duration + ')')}` : '';
      console.log(bullet(`${bold(d.name)}${dur}`));
      if (d.description) console.log(`       ${dim(d.description)}`);
    });
  }

  // Common Mistakes
  if (result.commonMistakes?.length) {
    console.log(section('❌', 'Common Mistakes'));
    console.log('');
    result.commonMistakes.forEach(m => console.log(bullet(m)));
  }

  // Age-Grade Adaptations
  if (result.ageGradeAdaptations && Object.keys(result.ageGradeAdaptations).length) {
    console.log(section('👶', 'Age-Grade Adaptations'));
    console.log('');
    console.log(formatKeyValue(result.ageGradeAdaptations));
  }

  // Law Considerations
  if (result.lawConsiderations) {
    console.log(section('📖', 'Law Considerations'));
    console.log(`\n  ${result.lawConsiderations}\n`);
  }

  // Safety Notes
  if (result.safetyNotes) {
    console.log(`\n  ${warn(result.safetyNotes)}`);
  }

  // Sources
  if (result.sources?.length) {
    console.log(section('📚', `Sources (${result.sources.length} items from knowledge base)`));
    console.log('');
    result.sources.forEach((s, i) => {
      const cats = (s.categories || []).map(c => tag(c, '\x1b[36m')).join(' ');
      console.log(bullet(`${dim(`${i + 1}.`)} ${s.title}  ${cats}`));
    });
  } else {
    console.log(`\n  ${dim('No matching knowledge base items — response based on coaching best practice.')}`);
  }

  console.log(footer(result.elapsed, result.mode, result.knowledgeBaseSize));

} catch (err) {
  console.error(`\n  Error: ${err.message}`);
  process.exit(1);
}
