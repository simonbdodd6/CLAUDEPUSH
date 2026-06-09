/**
 * Workflow Parser — natural language → WorkflowDefinition
 *
 * Uses keyword/regex matching (no LLM required) to map user intent
 * to predefined workflow templates, then customises each template
 * with entities extracted from the message.
 *
 * WorkflowDefinition:
 * {
 *   id:           string
 *   intent:       string
 *   name:         string
 *   description:  string
 *   steps: [{
 *     stepId:    string
 *     actionId:  string
 *     label:     string
 *     params:    object
 *     depends:   string[]   — stepIds that must complete first
 *     critical:  boolean    — if true, failure aborts the whole workflow
 *     optional:  boolean    — if true, failure is logged but doesn't abort
 *   }]
 *   context:      object    — extracted entities + raw message
 *   confidence:   number    — 0–1
 *   warnings:     string[]
 * }
 */

import { hasAction } from './workflow-actions.js';

// ── Entity extraction ─────────────────────────────────────────────────────────

const AGE_GROUP_RE   = /\b(u\d{1,2}|seniors?|minis?|youths?|junior|adult)\b/i;
const POSITION_RE    = /\b(prop|hooker|lock|flanker|number 8|scrum-?half|fly-?half|centre|wing|fullback|back|forward)\b/i;
const DAY_OF_WEEK_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const TIME_RE        = /\b(\d{1,2}[:h]\d{2})\b/i;
const DURATION_RE    = /\b(\d{1,3})\s*(min(?:utes?)?|hrs?|hours?)\b/i;
const PLAYER_NAME_RE = /(?:for|about|on|player)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)/;

function extractEntities(text) {
  const lower  = text.toLowerCase();
  const entities = {};

  const ag = text.match(AGE_GROUP_RE);
  if (ag) entities.ageGroup = normaliseAgeGroup(ag[1]);

  const pos = text.match(POSITION_RE);
  if (pos) entities.position = pos[1].toLowerCase();

  const day = lower.match(DAY_OF_WEEK_RE);
  if (day) entities.dayOfWeek = day[1];

  const time = text.match(TIME_RE);
  if (time) entities.time = time[1].replace('h', ':');

  const dur = text.match(DURATION_RE);
  if (dur) {
    const v = parseInt(dur[1], 10);
    entities.durationMinutes = /hr|hour/i.test(dur[2]) ? v * 60 : v;
  }

  const pn = text.match(PLAYER_NAME_RE);
  if (pn) entities.playerName = pn[1];

  // Season phase hints
  if (/pre.?season/i.test(lower))  entities.seasonPhase = 'preseason';
  if (/off.?season/i.test(lower))  entities.seasonPhase = 'off-season';
  if (/next\s+week/i.test(lower))  entities.nextWeek = true;
  if (/next\s+tuesday/i.test(lower)) { entities.dayOfWeek = 'tuesday'; entities.nextWeek = true; }

  // Focus hints
  if (/fitness|condition/i.test(lower))  entities.sessionFocus = 'fitness and conditioning';
  if (/lineout/i.test(lower))            entities.sessionFocus = 'lineout';
  if (/scrum/i.test(lower))              entities.sessionFocus = 'scrum';
  if (/tackle|defence|defense/i.test(lower)) entities.sessionFocus = 'defence';
  if (/attack/i.test(lower))             entities.sessionFocus = 'attack';
  if (/skill/i.test(lower))              entities.sessionFocus = 'skills';
  if (/match.?prep/i.test(lower))        entities.sessionFocus = 'match preparation';

  return entities;
}

function normaliseAgeGroup(raw) {
  const l = raw.toLowerCase();
  if (/senior|adult/.test(l))  return 'Senior';
  if (/mini/.test(l))          return 'Mini';
  if (/youth/.test(l))         return 'Youth';
  if (/junior/.test(l))        return 'Junior';
  const num = l.match(/u(\d{1,2})/);
  if (num) return `U${num[1]}`;
  return raw;
}

