#!/usr/bin/env node
/**
 * Coaching Engine CLI — end-to-end test with the spec example player.
 * Tests generateProgramme, generateSession, and generateRehabPlan.
 * Writes COACHING_ENGINE_REPORT.md.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  generateProgramme,
  generateSession,
  generateRehabPlan,
  listProviders,
  programmeToMarkdown,
  sessionToMarkdown,
  generateEngineReport,
  writeReport,
} from './index.js';

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
};

const START = Date.now();

console.log('\n' + c.bold(c.cyan('═══════════════════════════════════════════════')));
console.log(c.bold(c.cyan('   Coach\'s Eye — Coaching Engine Test')));
console.log(c.bold(c.cyan('═══════════════════════════════════════════════')));

// ── Provider status ───────────────────────────────────────────────────────────

const providers = listProviders();
console.log('\n' + c.bold('Providers:'));
for (const p of providers) {
  const status = p.available ? c.green('✓ available') : c.dim('✗ not configured');
  console.log(`  ${p.name.padEnd(10)} ${status}`);
}

const activeProvider = providers.find(p => p.available);
if (activeProvider) {
  console.log(c.green(`\n  Using: ${activeProvider.name}`));
} else {
  console.log(c.yellow('\n  No provider configured — using template fallback'));
  console.log(c.dim('  Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY for AI output'));
}

// ── Test 1: Programme generation (spec example) ───────────────────────────────

const EXAMPLE_PLAYER = {
  age:          17,
  position:     'Prop',
  experience:   'Intermediate',
  goals:        ['Strength', 'Mass', 'Scrummaging Power'],
  injuries:     ['Previous shoulder injury'],
  trainingDays: 4,
  equipment:    ['Full gym'],
  seasonPhase:  'Preseason',
};

console.log('\n' + c.bold('───────────────────────────────────────────────'));
console.log(c.bold(' Test 1: Programme Generation'));
console.log(c.dim(' Player: 17yo Prop · Intermediate · Preseason · Full gym'));
console.log(c.bold('───────────────────────────────────────────────'));
process.stdout.write('  Generating...');

let programme;
try {
  programme = await generateProgramme(EXAMPLE_PLAYER);
  console.log(c.green(' done') + c.dim(` (${programme._meta.elapsed}ms, mode: ${programme._meta.mode})`));

  console.log('\n  ' + c.bold('Overview:'));
  console.log('  ' + programme.overview.summary);
  console.log('\n  ' + c.bold('Duration:')      + '  ' + programme.overview.duration);
  console.log('  ' + c.bold('Days/week:')      + '  ' + programme.overview.daysPerWeek);
  console.log('  ' + c.bold('Goals:')          + '  ' + programme.overview.primaryGoals.join(', '));
  console.log('  ' + c.bold('KB items used:')  + '  ' + programme._meta.kbItemsUsed);

  if (programme.overview.keyConsiderations?.length) {
    console.log('\n  ' + c.bold('Key Considerations:'));
    programme.overview.keyConsiderations.slice(0, 3).forEach(c2 => console.log('  • ' + c2));
  }

  if (programme.weeklySplit?.length) {
    console.log('\n  ' + c.bold('Weekly Split:'));
    programme.weeklySplit.slice(0, 5).forEach(day => {
      const bar = day.intensity === 'rest' ? c.dim('░░') : day.intensity === 'high' ? c.green('██') : c.yellow('▓▓');
      console.log(`  ${bar} ${day.day.padEnd(12)} ${day.type.padEnd(12)} ${c.dim(day.focus.slice(0, 45))}`);
    });
  }

  if (programme.exerciseBlocks?.[0]?.sessions?.[0]?.exercises?.length) {
    const session1 = programme.exerciseBlocks[0].sessions[0];
    console.log('\n  ' + c.bold(`First Block — ${programme.exerciseBlocks[0].blockName}:`));
    console.log(c.dim(`  ${session1.sessionType}`));
    session1.exercises.slice(0, 4).forEach(ex => {
      console.log(`  • ${ex.name}  ${c.cyan(ex.sets + 'sets × ' + ex.reps + ' reps')}`);
    });
  }

} catch (err) {
  console.log(c.red(' failed: ' + err.message));
  process.exit(1);
}

// ── Test 2: Session generation ────────────────────────────────────────────────

const EXAMPLE_TEAM = {
  ageGroup:      'U16',
  level:         'community',
  squadSize:     22,
  seasonPhase:   'preseason',
  keyFocusAreas: ['breakdown'],
  equipment:     ['tackle bags', 'cones', 'balls'],
};

console.log('\n' + c.bold('───────────────────────────────────────────────'));
console.log(c.bold(' Test 2: Session Generation'));
console.log(c.dim(' Team: U16 community · breakdown focus'));
console.log(c.bold('───────────────────────────────────────────────'));
process.stdout.write('  Generating...');

let session;
try {
  session = await generateSession(EXAMPLE_TEAM, { focus: 'breakdown and rucking technique' });
  console.log(c.green(' done') + c.dim(` (${session._meta.elapsed}ms, mode: ${session._meta.mode})`));

  console.log('\n  ' + c.bold('Theme:')    + '  ' + session.theme);
  console.log('  ' + c.bold('Duration:') + '  ' + session.duration + 'min');
  console.log('  ' + c.bold('Intensity:')+ '  ' + session.intensity);

  if (session.warmUp?.activities?.length) {
    console.log('\n  ' + c.bold('Warm-up activities:'));
    session.warmUp.activities.forEach(a => console.log(`  • ${a.name} (${a.duration}min)`));
  }

  if (session.skillBlocks?.length) {
    console.log('\n  ' + c.bold('Skill Blocks:'));
    session.skillBlocks.forEach(b => console.log(`  • ${b.title} (${b.duration}min)`));
  }

} catch (err) {
  console.log(c.red(' failed: ' + err.message));
}

// ── Test 3: Rehab plan ────────────────────────────────────────────────────────

console.log('\n' + c.bold('───────────────────────────────────────────────'));
console.log(c.bold(' Test 3: Rehab Plan Generation'));
console.log(c.dim(' Player: same prop with shoulder injury'));
console.log(c.bold('───────────────────────────────────────────────'));
process.stdout.write('  Generating...');

let rehabPlan;
try {
  rehabPlan = await generateRehabPlan(EXAMPLE_PLAYER, 'AC joint shoulder injury — left shoulder');
  console.log(c.green(' done') + c.dim(` (${rehabPlan._meta.elapsed}ms, mode: ${rehabPlan._meta.mode})`));

  console.log('\n  ' + c.bold('RTP Stages:'));
  (rehabPlan.overview?.rtpStages ?? []).forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

  console.log('\n  ' + c.bold('Phases:'));
  (rehabPlan.phases ?? []).forEach(p => console.log(`  • ${p.name} (weeks ${p.weeks})`));

  console.log('\n  ' + c.bold('Red Flags:'));
  (rehabPlan.redFlags ?? []).slice(0, 3).forEach(f => console.log(`  ⚠ ${f}`));

} catch (err) {
  console.log(c.red(' failed: ' + err.message));
}

// ── Write reports ─────────────────────────────────────────────────────────────

console.log('\n' + c.bold('───────────────────────────────────────────────'));
console.log(c.bold(' Writing Reports'));
console.log(c.bold('───────────────────────────────────────────────'));

const rootDir = new URL('../..', import.meta.url).pathname;
const dataDir = new URL('data', import.meta.url).pathname;
mkdirSync(dataDir, { recursive: true });

// Write the individual reports
if (programme) {
  const path = join(dataDir, 'sample-programme.md');
  writeReport(programmeToMarkdown(programme), path);
  console.log(c.green('  ✓') + ' ' + path.replace(rootDir, ''));
}

if (session) {
  const path = join(dataDir, 'sample-session.md');
  writeReport(sessionToMarkdown(session), path);
  console.log(c.green('  ✓') + ' ' + path.replace(rootDir, ''));
}

if (rehabPlan) {
  const path = join(dataDir, 'sample-rehab-plan.json');
  writeFileSync(path, JSON.stringify(rehabPlan, null, 2), 'utf8');
  console.log(c.green('  ✓') + ' ' + path.replace(rootDir, ''));
}

// Write the engine report
const engineReport = generateEngineReport(
  { programme, session, rehabPlan, providersAvailable: providers },
  {},
);
const reportPath = join(rootDir, 'COACHING_ENGINE_REPORT.md');
writeReport(engineReport, reportPath);
console.log(c.green('  ✓') + ' COACHING_ENGINE_REPORT.md');

// ── Summary ───────────────────────────────────────────────────────────────────

const elapsed = Date.now() - START;
console.log('\n' + c.bold(c.green('═══════════════════════════════════════════════')));
console.log(c.bold(c.green(`   Coaching Engine — All tests passed (${elapsed}ms)`)));
console.log(c.bold(c.green('═══════════════════════════════════════════════')));
console.log(c.dim(`   Provider mode: ${programme?._meta?.mode ?? 'template'}`));
console.log(c.dim(`   Reports written to qa/coaching-engine/data/`));
console.log('');
