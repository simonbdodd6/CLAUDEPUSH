// Query parser — natural language text → structured Query object.
// Uses regex intent detection and keyword extraction.

import { DOMAINS } from './knowledge-index.js';

export const INTENTS = {
  INJURY_REPORT:      'injury_report',
  ATTENDANCE_WORST:   'attendance_worst',
  ATTENDANCE_COMPARE: 'attendance_compare',
  ATTENDANCE_REPORT:  'attendance_report',
  SPONSOR_EXPIRY:     'sponsor_expiry',
  SPONSOR_REPORT:     'sponsor_report',
  COACH_SUMMARY:      'coach_summary',
  HEALTH_SUMMARY:     'health_summary',
  VOLUNTEER_INACTIVE: 'volunteer_inactive',
  VOLUNTEER_REPORT:   'volunteer_report',
  PLAYER_FIND:        'player_find',
  TEAM_REPORT:        'team_report',
  MEMBERSHIP_REPORT:  'membership_report',
  FIXTURE_UPCOMING:   'fixture_upcoming',
  MATCH_HISTORY:      'match_history',
  TRAINING_REPORT:    'training_report',
  COMMS_PENDING:      'comms_pending',
  GENERAL:            'general',
};

// Intent patterns — ordered by specificity (most specific first)
const INTENT_PATTERNS = [
  { intent: INTENTS.ATTENDANCE_COMPARE,  pattern: /compare.*attend|attend.*vs|attend.*last.*season|last.*season.*attend|this.*season.*vs/i },
  { intent: INTENTS.INJURY_REPORT,       pattern: /injur|hurt|physio|out.*week|unavailable|hamstring|acl|concuss|torn|sprain/i },
  { intent: INTENTS.ATTENDANCE_WORST,    pattern: /miss.*most.*train|miss.*most.*session|most.*absent|who.*miss|lowest.*attend|worst.*attend|absent.*most/i },
  { intent: INTENTS.ATTENDANCE_REPORT,   pattern: /attend.*report|training.*attend|session.*attend|attend.*rate|average.*attend/i },
  { intent: INTENTS.SPONSOR_EXPIRY,      pattern: /sponsor.*expir|expir.*sponsor|sponsor.*month|expir.*month|sponsor.*due|renew.*sponsor/i },
  { intent: INTENTS.SPONSOR_REPORT,      pattern: /sponsor.*report|show.*sponsor|list.*sponsor|all.*sponsor/i },
  { intent: INTENTS.COACH_SUMMARY,       pattern: /coach.*achiev|what.*coach.*done|coach.*this.*season|coach.*perform|coach.*result|achieve.*season/i },
  { intent: INTENTS.HEALTH_SUMMARY,      pattern: /club.*health|health.*club|how.*healthy|health.*score|club.*score|summar.*club|club.*summar|overall.*health/i },
  { intent: INTENTS.VOLUNTEER_INACTIVE,  pattern: /who.*hasn.*volunteer|volunteer.*recent|not.*volunteer|inactive.*volunteer|volunteer.*inactive|last.*help/i },
  { intent: INTENTS.VOLUNTEER_REPORT,    pattern: /volunteer.*report|show.*volunteer|list.*volunteer|all.*volunteer/i },
  { intent: INTENTS.TEAM_REPORT,         pattern: /team.*report|team.*perform|team.*stat|team.*season|how.*team.*doing/i },
  { intent: INTENTS.MEMBERSHIP_REPORT,   pattern: /membership.*report|how.*many.*member|member.*status|registered.*player|who.*register|membership.*expir|lapsed.*member/i },
  { intent: INTENTS.FIXTURE_UPCOMING,    pattern: /upcoming.*fix|next.*match|next.*game|fix.*upcoming|schedule|fixture.*this.*week|when.*play/i },
  { intent: INTENTS.MATCH_HISTORY,       pattern: /match.*result|result.*match|win.*loss|last.*match|match.*histor|recent.*result|how.*many.*win/i },
  { intent: INTENTS.TRAINING_REPORT,     pattern: /training.*session|session.*report|training.*this.*week|recent.*training|last.*session/i },
  { intent: INTENTS.COMMS_PENDING,       pattern: /pending.*comm|comm.*pending|unsent|awaiting.*approval|draft.*comm|scheduled.*comm/i },
  { intent: INTENTS.PLAYER_FIND,         pattern: /show.*player|find.*player|list.*player|which.*player|who.*play|all.*player/i },
];

