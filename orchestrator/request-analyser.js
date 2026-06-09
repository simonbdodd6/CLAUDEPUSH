/**
 * Request Analyser
 *
 * Maps a natural language message → OrchestratorRequest:
 * {
 *   requestId:       string
 *   rawMessage:      string
 *   requiredEngines: string[]    — engines needed, in no particular order yet
 *   entities:        object      — extracted values (ageGroup, playerName, etc.)
 *   intentSignals:   string[]    — matched intent labels
 *   confidence:      number      — 0–1 parse confidence
 * }
 *
 * No LLM required — keyword/regex scoring only.
 * Engine dependencies (e.g. memory-engine auto-include) are resolved here.
 */

import { getAllEngines, getCapable, getAlwaysRunEngines } from './engine-registry.js';

// ── Entity extraction ─────────────────────────────────────────────────────────

const AGE_GROUP_RE   = /\b(u\d{1,2}|seniors?|minis?|youths?|junior|adult)\b/i;
const PLAYER_NAME_RE = /(?:for|about|on|review|player|check)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)/;
const DAY_OF_WEEK_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const TIME_RE        = /\b(\d{1,2}[:h]\d{2})\b/;
const DURATION_RE    = /\b(\d{1,3})\s*(min(?:utes?)?|hrs?|hours?)\b/i;

function extractEntities(text) {
  const lower   = text.toLowerCase();
  const entities = {};

  const ag = text.match(AGE_GROUP_RE);
  if (ag) entities.ageGroup = normaliseAgeGroup(ag[1]);

  const pn = text.match(PLAYER_NAME_RE);
  if (pn) entities.playerName = pn[1];

  const day = lower.match(DAY_OF_WEEK_RE);
  if (day) entities.dayOfWeek = day[1];

  const time = text.match(TIME_RE);
  if (time) entities.time = time[1].replace('h', ':');

  const dur = text.match(DURATION_RE);
  if (dur) {
    const v = parseInt(dur[1], 10);
    entities.durationMinutes = /hr|hour/i.test(dur[2]) ? v * 60 : v;
  }

  // Session focus
  if (/fitness|condition/i.test(lower))              entities.sessionFocus = 'fitness and conditioning';
  if (/lineout/i.test(lower))                         entities.sessionFocus = 'lineout';
  if (/scrum/i.test(lower))                           entities.sessionFocus = 'scrummaging';
  if (/tackle|defence|defense/i.test(lower))          entities.sessionFocus = 'defence';
  if (/attack|backline/i.test(lower))                 entities.sessionFocus = 'attack';
  if (/skills?/i.test(lower))                         entities.sessionFocus = 'skills';
  if (/match.?prep/i.test(lower))                     entities.sessionFocus = 'match preparation';
  if (/preseason|pre-season/i.test(lower))            entities.seasonPhase  = 'preseason';
  if (/off.?season/i.test(lower))                     entities.seasonPhase  = 'off-season';

  return entities;
}

function normaliseAgeGroup(raw) {
  const l = raw.toLowerCase();
  if (/senior|adult/.test(l)) return 'Senior';
  if (/mini/.test(l))         return 'Mini';
  if (/youth/.test(l))        return 'Youth';
  if (/junior/.test(l))       return 'Junior';
  const num = l.match(/u(\d{1,2})/);
  if (num) return `U${num[1]}`;
  return raw;
}

// ── Intent → capability mapping ───────────────────────────────────────────────

const INTENT_SIGNALS = [
  // Player / squad data
  { patterns: [/\b(check|find|load|get|look.?up)\s+(players?|squad|team|roster)\b/i,
               /\b(all players?|full squad)\b/i],
    capabilities: ['data_load', 'player_lookup'] },

  // Injury / rehabilitation
  { patterns: [/\binjur/i, /\brehab/i, /\brecovery\b/i, /\bphysiotherapy\b/i, /\bhurt\b/i,
               /check.*injur/i, /injured\s+player/i, /injury\s+risk/i],
    capabilities: ['injury_check'] },

  // Player development / progress
  { patterns: [/\b(analys|assess|evaluat|review|progress|development)\b.*\b(player|squad|team)\b/i,
               /\b(player|squad|team)\b.*\b(analys|assess|evaluat|review|progress)\b/i,
               /\b(player (review|progress|assessment|report))\b/i,
               /\b(how.*player|player.*doing)\b/i,
               /flag.*review/i, /\bneeding.*review\b/i],
    capabilities: ['player_analysis'] },

  // Session / training creation
  { patterns: [/\b(build|create|generate|make|plan|prepare|set up)\b.{0,30}\b(session|training|drill|practice)\b/i,
               /\b(training session|session plan|practice session)\b/i,
               /\bprepare\s+(thursday|monday|tuesday|wednesday|friday|saturday|sunday|the|u\d{1,2}|senior|junior)/i,
               /\b(next|this)\s+(session|training|practice)\b/i,
               /\b(scrum|lineout|tackle|fitness|skills?)\s+(session|training|drill|technique)\b/i,
               /\b(session|training)\s+(for|with)\s+(the|u\d{1,2}|senior|junior)/i],
    capabilities: ['session_create'] },

  // Workflow actions (PDF, notify, season plan)
  { patterns: [/\b(pdf|print|export|document|printable)\b/i],
    capabilities: ['pdf_generate'] },
  { patterns: [/\b(notify|notification|alert|message|tell|send)\s+(coach|player|squad|team)\b/i,
               /\b(coaches.*notif|notif.*coach|message.*squad)\b/i],
    capabilities: ['notify_coaches'] },
  { patterns: [/\b(season plan|update.*season|season.*update|objectives|season.?objectives)\b/i],
    capabilities: ['season_update'] },

  // General workflow / multi-step actions
  { patterns: [/\b(workflow|chain|automate|step.?by.?step)\b/i,
               /\b(generate.*and.*notify|create.*and.*send)\b/i],
    capabilities: ['workflow_execute'] },

  // Club-level overview
  { patterns: [/\b(club report|club overview|director of rugby|dor brief|club health)\b/i,
               /\b(across the club|club.?wide|overall club)\b/i],
    capabilities: ['club_overview'] },

  // AI synthesis / copilot
  { patterns: [/\b(suggest|recommend|what should|overall analysis|best approach|copilot)\b/i,
               /\b(analyse everything|full analysis|complete overview)\b/i],
    capabilities: ['ai_assist'] },

  // Rugby knowledge / technique
  { patterns: [/\b(rules?|laws?|technique|how to|breakdown|ruck|maul|lineout technique)\b/i,
               /\b(best drill|drill ideas|training ideas)\b/i],
    capabilities: ['rules_knowledge'] },

  // Market / commercial
  { patterns: [/\b(market|leads?|prospects?|commercial|sponsorship|membership)\b/i],
    capabilities: ['market_research'] },

  // Lead personalisation
  { patterns: [/\b(personalise|personali[sz]|outreach|pitch|email campaign)\b/i],
    capabilities: ['lead_outreach'] },
];

