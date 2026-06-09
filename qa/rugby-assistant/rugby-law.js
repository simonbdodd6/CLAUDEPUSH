#!/usr/bin/env node
/**
 * Law Explainer CLI
 *
 * Usage:
 *   npm run rugby:law -- "tackle height"
 *   npm run rugby:law -- "offside at ruck"
 *   npm run rugby:law -- "lineout"
 */

import { explainLaw } from './law-explainer.js';
import { header, section, bullet, formatKeyValue, footer, dim, bold, tag, warn, hr } from './format.js';

const query = process.argv.slice(2).join(' ').trim();

if (!query) {
  console.log(`
Law Explainer

Usage: npm run rugby:law -- "<topic>"

Examples:
  npm run rugby:law -- "tackle height"
  npm run rugby:law -- "offside at ruck"
  npm run rugby:law -- "lineout lifting"
  npm run rugby:law -- "concussion protocol"
`);
  process.exit(0);
}

console.log(`\n${header('LAW EXPLAINER', `Topic: "${query}"`)}`);
console.log(dim('\n  Searching knowledge base and explaining law…\n'));

try {
  const result = await explainLaw(query);

  console.log(`\n  ${bold(result.lawTitle)}\n`);

  // Simple explanation
  console.log(section('📖', 'What The Law Says'));
  console.log(`\n  ${result.simpleExplanation}\n`);

  // Practical impact
  console.log(section('🎯', 'Practical Coaching Impact'));
  console.log(`\n  ${result.practicalImpact}\n`);

  // Age-grade considerations
  if (result.ageGradeConsiderations && Object.keys(result.ageGradeConsiderations).length) {
    console.log(section('👶', 'Age-Grade Considerations'));
    console.log('');
    console.log(formatKeyValue(result.ageGradeConsiderations));
  }

  // Examples
  if (result.examples?.length) {
    console.log(section('💡', 'Examples'));
    console.log('');
    result.examples.forEach(e => console.log(bullet(e)));
  }

  // Common misunderstandings
  if (result.commonMisunderstandings?.length) {
    console.log(section('❌', 'Common Misunderstandings'));
    console.log('');
    result.commonMisunderstandings.forEach(m => console.log(bullet(m)));
  }

  // Referee cues
  if (result.refereeCues?.length) {
    console.log(section('🟡', 'What Referees Look For'));
    console.log('');
    result.refereeCues.forEach(c => console.log(bullet(c)));
  }

  // Coach action
  if (result.coachAction) {
    console.log(section('✅', 'Coach Action'));
    console.log(`\n  ${result.coachAction}\n`);
  }

  // Sources
  if (result.sources?.length) {
    console.log(section('📚', `Knowledge Base Sources (${result.sources.length})`));
    console.log('');
    result.sources.forEach((s, i) => {
      const cats = (s.categories || []).map(c => tag(c, '\x1b[36m')).join(' ');
      console.log(bullet(`${dim(`${i + 1}.`)} ${s.title}  ${cats}`));
    });
  } else {
    console.log(`\n  ${dim('No matching law items in knowledge base — response based on World Rugby Laws of the Game.')}`);
    console.log(`  ${dim('Add law documents to qa/rugby-input/laws/ and run: npm run rugby:intel')}`);
  }

  console.log(footer(result.elapsed, result.mode, result.knowledgeBaseSize));

} catch (err) {
  console.error(`\n  Error: ${err.message}`);
  process.exit(1);
}