// Domain mapping for each intent
const INTENT_DOMAIN = {
  [INTENTS.INJURY_REPORT]:      DOMAINS.MEDICAL,
  [INTENTS.ATTENDANCE_WORST]:   DOMAINS.PLAYERS,
  [INTENTS.ATTENDANCE_COMPARE]: DOMAINS.ATTENDANCE,
  [INTENTS.ATTENDANCE_REPORT]:  DOMAINS.ATTENDANCE,
  [INTENTS.SPONSOR_EXPIRY]:     DOMAINS.SPONSORS,
  [INTENTS.SPONSOR_REPORT]:     DOMAINS.SPONSORS,
  [INTENTS.COACH_SUMMARY]:      DOMAINS.TEAMS,
  [INTENTS.HEALTH_SUMMARY]:     DOMAINS.FACILITIES,
  [INTENTS.VOLUNTEER_INACTIVE]: DOMAINS.VOLUNTEERS,
  [INTENTS.VOLUNTEER_REPORT]:   DOMAINS.VOLUNTEERS,
  [INTENTS.PLAYER_FIND]:        DOMAINS.PLAYERS,
  [INTENTS.TEAM_REPORT]:        DOMAINS.TEAMS,
  [INTENTS.MEMBERSHIP_REPORT]:  DOMAINS.MEMBERSHIP,
  [INTENTS.FIXTURE_UPCOMING]:   DOMAINS.FIXTURES,
  [INTENTS.MATCH_HISTORY]:      DOMAINS.MATCH_HISTORY,
  [INTENTS.TRAINING_REPORT]:    DOMAINS.TRAINING,
  [INTENTS.COMMS_PENDING]:      DOMAINS.COMMUNICATIONS,
  [INTENTS.GENERAL]:            null,
};

// Position normalisation
const POSITION_PATTERNS = [
  { tags: ['prop', 'tighthead', 'loosehead'],   pattern: /\bprop\b|tight.*head|loose.*head|tighthead|loosehead/i },
  { tags: ['hooker'],                            pattern: /\bhooker\b/i },
  { tags: ['lock'],                              pattern: /\block\b|\bsecond.*row\b/i },
  { tags: ['flanker'],                           pattern: /flanker|openside|blindside/i },
  { tags: ['number8', 'eighthman'],              pattern: /number.*8|no\.?.*8|eighth.?man|number eight/i },
  { tags: ['scrum-half'],                        pattern: /scrum.?half|\bsh\b|half.?back/i },
  { tags: ['out-half', 'flyhalf'],               pattern: /out.?half|fly.?half|\boh\b|\b10\b/i },
  { tags: ['centre'],                            pattern: /\bcentre\b|\bcenter\b|\b12\b|\b13\b/i },
  { tags: ['wing'],                              pattern: /\bwing\b|winger/i },
  { tags: ['fullback'],                          pattern: /full.?back|\bfb\b|\b15\b/i },
  { tags: ['forward'],                           pattern: /forward|front.*row|back.*row|loose.*forward/i },
  { tags: ['back'],                              pattern: /\bback[s]?\b|three.?quarter/i },
];