// ── Workflow templates ────────────────────────────────────────────────────────

const TEMPLATES = {

  // ── Build training session ──────────────────────────────────────────────────
  build_session: {
    name:        'Build & Schedule Training Session',
    description: 'Generate, save, schedule, notify and PDF a training session',
    baseSteps: [
      { actionId: 'create_session',          label: 'Generate session plan',      depends: [],                                 critical: true  },
      { actionId: 'save_session',            label: 'Save to memory',             depends: ['create_session'],                 critical: true  },
      { actionId: 'assign_session_to_team',  label: 'Assign to team',             depends: ['save_session'],                   critical: false },
      { actionId: 'schedule_future_session', label: 'Schedule for future date',   depends: ['save_session'],                   critical: false, optional: true },
      { actionId: 'send_coach_notification', label: 'Notify coaches',             depends: ['save_session'],                   critical: false },
      { actionId: 'generate_pdf',            label: 'Generate printable PDF',     depends: ['create_session'],                 critical: false },
      { actionId: 'update_season_plan',      label: 'Update season objectives',   depends: ['save_session'],                   critical: false, optional: true },
    ],
    keywords: [
      'build', 'create', 'generate', 'make', 'plan',
      'session', 'training', 'practice', 'drill',
    ],
    phrases: [
      /build.*session/i, /create.*session/i, /plan.*training/i,
      /next.*training/i, /training.*plan/i, /session.*plan/i,
    ],
  },

  // ── Rehabilitation programme ────────────────────────────────────────────────
  rehab_programme: {
    name:        'Create & Assign Rehabilitation Programme',
    description: 'Generate a return-to-play rehab plan and assign it to a player',
    baseSteps: [
      { actionId: 'create_rehab_programme', label: 'Generate rehab plan',    depends: [],                         critical: true  },
      { actionId: 'assign_programme',       label: 'Assign to player',       depends: ['create_rehab_programme'], critical: true  },
      { actionId: 'update_player_memory',   label: 'Update player record',   depends: ['assign_programme'],       critical: false },
      { actionId: 'send_player_notification', label: 'Notify player',        depends: ['assign_programme'],       critical: false, optional: true },
    ],
    keywords: [
      'rehab', 'rehabilitation', 'injury', 'recover', 'return',
      'return-to-play', 'rtp', 'physio', 'hurt', 'injured',
    ],
    phrases: [
      /rehab.*program/i, /rehab.*plan/i, /recover.*plan/i,
      /return.*play/i, /injured.*player/i, /player.*injur/i,
    ],
  },

  // ── Director of Rugby report ────────────────────────────────────────────────
  dor_report: {
    name:        'Generate Director of Rugby Report',
    description: 'Build and notify DoR of weekly intelligence brief',
    baseSteps: [
      { actionId: 'generate_dor_report',     label: 'Generate DoR brief',     depends: [],                   critical: true  },
      { actionId: 'generate_pdf',            label: 'Export to PDF',          depends: ['generate_dor_report'], critical: false },
      { actionId: 'send_coach_notification', label: 'Notify coaching staff',  depends: ['generate_dor_report'], critical: false, optional: true },
    ],
    keywords: [
      'director', 'dor', 'weekly', 'brief', 'report',
      'intelligence', 'overview', 'summary',
    ],
    phrases: [
      /dor.*report/i, /director.*rugby/i, /weekly.*brief/i,
      /weekly.*report/i, /club.*report/i, /weekly.*overview/i,
    ],
  },

  // ── Player review ───────────────────────────────────────────────────────────
  player_review: {
    name:        'Create Player Development Review',
    description: 'Generate and save a full player development analysis',
    baseSteps: [
      { actionId: 'create_player_review',   label: 'Generate player review',  depends: [],                    critical: true  },
      { actionId: 'update_player_memory',   label: 'Update player record',    depends: ['create_player_review'], critical: false },
      { actionId: 'send_player_notification', label: 'Notify player',         depends: ['create_player_review'], critical: false, optional: true },
    ],
    keywords: [
      'review', 'assess', 'evaluate', 'analyse', 'analyze',
      'player', 'development', 'progress', 'report',
    ],
    phrases: [
      /player.*review/i, /review.*player/i, /player.*report/i,
      /develop.*review/i, /player.*assess/i,
    ],
  },

  // ── Club report ─────────────────────────────────────────────────────────────
  club_report: {
    name:        'Create Full Club Report',
    description: 'Generate a comprehensive club intelligence report',
    baseSteps: [
      { actionId: 'create_club_report',      label: 'Generate club report',   depends: [],                  critical: true  },
      { actionId: 'generate_dor_report',     label: 'Generate DoR brief',     depends: [],                  critical: false, optional: true },
      { actionId: 'send_coach_notification', label: 'Notify all coaches',     depends: ['create_club_report'], critical: false, optional: true },
    ],
    keywords: [
      'club', 'whole', 'full', 'all', 'everything',
      'health', 'overview',
    ],
    phrases: [
      /club.*report/i, /full.*report/i, /club.*health/i,
      /club.*overview/i,
    ],
  },

  // ── Match report ─────────────────────────────────────────────────────────────
  match_report: {
    name:        'Generate Match Report',
    description: 'Create a post-match analysis and notify coaches',
    baseSteps: [
      { actionId: 'generate_match_report',   label: 'Generate match report',  depends: [],                      critical: true  },
      { actionId: 'generate_pdf',            label: 'Export PDF',             depends: ['generate_match_report'], critical: false },
      { actionId: 'send_coach_notification', label: 'Notify coaches',         depends: ['generate_match_report'], critical: false, optional: true },
    ],
    keywords: [
      'match', 'game', 'fixture', 'result', 'performance',
    ],
    phrases: [
      /match.*report/i, /game.*report/i, /post.*match/i, /after.*game/i,
    ],
  },

  // ── Notify squad ─────────────────────────────────────────────────────────────
  notify_squad: {
    name:        'Notify Squad',
    description: 'Send a notification to players and coaches',
    baseSteps: [
      { actionId: 'send_player_notification', label: 'Notify players',    depends: [], critical: false },
      { actionId: 'send_coach_notification',  label: 'Notify coaches',    depends: [], critical: false },
    ],
    keywords: [
      'notify', 'notification', 'message', 'alert', 'send', 'tell',
      'announce',
    ],
    phrases: [
      /notify.*squad/i, /send.*notif/i, /message.*players/i, /alert.*team/i,
    ],
  },

  // ── Weekly communications pack ──────────────────────────────────────────────
  communications_pack: {
    name:        'Generate Weekly Communications Pack',
    description: 'Build the full weekly club communications pack — newsletter, results, reminders, sponsors, social media, committee summary',
    baseSteps: [
      { actionId: 'build_communications_pack', label: 'Build full weekly pack',         depends: [],                          critical: true  },
      { actionId: 'generate_communication',    label: 'Preview newsletter draft',       depends: ['build_communications_pack'], critical: false },
      { actionId: 'update_player_memory',      label: 'Log pack to memory',             depends: ['build_communications_pack'], critical: false },
      { actionId: 'schedule_communication',    label: 'Schedule approved items',        depends: ['build_communications_pack'], critical: false, optional: true },
      { actionId: 'send_coach_notification',   label: 'Notify coach — pack ready for review', depends: ['build_communications_pack'], critical: false },
    ],
    keywords: [
      'communication', 'pack', 'newsletter', 'weekly', 'club pack',
      'this week', 'weekly update', 'club update', 'results summary',
      'send update', 'comms pack', 'sponsor', 'volunteer', 'old boys',
      'member update', 'social media',
    ],
    phrases: [
      /communication.*pack/i, /weekly.*pack/i, /club.*newsletter/i,
      /this.*week.*communication/i, /prepare.*communication/i,
      /generate.*newsletter/i, /build.*newsletter/i, /weekly.*update/i,
      /club.*communication/i, /weekend.*communication/i,
      /send.*old.*boy/i, /sponsor.*thank/i, /volunteer.*request/i,
    ],
  },
};

