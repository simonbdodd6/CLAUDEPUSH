/**
 * Response Builder
 * Transforms raw engine outputs into structured Copilot responses.
 *
 * Every response has:
 *   summary         — 1-2 sentence headline
 *   reasoning       — why the copilot chose this action
 *   evidence        — data points that informed the response
 *   content         — the main output (session, programme, analysis, etc.)
 *   recommendedActions — what the coach should do next
 *   quickActions    — one-click actions (save, pdf, assign, etc.)
 *   citations       — which engines contributed
 */

import { formatCitations, labelForEngine } from './citation-engine.js';

// ── Quick action catalogue ────────────────────────────────────────────────────

export const QUICK_ACTIONS = {
  save_session:      { id: 'save_session',      label: 'Save Session',       icon: '💾', description: 'Save this session to Memory Engine' },
  create_pdf:        { id: 'create_pdf',         label: 'Create PDF',         icon: '📄', description: 'Export as printable PDF' },
  assign_programme:  { id: 'assign_programme',   label: 'Assign Programme',   icon: '📋', description: 'Assign this programme to a player' },
  update_memory:     { id: 'update_memory',      label: 'Update Memory',      icon: '🧠', description: 'Save insights to Coach Memory' },
  send_to_player:    { id: 'send_to_player',     label: 'Send to Player',     icon: '📱', description: 'Send via push notification' },
  pin_insight:       { id: 'pin_insight',        label: 'Pin Insight',        icon: '📌', description: 'Pin this insight to the dashboard' },
  share_with_coach:  { id: 'share_with_coach',   label: 'Share with Coach',   icon: '👥', description: 'Share with another coach' },
};

function quickAction(id) {
  return QUICK_ACTIONS[id] ?? { id, label: id, icon: '⚡' };
}

// ── Intent → default quick actions ───────────────────────────────────────────

const INTENT_QUICK_ACTIONS = {
  build_session:    ['save_session', 'create_pdf', 'send_to_player', 'update_memory'],
  build_programme:  ['assign_programme', 'create_pdf', 'save_session', 'send_to_player'],
  build_rehab:      ['assign_programme', 'create_pdf', 'send_to_player', 'update_memory'],
  player_progress:  ['pin_insight', 'send_to_player', 'update_memory', 'share_with_coach'],
  injury_risk:      ['pin_insight', 'update_memory', 'send_to_player'],
  weekly_plan:      ['save_session', 'create_pdf', 'pin_insight'],
  session_summary:  ['pin_insight', 'update_memory', 'create_pdf'],
  player_compare:   ['pin_insight', 'share_with_coach', 'update_memory'],
  squad_analysis:   ['pin_insight', 'create_pdf', 'update_memory'],
  knowledge_query:  ['pin_insight', 'share_with_coach'],
};

// ── Content formatters ────────────────────────────────────────────────────────

function formatSession(data) {
  if (!data) return null;
  if (typeof data === 'string') return data;
  const s = data.session ?? data;
  return {
    ageGroup:   s.ageGroup ?? s.input?.ageGroup,
    focus:      s.focus ?? s.input?.focus,
    duration:   s.durationMinutes ?? s.duration,
    warmup:     s.warmup ?? s.phases?.warmup,
    mainBody:   s.mainBody ?? s.phases?.mainBody ?? s.phases,
    cooldown:   s.cooldown ?? s.phases?.cooldown,
    coachNotes: s.coachNotes ?? s.notes,
    raw:        s,
  };
}

function formatProgramme(data) {
  if (!data) return null;
  const p = data.programme ?? data;
  return {
    player:      p.player ?? p.input?.player,
    durationWeeks: p.durationWeeks ?? p.weeks,
    phases:      p.phases ?? p.weeklyPlan,
    goals:       p.goals ?? p.input?.goals,
    raw:         p,
  };
}

function formatAnalysis(data) {
  if (!data) return null;
  return data.developmentSummary ?? data.analyses ?? data;
}

// ── Recommendation builder ────────────────────────────────────────────────────