// Age group extraction
const AGE_PATTERNS = [
  { ageGroup: 'U14', pattern: /u14|under.?14|under-14/i },
  { ageGroup: 'U15', pattern: /u15|under.?15/i },
  { ageGroup: 'U16', pattern: /u16|under.?16/i },
  { ageGroup: 'U17', pattern: /u17|under.?17/i },
  { ageGroup: 'U18', pattern: /u18|under.?18/i },
  { ageGroup: 'U19', pattern: /u19|under.?19/i },
  { ageGroup: 'U20', pattern: /u20|under.?20/i },
  { ageGroup: 'Senior', pattern: /senior|1st.*xv|first.*xv|adult|premier/i },
  { ageGroup: 'Junior', pattern: /junior/i },
];

// Time range extraction
const TIME_PATTERNS = [
  { range: 'this_month',  pattern: /this.*month|current.*month/i,   days: 30 },
  { range: 'this_week',   pattern: /this.*week|current.*week/i,     days: 7  },
  { range: 'this_season', pattern: /this.*season|current.*season/i, days: 300 },
  { range: 'last_season', pattern: /last.*season|previous.*season/i, days: -300 },
  { range: 'recent',      pattern: /recent|lately|last.*30|past.*month/i, days: 30 },
  { range: 'last_month',  pattern: /last.*month|past.*month/i,      days: 60 },
];

export function parseQuery(text) {
  if (!text?.trim()) return { intent: INTENTS.GENERAL, domain: null, filters: {}, raw: '' };

  const raw = text.trim();

  // Detect intent
  let intent = INTENTS.GENERAL;
  for (const { intent: i, pattern } of INTENT_PATTERNS) {
    if (pattern.test(raw)) { intent = i; break; }
  }

  const domain = INTENT_DOMAIN[intent] ?? null;

  // Extract position filter
  const positionFilter = [];
  for (const { tags, pattern } of POSITION_PATTERNS) {
    if (pattern.test(raw)) positionFilter.push(...tags);
  }

  // Extract age group filter
  const ageGroups = [];
  for (const { ageGroup, pattern } of AGE_PATTERNS) {
    if (pattern.test(raw)) ageGroups.push(ageGroup);
  }

  // Extract time range
  let timeRange = null;
  for (const t of TIME_PATTERNS) {
    if (t.pattern.test(raw)) { timeRange = t; break; }
  }

  // Extract name mention (simple: capitalised words not matching keywords)
  const STOP_WORDS = new Set(['Show', 'Who', 'Which', 'What', 'How', 'Where', 'When', 'List', 'Find', 'Compare', 'The', 'All']);
  const nameMention = raw.split(/\s+/)
    .filter(w => /^[A-Z][a-z]+$/.test(w) && !STOP_WORDS.has(w))
    .join(' ') || null;

  // Comparison check
  const isComparison = /compare|vs\.?|versus|differ|change/i.test(raw);

  // Limit (top N / how many)
  const limitMatch = raw.match(/top\s*(\d+)|first\s*(\d+)|(\d+)\s*players?/i);
  const limit = limitMatch ? parseInt(limitMatch[1] ?? limitMatch[2] ?? limitMatch[3]) : null;

  return {
    raw,
    intent,
    domain,
    filters: {
      positions:  positionFilter.length > 0 ? positionFilter : null,
      ageGroups:  ageGroups.length > 0 ? ageGroups : null,
      name:       nameMention,
      active:     /active|current|playing/i.test(raw) ? true : null,
      injured:    /injur|hurt|unavailable/i.test(raw) ? true : null,
    },
    timeRange,
    isComparison,
    limit: limit ?? 20,
  };
}

export function describeQuery(q) {
  const parts = [`Intent: ${q.intent}`, `Domain: ${q.domain ?? 'general'}`];
  if (q.filters.positions?.length) parts.push(`Positions: ${q.filters.positions.join(', ')}`);
  if (q.filters.ageGroups?.length) parts.push(`Age groups: ${q.filters.ageGroups.join(', ')}`);
  if (q.filters.name)              parts.push(`Name mention: "${q.filters.name}"`);
  if (q.timeRange)                 parts.push(`Time: ${q.timeRange.range}`);
  if (q.isComparison)              parts.push('Comparison query');
  return parts.join(' · ');
}
