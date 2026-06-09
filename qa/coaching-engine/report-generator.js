/**
 * Report generator — converts structured engine output into Markdown reports.
 * Used by the CLI and by the coaching engine test suite.
 */

import { writeFileSync } from 'fs';

function hr() { return '\n---\n'; }
function h1(t) { return `\n# ${t}\n`; }
function h2(t) { return `\n## ${t}\n`; }
function h3(t) { return `\n### ${t}\n`; }
function ul(items = []) { return items.map(i => `- ${i}`).join('\n'); }
function badge(label, value) { return `**${label}:** ${value}`; }

function exerciseTable(exercises = []) {
  if (!exercises.length) return '';
  const header = '| Exercise | Sets | Reps | Tempo | Rest | Notes |\n|---|---|---|---|---|---|';
  const rows   = exercises.map(e =>
    `| ${e.name} | ${e.sets ?? '—'} | ${e.reps ?? '—'} | ${e.tempo ?? '—'} | ${e.rest ?? '—'} | ${e.notes ?? ''} |`
  );
  return [header, ...rows].join('\n');
}

function weeklySplitTable(split = []) {
  if (!split.length) return '';
  const header = '| Day | Type | Focus | Duration | Intensity |\n|---|---|---|---|---|';
  const rows   = split.map(s =>
    `| ${s.day} | ${s.type} | ${s.focus} | ${s.duration ? `${s.duration}min` : '—'} | ${s.intensity} |`
  );
  return [header, ...rows].join('\n');
}

// ── Programme report ──────────────────────────────────────────────────────────

export function programmeToMarkdown(programme) {
  const meta = programme._meta ?? {};
  const ov   = programme.overview ?? {};
  const lines = [];

  lines.push(h1(`Training Programme — ${ov.duration ?? ''}`));
  lines.push(`*Generated: ${meta.generatedAt ?? new Date().toISOString()} | Provider: ${meta.mode ?? 'template'} | KB items used: ${meta.kbItemsUsed ?? 0}*`);

  lines.push(hr());
  lines.push(h2('Overview'));
  lines.push(ov.summary ?? '');
  lines.push('');
  lines.push(badge('Duration',      ov.duration ?? '—'));
  lines.push(badge('Days per week', ov.daysPerWeek ?? '—'));
  lines.push(badge('Primary goals', (ov.primaryGoals ?? []).join(', ')));
  lines.push('');
  lines.push(h3('Key Considerations'));
  lines.push(ul(ov.keyConsiderations ?? []));

  lines.push(hr());
  lines.push(h2('Weekly Training Split'));
  lines.push(weeklySplitTable(programme.weeklySplit ?? []));

  lines.push(hr());
  lines.push(h2('Training Blocks'));
  for (const block of (programme.exerciseBlocks ?? [])) {
    lines.push(h3(`${block.blockName} (${block.phase})`));
    for (const session of (block.sessions ?? [])) {
      lines.push(`\n**${session.sessionType}**\n`);
      lines.push(exerciseTable(session.exercises ?? []));
    }
  }

  lines.push(hr());
  lines.push(h2('Conditioning'));
  const cond = programme.conditioning ?? {};
  lines.push(cond.description ?? '');
  lines.push('');
  lines.push(h3('Methods'));
  lines.push(ul(cond.methods ?? []));
  lines.push('');
  lines.push(badge('Weekly volume',     cond.weeklyVolume   ?? '—'));
  lines.push(badge('Progression model', cond.progressionModel ?? '—'));

  lines.push(hr());
  lines.push(h2('Mobility & Recovery'));
  const mob = programme.mobility ?? {};
  lines.push(h3('Daily Mobility'));
  lines.push(ul(mob.daily ?? []));
  lines.push(h3('Pre-workout'));
  lines.push(ul(mob.preworkout ?? []));
  lines.push(h3('Post-workout'));
  lines.push(ul(mob.postworkout ?? []));
  lines.push(h3('Recovery Protocols'));
  lines.push(ul((programme.recovery ?? {}).protocols ?? []));
  lines.push('');
  lines.push(badge('Deload',  (programme.recovery ?? {}).deloadWeek   ?? '—'));
  lines.push(badge('Sleep',   (programme.recovery ?? {}).sleepGuidelines ?? '—'));

  lines.push(hr());
  lines.push(h2('Nutrition Notes'));
  const nut = programme.nutritionNotes ?? {};
  lines.push(badge('Pre-training',  nut.preTraining  ?? '—'));
  lines.push(badge('Post-training', nut.postTraining ?? '—'));
  lines.push('');
  lines.push(nut.generalGuidelines ?? '');

  lines.push(hr());
  lines.push(h2('Progression & Testing'));
  lines.push(h3('Weekly Progression Rules'));
  lines.push(ul((programme.progression ?? {}).weeklyRules ?? []));
  lines.push(h3('Deload Triggers'));
  lines.push(ul((programme.progression ?? {}).deloadTriggers ?? []));
  lines.push(h3('Testing Schedule'));
  lines.push(ul((programme.progression ?? {}).testingSchedule ?? []));

  if ((programme.testing ?? []).length) {
    lines.push('');
    const tHeader = '| Week | Tests | Benchmarks |\n|---|---|---|';
    const tRows   = programme.testing.map(t => `| ${t.week} | ${(t.tests ?? []).join(', ')} | ${t.benchmarks ?? ''} |`);
    lines.push([tHeader, ...tRows].join('\n'));
  }

  lines.push(hr());
  lines.push(h2('Coach Notes'));
  lines.push(ul(programme.coachNotes ?? []));

  return lines.join('\n');
}