function buildRecommendedActions(intent, toolResults = [], context = {}) {
  const actions = [];
  const player  = context.player?.core?.name;
  const ageGroup = context.entities?.ageGroup ?? context.team?.ageGroup;

  switch (intent) {
    case 'build_session':
      actions.push('Review the session plan before training and adjust for available players');
      if (ageGroup) actions.push(`Confirm ${ageGroup} players are available and note any absentees`);
      actions.push('Brief assistant coaches on the session focus before warm-up');
      break;

    case 'build_programme':
      if (player) {
        actions.push(`Share the programme with ${player} before the next training session`);
        actions.push(`Book a 10-minute check-in with ${player} after week 4`);
      }
      actions.push('Set calendar reminders for programme review at weeks 4 and 8');
      break;

    case 'player_progress':
      if (player) {
        actions.push(`Discuss progress with ${player} in a one-to-one this week`);
        actions.push(`Review ${player}'s attendance records and identify any patterns`);
      }
      break;

    case 'injury_risk':
      actions.push('Flag highest-risk players to the club physio or first-aider');
      actions.push('Consider introducing a 10-minute pre-training prehab circuit');
      actions.push('Review training load for players with elevated risk scores');
      break;

    case 'squad_analysis':
      actions.push('Share the squad analysis at the next coaches\' meeting');
      actions.push('Set development targets for the bottom 25% of the squad');
      actions.push('Identify mentors: pair higher-development players with those needing support');
      break;

    case 'player_compare':
      actions.push('Use comparison to inform selection decisions for the next fixture');
      actions.push('Give targeted feedback to the lower-scoring player this week');
      break;

    default:
      actions.push('Review the output and apply relevant insights at your next session');
  }

  return actions;
}

// ── Reasoning builder ─────────────────────────────────────────────────────────

function buildReasoning(intent, route, context, toolResults = []) {
  const enginesUsed = toolResults.filter(r => r.success).map(r => labelForEngine(r.toolName));
  const entities    = route.entities ?? {};

  const parts = [
    `Detected intent: **${route.label}** (confidence: ${route.band})`,
  ];

  if (enginesUsed.length) parts.push(`Called: ${enginesUsed.join(', ')}`);
  if (context.hasMemory)  parts.push('Prior player history found in Memory Engine — used to personalise response');

  if (entities.playerName)   parts.push(`Player context: ${entities.playerName}`);
  if (entities.ageGroup)     parts.push(`Age group: ${entities.ageGroup}`);
  if (entities.position)     parts.push(`Position focus: ${entities.position}`);
  if (entities.durationWeeks) parts.push(`Programme length: ${entities.durationWeeks} weeks`);

  return parts.join(' · ');
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildResponse(intent, route, context, toolResults = [], citations) {
  const successful = toolResults.filter(r => r.success);
  const failed     = toolResults.filter(r => !r.success);

  // Extract primary result — prefer domain engines over memory-engine (which is supplementary)
  const primaryResult =
    successful.find(r => r.toolName !== 'memory-engine') ??
    successful[0] ?? null;
  const rawData = primaryResult?.data ?? null;

  // Build summary
  let summary = primaryResult?.summary ?? 'Analysis complete.';
  if (!summary && rawData) summary = `Generated response using ${successful.map(r => r.toolName).join(', ')}.`;

  // Build evidence from tool results
  const evidence = successful.flatMap(r => r.evidence ?? []).filter(Boolean).slice(0, 6);

  // Format content based on intent
  let content = rawData;
  if (intent === 'build_session')   content = formatSession(rawData);
  if (intent === 'build_programme') content = formatProgramme(rawData);
  if (intent === 'build_rehab')     content = formatProgramme(rawData);
  if (intent === 'player_progress' || intent === 'squad_analysis') content = formatAnalysis(rawData);

  // Quick actions
  const intentActions = INTENT_QUICK_ACTIONS[intent] ?? ['pin_insight', 'update_memory'];
  const qActions = intentActions.map(quickAction);

  return {
    intent,
    label:    route.label,
    summary,
    reasoning:         buildReasoning(intent, route, context, toolResults),
    evidence,
    content,
    recommendedActions: buildRecommendedActions(intent, toolResults, context),
    quickActions:      qActions,
    citations:         citations?.getSummary() ?? { engines: [], factCount: 0 },
    warnings:          failed.map(r => `${r.toolName}: ${r.error}`),
    metadata: {
      intent,
      confidence:    route.confidence,
      entities:      route.entities,
      enginesUsed:   successful.map(r => r.toolName),
      generatedAt:   new Date().toISOString(),
    },
  };
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

export function renderToMarkdown(response) {
  if (!response) return '';
  let md = '';

  md += `## ${response.summary}\n\n`;

  if (response.evidence?.length) {
    md += `**Evidence**\n`;
    for (const e of response.evidence) md += `- ${e}\n`;
    md += '\n';
  }

  if (response.content) {
    md += `**Output**\n`;
    if (typeof response.content === 'string') {
      md += response.content + '\n\n';
    } else {
      md += '```json\n' + JSON.stringify(response.content, null, 2).slice(0, 2000) + '\n```\n\n';
    }
  }

  if (response.recommendedActions?.length) {
    md += `**Recommended Actions**\n`;
    for (const a of response.recommendedActions) md += `- ${a}\n`;
    md += '\n';
  }

  if (response.quickActions?.length) {
    md += `**Quick Actions:** ${response.quickActions.map(a => `\`${a.icon} ${a.label}\``).join('  ')}\n\n`;
  }

  if (response.reasoning) {
    md += `---\n*${response.reasoning}*\n`;
  }

  return md;
}
