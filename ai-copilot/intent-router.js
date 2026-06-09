/**
 * Intent Router
 * Determines user intent from free-text coach messages.
 * Uses weighted keyword/phrase scoring — no LLM dependency.
 * Returns { intent, confidence, entities, alternates }
 */

// ── Intent definitions ────────────────────────────────────────────────────────

const INTENTS = {
  build_session: {
    label:    'Build Training Session',
    keywords: ['session', 'tonight', 'training', 'drill', 'warmup', 'practice', 'run', 'tonight', 'workout'],
    phrases:  ['build.*session', 'plan.*session', 'create.*session', "tonight'?s.*train", 'training.*tonight', 'run.*session'],
    weight:   1.0,
  },
  build_programme: {
    label:    'Build Training Programme',
    keywords: ['programme', 'program', 'plan', 'block', 'cycle', 'week', 'preseason', 'schedule'],
    phrases:  ['\\d+.?week', 'build.*plan', 'create.*programme', 'training.*plan', 'preseason.*plan', 'next.*block'],
    weight:   1.0,
  },
  player_progress: {
    label:    'Player Progress Check',
    keywords: ['progress', 'developing', 'improvement', 'how is', 'how are', 'status', 'update'],
    phrases:  ['how.*progress', 'how.*doing', 'how.*getting on', 'player.*progress', 'progress.*check'],
    weight:   0.9,
  },
  injury_risk: {
    label:    'Injury Risk Assessment',
    keywords: ['injury', 'risk', 'hurt', 'injured', 'pain', 'clearance', 'medical', 'fitness', 'vulnerable'],
    phrases:  ['injury.*risk', 'at.*risk', 'highest.*risk', 'who.*risk', 'risk.*assess'],
    weight:   0.9,
  },
  weekly_plan: {
    label:    'Weekly Coaching Plan',
    keywords: ['this week', 'next week', 'week', 'focus', 'priority', 'concentrate', 'should we'],
    phrases:  ['this.*week', 'next.*week', 'what.*work.*on', 'focus.*week', 'week.*focus', 'should.*work'],
    weight:   0.85,
  },
  session_summary: {
    label:    'Session Summary',
    keywords: ['summarise', 'summarize', 'summary', 'recap', 'last', 'recent', 'previous', 'sessions'],
    phrases:  ['last.*session', 'recent.*session', 'summarise.*session', 'recap.*session', 'last.*\\d+.*session'],
    weight:   0.9,
  },
  player_compare: {
    label:    'Player Comparison',
    keywords: ['compare', 'comparison', 'versus', 'vs', 'against', 'between', 'both', 'two', 'difference'],
    phrases:  ['compare.*player', 'compare.*our', 'versus', 'two.*\\w+', '\\w+.*vs.*\\w+'],
    weight:   0.95,
  },
  squad_analysis: {
    label:    'Squad Analysis',
    keywords: ['squad', 'team', 'weakest', 'strongest', 'find', 'analyse', 'overall', 'whole', 'everyone'],
    phrases:  ['squad.*analy', 'weakest.*area', 'team.*analy', 'find.*weak', 'whole.*squad', 'entire.*team'],
    weight:   0.9,
  },
  build_rehab: {
    label:    'Rehabilitation Programme',
    keywords: ['rehab', 'rehabilitation', 'recovery', 'return.*play', 'injured', 'physio', 'heal'],
    phrases:  ['rehab.*programme', 'rehab.*plan', 'return.*play', 'recovery.*plan', 'rehabilitation'],
    weight:   1.0,
  },
  knowledge_query: {
    label:    'Rugby Knowledge Query',
    keywords: ['how', 'what', 'why', 'explain', 'law', 'rule', 'drill', 'technique', 'tactics', 'defensive', 'offensive'],
    phrases:  ['how.*do', 'what.*is', 'explain.*', 'best.*practice', 'coaching.*tip'],
    weight:   0.6,
  },
};

// ── Entity extractors ─────────────────────────────────────────────────────────