// ── Session report ────────────────────────────────────────────────────────────

export function sessionToMarkdown(session) {
  const meta  = session._meta ?? {};
  const lines = [];

  lines.push(h1(`Training Session — ${session.theme ?? 'Coaching Session'}`));
  lines.push(`*${session.ageGroup} | ${session.duration}min | Intensity: ${session.intensity} | Provider: ${meta.mode ?? 'template'}*`);

  lines.push(hr());
  lines.push(h2(`Warm-Up (${session.warmUp?.duration ?? ''}min)`));
  for (const act of (session.warmUp?.activities ?? [])) {
    lines.push(h3(act.name));
    lines.push(`*Duration: ${act.duration}min*`);
    lines.push(act.description ?? '');
    if (act.coachingPoints?.length) {
      lines.push('');
      lines.push(h3('Coaching Points'));
      lines.push(ul(act.coachingPoints));
    }
  }

  for (const block of (session.skillBlocks ?? [])) {
    lines.push(hr());
    lines.push(h2(`${block.title} (${block.duration}min)`));
    for (const act of (block.activities ?? [])) {
      lines.push(h3(act.name));
      if (act.setup)        lines.push(`*Setup: ${act.setup}*\n`);
      if (act.description)  lines.push(act.description + '\n');
      if (act.coachingPoints?.length) {
        lines.push(h3('Coaching Points'));
        lines.push(ul(act.coachingPoints));
      }
      if (act.progressions?.length) {
        lines.push(h3('Progressions'));
        lines.push(ul(act.progressions));
      }
    }
    if (block.safetyNotes?.length) {
      lines.push(h3('Safety'));
      lines.push(ul(block.safetyNotes));
    }
  }

  if (session.conditioning?.included) {
    lines.push(hr());
    lines.push(h2(`Conditioning (${session.conditioning.duration}min)`));
    lines.push(session.conditioning.activity ?? '');
  }

  lines.push(hr());
  lines.push(h2(`Cool-Down (${session.coolDown?.duration ?? ''}min)`));
  lines.push(ul(session.coolDown?.activities ?? []));

  lines.push(hr());
  lines.push(h2('Equipment Needed'));
  lines.push(ul(session.equipmentNeeded ?? []));

  lines.push(hr());
  lines.push(h2('Overall Coaching Points'));
  lines.push(ul(session.overallCoachingPoints ?? []));

  lines.push(hr());
  lines.push(h2('Safety Notes'));
  lines.push(ul(session.safetyNotes ?? []));

  return lines.join('\n');
}