// Capability → engine name mapping
const CAPABILITY_ENGINE_MAP = {
  data_load:        ['memory-engine'],
  player_lookup:    ['memory-engine'],
  injury_check:     ['memory-engine', 'player-development'],
  player_analysis:  ['player-development'],
  session_create:   ['coaching-engine'],
  pdf_generate:     ['workflow-engine'],
  notify_coaches:   ['workflow-engine'],
  season_update:    ['workflow-engine'],
  workflow_execute: ['workflow-engine'],
  club_overview:    ['club-intelligence'],
  ai_assist:        ['ai-copilot'],
  rules_knowledge:  ['rugby-knowledge'],
  market_research:  ['market-intel', 'discovery-agent'],
  lead_outreach:    ['lead-personalisation', 'market-intel'],
};

// Engines that should auto-include when any "coaching-focused" engine is selected
const COACHING_ENGINES   = new Set(['coaching-engine', 'player-development', 'workflow-engine', 'club-intelligence']);
const PREREQ_PROVIDER    = 'memory-engine';   // auto-included when coaching engines are present

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreSignals(text) {
  const matched = new Set();
  const signals = [];

  for (const signal of INTENT_SIGNALS) {
    for (const pattern of signal.patterns) {
      if (pattern.test(text)) {
        for (const cap of signal.capabilities) matched.add(cap);
        signals.push(...signal.capabilities);
        break;
      }
    }
  }

  return { capabilities: [...matched], signals };
}

function capabilitiesToEngines(capabilities, registeredEngines) {
  const engineNames = new Set();

  for (const cap of capabilities) {
    const mapped = CAPABILITY_ENGINE_MAP[cap] ?? [];
    for (const name of mapped) {
      if (registeredEngines.has(name)) engineNames.add(name);
    }
    // Also check registry directly
    for (const eng of getCapable(cap)) {
      if (registeredEngines.has(eng.name)) engineNames.add(eng.name);
    }
  }

  return [...engineNames];
}

// ── Public API ────────────────────────────────────────────────────────────────

let _reqSeq = 0;

/**
 * Parse a natural language message into an OrchestratorRequest.
 */
export function analyseRequest(message, options = {}) {
  const requestId   = `orch_req_${Date.now()}_${(++_reqSeq).toString(36)}`;
  const text        = message?.trim() ?? '';
  const lower       = text.toLowerCase();

  const entities    = { ...extractEntities(text), ...options.entities };
  const { capabilities, signals } = scoreSignals(text);

  // Build set of registered engine names for fast lookup
  const allEngines      = getAllEngines();
  const registeredNames = new Set(allEngines.map(e => e.name));

  let requiredEngines = capabilitiesToEngines(capabilities, registeredNames);

  // Auto-include memory-engine when coaching-focused engines are present
  if (!requiredEngines.includes(PREREQ_PROVIDER)) {
    if (requiredEngines.some(name => COACHING_ENGINES.has(name))) {
      requiredEngines.unshift(PREREQ_PROVIDER);
    }
  }

  // Auto-include discovery-agent if market-intel is needed (it produces prospects for it)
  if (requiredEngines.includes('market-intel') && !requiredEngines.includes('discovery-agent')) {
    requiredEngines.push('discovery-agent');
  }

  // Add all alwaysRun engines
  for (const eng of getAlwaysRunEngines()) {
    if (!requiredEngines.includes(eng.name)) requiredEngines.unshift(eng.name);
  }

  // If nothing detected at all, try memory + ai-copilot as a fallback
  if (requiredEngines.length === 0 && text.length > 10) {
    requiredEngines = [PREREQ_PROVIDER, 'ai-copilot'].filter(n => registeredNames.has(n));
  }

  // Remove any engine names that aren't registered
  requiredEngines = [...new Set(requiredEngines)].filter(n => registeredNames.has(n));

  const confidence = capabilities.length > 0
    ? Math.min(1, capabilities.length / 4)
    : 0.2;

  return {
    requestId,
    rawMessage:      text,
    requiredEngines,
    entities,
    intentSignals:   [...new Set(signals)],
    capabilities:    [...new Set(capabilities)],
    confidence,
    options:         options ?? {},
  };
}