const AGE_GROUPS      = ['U8', 'U10', 'U12', 'U14', 'U16', 'U18', 'U20', 'Senior'];
const POSITIONS       = ['prop', 'hooker', 'lock', 'flanker', 'number 8', 'scrum-half', 'fly-half', 'centre', 'wing', 'fullback', 'tighthead', 'loosehead', 'openside', 'blindside'];
const SEASON_PHASES   = ['preseason', 'pre-season', 'early season', 'mid season', 'late season', 'off season', 'off-season'];
const SESSION_TYPES   = ['strength', 'conditioning', 'speed', 'agility', 'lineout', 'scrummaging', 'breakdown', 'contact', 'skills', 'defence', 'attack', 'kicking'];

function extractEntities(text) {
  const lower = text.toLowerCase();
  const entities = {};

  // Age group
  for (const ag of AGE_GROUPS) {
    if (lower.includes(ag.toLowerCase())) { entities.ageGroup = ag; break; }
  }

  // Position
  for (const pos of POSITIONS) {
    if (lower.includes(pos.toLowerCase())) { entities.position = pos; break; }
  }

  // Season phase
  for (const phase of SEASON_PHASES) {
    if (lower.includes(phase)) { entities.seasonPhase = phase.replace(' ', '-'); break; }
  }

  // Session type / focus
  for (const type of SESSION_TYPES) {
    if (lower.includes(type)) { entities.sessionFocus = type; break; }
  }

  // Duration — "12-week", "8 week"
  const durationMatch = lower.match(/(\d+).?week/);
  if (durationMatch) entities.durationWeeks = parseInt(durationMatch[1], 10);

  // Timeframe
  if (lower.includes('tonight'))     entities.timeframe = 'tonight';
  else if (lower.includes('next week'))  entities.timeframe = 'next-week';
  else if (lower.includes('this week'))  entities.timeframe = 'this-week';

  // Count — "last four", "two hookers"
  const countWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  for (const [word, num] of Object.entries(countWords)) {
    if (lower.includes(word)) { entities.count = num; break; }
  }
  const numMatch = lower.match(/last\s+(\d+)/);
  if (numMatch) entities.count = parseInt(numMatch[1], 10);

  // Player name — capitalised words not in stop list
  const stopWords = new Set(['Build', 'Create', 'How', 'Who', 'What', 'Find', 'Compare', 'Generate',
    'Summarise', 'Summarize', 'Show', 'Get', 'Our', 'The', 'Is', 'Are', 'Last', 'Next', 'This']);
  const namePattern = /\b([A-Z][a-z]+(?: [A-Z][a-z]+)?)\b/g;
  const nameMatches = [...text.matchAll(namePattern)]
    .map(m => m[1])
    .filter(n => !stopWords.has(n) && n.length > 2);
  if (nameMatches.length > 0) entities.playerName = nameMatches[0];

  return entities;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreIntent(text, intentKey, config) {
  const lower = text.toLowerCase();
  let score = 0;

  // Keyword scoring
  for (const kw of config.keywords) {
    if (lower.includes(kw)) score += 1;
  }

  // Phrase scoring (weighted higher)
  for (const phrase of config.phrases) {
    try {
      if (new RegExp(phrase, 'i').test(lower)) score += 2;
    } catch { /* skip bad regex */ }
  }

  return score * config.weight;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function routeIntent(message) {
  const scores = Object.entries(INTENTS).map(([key, config]) => ({
    intent:     key,
    label:      config.label,
    rawScore:   scoreIntent(message, key, config),
  }));

  scores.sort((a, b) => b.rawScore - a.rawScore);

  const top       = scores[0];
  const total     = scores.reduce((s, x) => s + x.rawScore, 0);
  const confidence = total > 0 ? Math.min(0.99, top.rawScore / Math.max(total, 1)) : 0;

  // Normalise confidence to readable band
  const band =
    confidence >= 0.5 ? 'high' :
    confidence >= 0.25 ? 'medium' : 'low';

  // Intent with zero score → fall back to knowledge_query
  const intent = top.rawScore > 0 ? top.intent : 'knowledge_query';

  return {
    intent,
    label:      INTENTS[intent]?.label ?? intent,
    confidence: Math.round(confidence * 100) / 100,
    band,
    entities:   extractEntities(message),
    alternates: scores.slice(1, 3).filter(s => s.rawScore > 0).map(s => ({ intent: s.intent, label: s.label })),
    message,
  };
}

export { INTENTS };