// ── Intent scoring ────────────────────────────────────────────────────────────

function scoreTemplate(templateId, template, text) {
  const lower = text.toLowerCase();
  let score = 0;

  for (const kw of template.keywords) {
    if (lower.includes(kw)) score += 1;
  }
  for (const ph of template.phrases) {
    if (ph.test(text)) score += 3;
  }
  return score;
}

function selectTemplate(text) {
  let best = null, bestScore = 0;

  for (const [id, template] of Object.entries(TEMPLATES)) {
    const s = scoreTemplate(id, template, text);
    if (s > bestScore) { best = id; bestScore = s; }
  }

  return best ? { templateId: best, score: bestScore } : { templateId: 'build_session', score: 0 };
}

// ── Step ID generation ────────────────────────────────────────────────────────

function assignStepIds(steps) {
  return steps.map((s, i) => ({
    ...s,
    stepId:   `step_${i + 1}_${s.actionId}`,
    // remap depends from actionId → stepId form
    depends: (s.depends ?? []).map(depActionId => {
      const depStep = steps.find(x => x.actionId === depActionId);
      return depStep ? `step_${steps.indexOf(depStep) + 1}_${depActionId}` : depActionId;
    }),
  }));
}

// ── Public API ────────────────────────────────────────────────────────────────