// ── Engine report (system test) ───────────────────────────────────────────────

export function generateEngineReport(results, meta = {}) {
  const lines = [];
  const { programme, session, rehabPlan, providersAvailable = [] } = results;

  lines.push(h1('Coach\'s Eye Coaching Engine — Build Report'));
  lines.push(`**Date:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Branch:** feature/nightly-qa-agent`);

  lines.push(hr());
  lines.push(h2('Architecture'));
  lines.push(`The Coaching Engine is a modular, provider-independent AI layer that accepts structured JSON input and produces structured JSON output. It is the reusable foundation that every future coaching feature will call.`);

  lines.push(h3('Modules'));
  const modules = [
    ['qa/coaching-engine/index.js',              'Public API — generateProgramme, generateSession, generateSeasonPlan, generateRehabPlan'],
    ['qa/coaching-engine/player-profile.js',     'Player schema, validation, position normalization, 15 position profiles'],
    ['qa/coaching-engine/coach-profile.js',      'Coach identity, philosophy presets, coaching cues'],
    ['qa/coaching-engine/team-profile.js',       'Team schema, age group rules, contact guidelines'],
    ['qa/coaching-engine/training-objectives.js','Goals → training objectives, season phases, equipment profiles'],
    ['qa/coaching-engine/knowledge-search.js',   'Rugby KB adapter — wraps qa/rugby-assistant/query.js'],
    ['qa/coaching-engine/context-builder.js',    'Assembles full EngineContext from all profile/KB data'],
    ['qa/coaching-engine/prompt-builder.js',     'Context → provider-ready prompts (zero hardcoded content)'],
    ['qa/coaching-engine/programme-generator.js','Training programme + rehab generation pipeline'],
    ['qa/coaching-engine/session-generator.js',  'Training session generation pipeline'],
    ['qa/coaching-engine/pdf-outline.js',        'PDF data structure schema (placeholder — no PDF yet)'],
    ['qa/coaching-engine/report-generator.js',   'Structured JSON → Markdown reports'],
    ['qa/coaching-engine/providers/index.js',    'Provider registry — resolveProvider, createProvider, listProviders'],
    ['qa/coaching-engine/providers/claude.js',   'Anthropic Claude provider'],
    ['qa/coaching-engine/providers/openai.js',   'OpenAI GPT provider'],
    ['qa/coaching-engine/providers/gemini.js',   'Google Gemini provider'],
    ['qa/coaching-engine/providers/local.js',    'Ollama-compatible local LLM provider'],
    ['qa/coaching-engine/providers/base.js',     'Base provider class — generate() + generateJSON()'],
  ];
  lines.push('| Module | Responsibility |');
  lines.push('|---|---|');
  for (const [file, desc] of modules) {
    lines.push(`| \`${file}\` | ${desc} |`);
  }

  lines.push(hr());
  lines.push(h2('Provider Status'));
  lines.push('| Provider | Status |');
  lines.push('|---|---|');
  for (const p of providersAvailable) {
    lines.push(`| ${p.name} | ${p.available ? '✓ configured' : '✗ not configured'} |`);
  }

  if (programme) {
    lines.push(hr());
    lines.push(h2('Test — Programme Generation'));
    lines.push(badge('Player',   `${programme._meta?.player?.ageGroup} ${programme._meta?.player?.position}`));
    lines.push(badge('Mode',     programme._meta?.mode ?? 'unknown'));
    lines.push(badge('Duration', programme.overview?.duration ?? '—'));
    lines.push(badge('Goals',    (programme.overview?.primaryGoals ?? []).join(', ')));
    lines.push(badge('KB items', programme._meta?.kbItemsUsed ?? 0));
    lines.push(badge('Elapsed',  `${programme._meta?.elapsed ?? 0}ms`));
    lines.push('');
    lines.push(h3('Overview'));
    lines.push(programme.overview?.summary ?? '—');
    lines.push(h3('Key Considerations'));
    lines.push(ul(programme.overview?.keyConsiderations ?? []));
    lines.push(h3('Weekly Split (sample)'));
    lines.push(weeklySplitTable((programme.weeklySplit ?? []).slice(0, 5)));
    lines.push(h3('Exercise Block (sample)'));
    const firstBlock = programme.exerciseBlocks?.[0];
    if (firstBlock) {
      lines.push(`**${firstBlock.blockName}** — ${firstBlock.phase}`);
      const firstSession = firstBlock.sessions?.[0];
      if (firstSession) {
        lines.push(exerciseTable((firstSession.exercises ?? []).slice(0, 4)));
      }
    }
  }

  if (session) {
    lines.push(hr());
    lines.push(h2('Test — Session Generation'));
    lines.push(badge('Age group', session.ageGroup ?? '—'));
    lines.push(badge('Theme',     session.theme ?? '—'));
    lines.push(badge('Duration',  `${session.duration}min`));
    lines.push(badge('Mode',      session._meta?.mode ?? 'unknown'));
    lines.push(badge('KB items',  session._meta?.kbItemsUsed ?? 0));
    lines.push('');
    lines.push(h3('Warm-Up Activities'));
    lines.push(ul((session.warmUp?.activities ?? []).map(a => `${a.name} (${a.duration}min)`)));
    lines.push(h3('Skill Blocks'));
    lines.push(ul((session.skillBlocks ?? []).map(b => b.title)));
  }

  if (rehabPlan) {
    lines.push(hr());
    lines.push(h2('Test — Rehab Plan Generation'));
    lines.push(badge('Player',  `${rehabPlan._meta?.player?.position} age ${rehabPlan._meta?.player?.age}`));
    lines.push(badge('Injury',  rehabPlan._meta?.injuryDetail ?? '—'));
    lines.push(badge('Mode',    rehabPlan._meta?.mode ?? 'unknown'));
    lines.push(badge('Stages',  (rehabPlan.overview?.rtpStages ?? []).length));
    lines.push('');
    lines.push(h3('Return-to-Play Stages'));
    lines.push(ul(rehabPlan.overview?.rtpStages ?? []));
    lines.push(h3('Red Flags'));
    lines.push(ul(rehabPlan.redFlags ?? []));
  }

  lines.push(hr());
  lines.push(h2('How to Use'));
  lines.push(`\`\`\`bash
# Run the engine test with the example player profile
npm run coaching:engine

# Import in your own module
import { generateProgramme, generateSession } from './qa/coaching-engine/index.js';

const programme = await generateProgramme({
  age: 17, position: 'Prop', experience: 'Intermediate',
  goals: ['Strength', 'Mass', 'Scrummaging Power'],
  injuries: ['Previous shoulder injury'],
  trainingDays: 4, equipment: ['Full gym'], seasonPhase: 'Preseason'
});
\`\`\``);

  lines.push(hr());
  lines.push(h2('Provider Configuration'));
  lines.push(`The engine auto-detects the best available provider. Set environment variables to enable AI output:`);
  lines.push(`\`\`\`bash
export ANTHROPIC_API_KEY=sk-...   # enables Claude (recommended)
export OPENAI_API_KEY=sk-...      # enables OpenAI GPT
export GEMINI_API_KEY=...         # enables Google Gemini
export LOCAL_LLM_URL=http://...   # enables Ollama local LLM
export COACHING_ENGINE_PROVIDER=claude  # force a specific provider
\`\`\``);
  lines.push(`Without any API key the engine falls back to a structured template that produces real, usable output — no empty fields, no generic text.`);

  lines.push(hr());
  lines.push('*Built on feature/nightly-qa-agent — no production app code modified.*');

  return lines.join('\n');
}

export function writeReport(content, filePath) {
  writeFileSync(filePath, content, 'utf8');
}