let _defId = 0;

/**
 * Parse a natural language request into a WorkflowDefinition.
 * Returns null if the message clearly isn't a workflow request.
 */
export function parseWorkflow(text, existingContext = {}) {
  if (!text?.trim()) return null;

  const { templateId, score } = selectTemplate(text);
  const template = TEMPLATES[templateId];

  // If score is 0, the message doesn't match any workflow
  if (score === 0 && !isWorkflowRequest(text)) return null;

  const entities = { ...existingContext.entities, ...extractEntities(text) };
  const warnings = [];

  // Validate all action IDs exist in registry
  const validSteps = template.baseSteps.filter(s => {
    if (hasAction(s.actionId)) return true;
    warnings.push(`Action '${s.actionId}' not found in registry — step skipped`);
    return false;
  });

  if (!validSteps.length) {
    return null;
  }

  const steps = assignStepIds(validSteps);

  // Suppress schedule step if no date hint
  const hasDateHint = entities.dayOfWeek || entities.nextWeek || existingContext.scheduledFor;
  const finalSteps  = steps.filter(s => {
    if (s.actionId === 'schedule_future_session' && !hasDateHint) {
      warnings.push('No date specified — schedule step skipped');
      return false;
    }
    return true;
  });

  // Re-map depends for any removed steps
  const activeIds = new Set(finalSteps.map(s => s.stepId));
  for (const step of finalSteps) {
    step.depends = step.depends.filter(d => activeIds.has(d));
  }

  const confidence = Math.min(1, score / 5);

  return {
    id:          `wfdef_${Date.now()}_${(++_defId).toString(36)}`,
    intent:      templateId,
    name:        template.name,
    description: template.description,
    steps:       finalSteps,
    context:     {
      ...existingContext,
      entities,
      originalMessage: text,
    },
    confidence,
    warnings,
  };
}

/**
 * List all available workflow templates.
 */
export function listTemplates() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({
    id,
    name:        t.name,
    description: t.description,
    stepCount:   t.baseSteps.length,
    keywords:    t.keywords,
  }));
}

/**
 * Check if a message looks like a workflow request at all.
 * Catches generic "do X for Y" patterns not covered by templates.
 */
function isWorkflowRequest(text) {
  return /\b(build|create|generate|make|run|start|set up|schedule|send)\b/i.test(text);
}
