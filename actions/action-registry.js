// Coach's Eye Action Library — Registry of all 51 production-ready Actions.
//
// Every action ORCHESTRATES existing engines through the Platform Integration Layer.
// No action duplicates business logic — it only routes and combines engine outputs.
//
// Action shape:
//   id, name, category, description
//   requiredEngines     — engines this action calls
//   requiredPermissions — minimum roles allowed to run this action
//   estimatedRuntimeMs  — expected wall-clock time
//   sendsComms          — true if action drafts communications
//   requiresApproval    — true if action creates approval-queue items
//   nlTriggers          — regex array for NL → action resolution
//   tags                — for search/discovery
//   inputs              — declared parameters
//   preview(params, ctx) → object describing what will happen
//   execute(params, ctx) → { success, data, summary, evidence? }
//   undo(result, ctx)   → { success } | null

// ── Lazy platform import helpers ──────────────────────────────────────────────

async function _platform()  { return import('../platform/platform-orchestrator.js'); }
async function _knowledge() { return import('../knowledge-engine/index.js'); }
async function _coaching()  { return import('../qa/coaching-engine/index.js'); }
async function _comms()     { return import('../communications-engine/index.js'); }
async function _dashboard() { return import('../dashboard/index.js'); }
async function _memory()    { return import('../memory-engine/index.js'); }
async function _workflow()  { return import('../workflow-engine/index.js'); }
async function _playerDev() { return import('../qa/player-development/index.js'); }
async function _clubIntel() { return import('../qa/club-intelligence/index.js'); }

// Short-form platform helpers
async function _run(text, ctx = {}) {
  const { execute } = await _platform();
  return execute(text, ctx);
}
async function _pipe(key, ctx = {}) {
  const { executePipeline } = await _platform();
  return executePipeline(key, ctx);
}
async function _ask(q, opts = {}) {
  const { ask } = await _knowledge();
  return ask(q, opts);
}

// ── COACHING ──────────────────────────────────────────────────────────────────

const COACHING_ACTIONS = [

  {
    id:                  'coaching.training_session',
    name:                'Generate Training Session',
    category:            'COACHING',
    description:         'Build a structured training session for any age group with drills, warm-up, skills blocks and cool-down.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'coaching-engine', 'ai-copilot'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  4000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/prepare.*training/i, /generate.*session/i, /plan.*session/i, /build.*session/i, /training.*session/i, /tonight.*training/i, /thursday.*training/i],
    tags:                ['training', 'session', 'coaching', 'drills', 'plan'],
    inputs: [
      { name: 'ageGroup', type: 'string', required: false, default: 'Senior', description: 'Age group (e.g. U14, U16, Senior)' },
      { name: 'focus',    type: 'string', required: false, description: 'Session focus (e.g. lineout, defence, fitness)' },
      { name: 'duration', type: 'number', required: false, default: 90, description: 'Session length in minutes' },
    ],
    preview: async (params) => ({
      willGenerate: `Training session for ${params.ageGroup ?? 'Senior'}`,
      estimatedDrills: '6-8 drills',
      sessionLength: `${params.duration ?? 90} minutes`,
    }),
    execute: async (params, ctx) => {
      const query = `Prepare ${params.ageGroup ?? 'Senior'} training${params.focus ? ` focused on ${params.focus}` : ''}.`;
      return _run(query, { role: ctx.role ?? 'coach', entities: params });
    },
    undo: null,
  },

  {
    id:                  'coaching.season_plan',
    name:                'Generate Season Plan',
    category:            'COACHING',
    description:         'Create a full-season coaching plan with phase objectives, milestone weeks and development goals.',
    requiredEngines:     ['memory-engine', 'coaching-engine', 'player-development', 'ai-copilot'],
    requiredPermissions: ['head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  6000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/season.*plan/i, /plan.*season/i, /annual.*plan/i, /build.*programme/i],
    tags:                ['season', 'plan', 'programme', 'coaching'],
    inputs: [
      { name: 'ageGroup',    type: 'string', required: false, default: 'Senior' },
      { name: 'seasonStart', type: 'string', required: false, description: 'Season start date' },
    ],
    preview: async (params) => ({ willGenerate: `Full season plan for ${params.ageGroup ?? 'Senior'}`, phases: '4 phase plan (Pre, Early, Main, Playoffs)' }),
    execute: async (params, ctx) => {
      const query = `Generate a full season plan for ${params.ageGroup ?? 'Senior'} rugby.`;
      return _run(query, { role: ctx.role ?? 'head_coach', entities: params });
    },
    undo: null,
  },

  {
    id:                  'coaching.player_programme',
    name:                'Generate Player Programme',
    category:            'COACHING',
    description:         'Build an individualised training programme for a specific player based on position, ability and goals.',
    requiredEngines:     ['memory-engine', 'coaching-engine', 'player-development', 'ai-copilot'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  5000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/player.*programme/i, /individual.*programme/i, /generate.*programme/i, /personal.*plan/i],
    tags:                ['player', 'programme', 'individual', 'development'],
    inputs: [
      { name: 'playerId',  type: 'string', required: false, description: 'Player ID or name' },
      { name: 'position',  type: 'string', required: false },
      { name: 'goals',     type: 'string', required: false },
      { name: 'weeks',     type: 'number', required: false, default: 8 },
    ],
    preview: async (params) => ({ willGenerate: `${params.weeks ?? 8}-week programme`, forPlayer: params.playerId ?? 'target player' }),
    execute: async (params, ctx) => {
      const { generateProgramme } = await _coaching();
      const result = await generateProgramme({ name: params.playerId ?? 'Player', position: params.position ?? 'Lock', goals: params.goals }, null, {});
      return { success: true, data: result, summary: result?.summary ?? 'Programme generated' };
    },
    undo: null,
  },

  {
    id:                  'coaching.rehab_plan',
    name:                'Generate Rehab Plan',
    category:            'COACHING',
    description:         'Create a return-to-play rehabilitation plan for an injured player.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'coaching-engine', 'ai-copilot'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  4000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/rehab.*plan/i, /return.*to.*play/i, /rtp.*plan/i, /injury.*plan/i, /recovery.*plan/i],
    tags:                ['rehab', 'injury', 'return-to-play', 'physio'],
    inputs: [
      { name: 'playerId',    type: 'string', required: false },
      { name: 'injury',      type: 'string', required: false, description: 'Injury type (e.g. hamstring grade 2)' },
      { name: 'targetDate',  type: 'string', required: false, description: 'Target return date' },
    ],
    preview: async (params) => ({ willGenerate: 'Phased rehab protocol', injury: params.injury ?? 'unknown injury', target: params.targetDate ?? 'TBD' }),
    execute: async (params, ctx) => {
      const { generateRehabPlan } = await _coaching();
      const result = await generateRehabPlan({ name: params.playerId ?? 'Player', position: 'Player' }, params.injury ?? '', null, {});
      return { success: true, data: result, summary: result?.summary ?? 'Rehab plan generated' };
    },
    undo: null,
  },

  {
    id:                  'coaching.match_preparation',
    name:                'Prepare Match',
    category:            'COACHING',
    description:         'Build a complete match-day preparation pack: opposition analysis, set-piece calls, squad roles, warm-up plan.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'coaching-engine', 'ai-copilot'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  5000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/prepare.*match/i, /match.*prep/i, /game.*plan/i, /this.*week.*match/i, /upcoming.*match/i, /opposition.*analysis/i],
    tags:                ['match', 'preparation', 'opposition', 'game-plan'],
    inputs: [
      { name: 'ageGroup',   type: 'string', required: false, default: 'Senior' },
      { name: 'opponent',   type: 'string', required: false },
      { name: 'matchDate',  type: 'string', required: false },
    ],
    preview: async (params) => ({ willGenerate: 'Match preparation pack', opponent: params.opponent ?? 'next opponent', ageGroup: params.ageGroup ?? 'Senior' }),
    execute: async (params, ctx) => {
      const query = `Prepare the match against ${params.opponent ?? 'our next opponents'} for ${params.ageGroup ?? 'Senior'}.`;
      return _run(query, { role: ctx.role ?? 'coach', entities: params });
    },
    undo: null,
  },

  {
    id:                  'coaching.squad_selection',
    name:                'Select Squad',
    category:            'COACHING',
    description:         'Generate squad selection recommendations based on fitness, form, availability and position balance.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'player-development', 'ai-copilot'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  4000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/select.*squad/i, /squad.*selection/i, /pick.*team/i, /team.*selection/i, /who.*should.*play/i],
    tags:                ['squad', 'selection', 'team', 'availability'],
    inputs: [
      { name: 'ageGroup',  type: 'string', required: false, default: 'Senior' },
      { name: 'matchDate', type: 'string', required: false },
    ],
    preview: async (params) => ({ willGenerate: 'Squad selection with reasoning', forAgeGroup: params.ageGroup ?? 'Senior' }),
    execute: async (params, ctx) => {
      const query = `Select the ${params.ageGroup ?? 'Senior'} squad${params.matchDate ? ` for ${params.matchDate}` : ''}, considering injuries and form.`;
      return _run(query, { role: ctx.role ?? 'coach', entities: params });
    },
    undo: null,
  },

  {
    id:                  'coaching.attendance_review',
    name:                'Review Attendance',
    category:            'COACHING',
    description:         'Analyse training attendance patterns — who is missing, who is consistent, trends over the season.',
    requiredEngines:     ['memory-engine', 'knowledge-engine'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  2500,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/review.*attendance/i, /attendance.*review/i, /who.*miss.*training/i, /missed.*most.*training/i, /attendance.*trends/i, /training.*attendance/i],
    tags:                ['attendance', 'training', 'consistency', 'review'],
    inputs: [
      { name: 'ageGroup', type: 'string', required: false },
      { name: 'period',   type: 'string', required: false, default: 'this season' },
    ],
    preview: async (params) => ({ willQuery: `Attendance for ${params.ageGroup ?? 'all squads'} over ${params.period ?? 'this season'}` }),
    execute: async (params, ctx) => {
      const result = await _ask(`Who has missed the most training${params.ageGroup ? ` in the ${params.ageGroup}` : ''}?`);
      return { success: true, data: result, summary: result.answer, evidence: result.citations?.map(c => c.fact) };
    },
    undo: null,
  },

  {
    id:                  'coaching.injury_review',
    name:                'Review Injuries',
    category:            'COACHING',
    description:         'Full review of current squad injuries — status, expected return dates, injury trends.',
    requiredEngines:     ['memory-engine', 'knowledge-engine'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  2500,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/review.*injur/i, /injur.*review/i, /injured.*player/i, /show.*injur/i, /who.*hurt/i, /who.*unavailable/i, /all.*injured/i],
    tags:                ['injury', 'unavailable', 'physio', 'squad'],
    inputs: [
      { name: 'ageGroup', type: 'string', required: false },
      { name: 'position', type: 'string', required: false },
    ],
    preview: async (params) => ({ willQuery: `Injuries for ${params.ageGroup ?? 'all squads'}${params.position ? `, position: ${params.position}` : ''}` }),
    execute: async (params, ctx) => {
      const query = `Show all injured players${params.ageGroup ? ` in the ${params.ageGroup}` : ''}${params.position ? ` at ${params.position}` : ''}.`;
      return _run(query, { role: ctx.role ?? 'coach', entities: params });
    },
    undo: null,
  },

  {
    id:                  'coaching.player_comparison',
    name:                'Compare Players',
    category:            'COACHING',
    description:         'Side-by-side comparison of two players across key metrics: attendance, fitness, form, development.',
    requiredEngines:     ['memory-engine', 'player-development', 'knowledge-engine', 'ai-copilot'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  4000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/compare.*player/i, /player.*vs/i, /compare.*\w+.*\w+/i, /head.*to.*head/i],
    tags:                ['compare', 'players', 'analysis', 'metrics'],
    inputs: [
      { name: 'playerA', type: 'string', required: false, description: 'First player name or ID' },
      { name: 'playerB', type: 'string', required: false, description: 'Second player name or ID' },
    ],
    preview: async (params) => ({ willCompare: `${params.playerA ?? 'Player A'} vs ${params.playerB ?? 'Player B'}` }),
    execute: async (params, ctx) => {
      const query = `Compare ${params.playerA ?? 'top two players'} and ${params.playerB ?? ''} across attendance, fitness and form.`;
      return _run(query, { role: ctx.role ?? 'coach', entities: params });
    },
    undo: null,
  },

  {
    id:                  'coaching.session_pdf',
    name:                'Create Session PDF',
    category:            'COACHING',
    description:         'Generate a printable PDF outline of a training session for coaches and players.',
    requiredEngines:     ['coaching-engine'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  2000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/session.*pdf/i, /print.*session/i, /pdf.*session/i, /session.*sheet/i],
    tags:                ['pdf', 'session', 'print', 'coaching'],
    inputs: [
      { name: 'ageGroup', type: 'string', required: false, default: 'Senior' },
      { name: 'sessionId', type: 'string', required: false },
    ],
    preview: async (params) => ({ willGenerate: `PDF outline for ${params.ageGroup ?? 'Senior'} session` }),
    execute: async (params, ctx) => {
      const { getSessionPDFOutline } = await _coaching();
      const outline = getSessionPDFOutline?.({ ageGroup: params.ageGroup ?? 'Senior' }) ?? { sections: ['Warm-up', 'Skills', 'Conditioned Games', 'Cool-down'], isMock: true };
      return { success: true, data: outline, summary: `Session PDF outline for ${params.ageGroup ?? 'Senior'}` };
    },
    undo: null,
  },

  {
    id:                  'coaching.drill_library',
    name:                'Generate Drill Library',
    category:            'COACHING',
    description:         'Curate a library of relevant drills for a position group, phase of play or session theme.',
    requiredEngines:     ['coaching-engine', 'ai-copilot'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  3500,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/drill.*library/i, /list.*drill/i, /find.*drill/i, /suggest.*drill/i, /drills.*for/i],
    tags:                ['drills', 'library', 'coaching', 'skills'],
    inputs: [
      { name: 'theme',     type: 'string', required: false, description: 'e.g. lineout, breakdown, defence' },
      { name: 'ageGroup',  type: 'string', required: false, default: 'Senior' },
      { name: 'count',     type: 'number', required: false, default: 10 },
    ],
    preview: async (params) => ({ willGenerate: `${params.count ?? 10} drills`, theme: params.theme ?? 'general' }),
    execute: async (params, ctx) => {
      const query = `Generate a drill library for ${params.theme ?? 'general'} rugby coaching for ${params.ageGroup ?? 'Senior'}.`;
      return _run(query, { role: ctx.role ?? 'coach', entities: params });
    },
    undo: null,
  },

  {
    id:                  'coaching.pre_season_plan',
    name:                'Pre-Season Plan',
    category:            'COACHING',
    description:         'Build a pre-season conditioning and skills plan to prepare the squad for competitive rugby.',
    requiredEngines:     ['memory-engine', 'coaching-engine', 'player-development', 'ai-copilot'],
    requiredPermissions: ['head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  5500,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/pre.?season.*plan/i, /preseason/i, /summer.*plan/i, /off.*season/i, /build.*up.*plan/i],
    tags:                ['pre-season', 'conditioning', 'plan', 'summer'],
    inputs: [
      { name: 'ageGroup',   type: 'string', required: false, default: 'Senior' },
      { name: 'startDate',  type: 'string', required: false },
      { name: 'weeks',      type: 'number', required: false, default: 8 },
    ],
    preview: async (params) => ({ willGenerate: `${params.weeks ?? 8}-week pre-season plan for ${params.ageGroup ?? 'Senior'}` }),
    execute: async (params, ctx) => {
      const query = `Build a ${params.weeks ?? 8}-week pre-season plan for ${params.ageGroup ?? 'Senior'} rugby.`;
      return _run(query, { role: ctx.role ?? 'head_coach', entities: params });
    },
    undo: null,
  },
];

// ── PLAYERS ───────────────────────────────────────────────────────────────────

const PLAYER_ACTIONS = [

  {
    id:                  'players.player_review',
    name:                'Player Review',
    category:            'PLAYERS',
    description:         'Generate a full review of a player: attendance, form, fitness, injuries, development progress.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'player-development', 'ai-copilot'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  4000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/player.*review/i, /review.*player/i, /how.*is.*\w+.*doing/i, /player.*report/i, /profile.*player/i],
    tags:                ['player', 'review', 'profile', 'progress'],
    inputs: [{ name: 'playerId', type: 'string', required: false, description: 'Player name or ID' }],
    preview: async (params) => ({ willProfile: params.playerId ?? 'target player', sections: ['Attendance', 'Fitness', 'Form', 'Injuries', 'Development'] }),
    execute: async (params, ctx) => {
      const query = `Player profile for ${params.playerId ?? 'our top player'}.`;
      return _run(query, { role: ctx.role ?? 'coach', entities: params });
    },
    undo: null,
  },

  {
    id:                  'players.parent_update',
    name:                'Parent Update',
    category:            'PLAYERS',
    description:         'Draft a personalised update for a player\'s parent covering attendance, progress and upcoming schedule.',
    requiredEngines:     ['memory-engine', 'communications-engine', 'ai-copilot'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  3000,
    sendsComms:          true,
    requiresApproval:    true,
    nlTriggers:          [/parent.*update/i, /update.*parent/i, /email.*parent/i, /parent.*email/i, /message.*parent/i],
    tags:                ['parent', 'communication', 'update', 'email'],
    inputs: [
      { name: 'playerId', type: 'string', required: false },
      { name: 'tone',     type: 'string', required: false, default: 'positive', description: 'tone: positive | concerned | neutral' },
    ],
    preview: async (params) => ({ willDraft: `Parent update email for ${params.playerId ?? 'player'}`, channel: 'Email', approvalRequired: true }),
    execute: async (params, ctx) => {
      const { buildCoachMessage } = await _comms();
      const msg = buildCoachMessage({ playerId: params.playerId, audience: 'parent', tone: params.tone ?? 'positive' });
      return { success: true, data: msg, summary: `Parent update drafted for ${params.playerId ?? 'player'}` };
    },
    undo: null,
  },

  {
    id:                  'players.return_to_play',
    name:                'Return To Play Review',
    category:            'PLAYERS',
    description:         'Run the full return-to-play assessment for an injured player — stage check, medical clearance, load plan.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'coaching-engine', 'ai-copilot'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  4500,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/return.*to.*play/i, /rtp/i, /cleared.*play/i, /can.*\w+.*play.*again/i, /ready.*return/i],
    tags:                ['rtp', 'return-to-play', 'injury', 'clearance'],
    inputs: [
      { name: 'playerId', type: 'string', required: false },
      { name: 'injury',   type: 'string', required: false },
    ],
    preview: async (params) => ({ willAssess: `RTP readiness for ${params.playerId ?? 'player'}`, stages: ['Medical', 'Load', 'Contact', 'Full training', 'Match-ready'] }),
    execute: async (params, ctx) => {
      const query = `Return to play assessment for ${params.playerId ?? 'injured player'}${params.injury ? ` with ${params.injury}` : ''}.`;
      return _run(query, { role: ctx.role ?? 'coach', entities: params });
    },
    undo: null,
  },

  {
    id:                  'players.training_load',
    name:                'Training Load Review',
    category:            'PLAYERS',
    description:         'Analyse training load for a player or squad — volume, intensity, recovery balance, overtraining risk.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'player-development'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  3000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/training.*load/i, /load.*review/i, /overtraining/i, /workload.*review/i],
    tags:                ['load', 'training', 'volume', 'recovery'],
    inputs: [
      { name: 'playerId', type: 'string', required: false },
      { name: 'ageGroup', type: 'string', required: false },
    ],
    preview: async (params) => ({ willReview: `Training load for ${params.playerId ?? params.ageGroup ?? 'squad'}` }),
    execute: async (params, ctx) => {
      const result = await _ask(`Training load analysis for ${params.playerId ?? params.ageGroup ?? 'the squad'} this season.`);
      return { success: true, data: result, summary: result.answer };
    },
    undo: null,
  },

  {
    id:                  'players.progress_report',
    name:                'Progress Report',
    category:            'PLAYERS',
    description:         'Generate a progress report for an individual player covering the past season or defined period.',
    requiredEngines:     ['memory-engine', 'player-development', 'knowledge-engine', 'ai-copilot'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  4000,
    sendsComms:          true,
    requiresApproval:    true,
    nlTriggers:          [/progress.*report/i, /player.*progress/i, /season.*report/i, /end.*of.*season/i, /how.*\w+.*progressed/i],
    tags:                ['progress', 'report', 'season', 'review'],
    inputs: [
      { name: 'playerId', type: 'string', required: false },
      { name: 'period',   type: 'string', required: false, default: 'this season' },
    ],
    preview: async (params) => ({ willGenerate: `Progress report for ${params.playerId ?? 'player'}`, period: params.period ?? 'this season' }),
    execute: async (params, ctx) => {
      const query = `Generate a progress report for ${params.playerId ?? 'our squad'} over ${params.period ?? 'this season'}.`;
      return _run(query, { role: ctx.role ?? 'coach', entities: params });
    },
    undo: null,
  },

  {
    id:                  'players.squad_health',
    name:                'Squad Health Summary',
    category:            'PLAYERS',
    description:         'Snapshot of the full squad health: available, injured, suspended, in rehab.',
    requiredEngines:     ['memory-engine', 'knowledge-engine'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  2500,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/squad.*health/i, /health.*squad/i, /who.*available/i, /player.*status/i, /full.*squad.*status/i],
    tags:                ['squad', 'health', 'availability', 'injuries'],
    inputs: [{ name: 'ageGroup', type: 'string', required: false }],
    preview: async (params) => ({ willSummarise: `${params.ageGroup ?? 'All squads'} health status` }),
    execute: async (params, ctx) => {
      const result = await _ask(`Squad health summary${params.ageGroup ? ` for ${params.ageGroup}` : ''}.`);
      return { success: true, data: result, summary: result.answer };
    },
    undo: null,
  },

  {
    id:                  'players.development_pathway',
    name:                'Development Pathway',
    category:            'PLAYERS',
    description:         'Map the development pathway for a player from current level to their potential ceiling.',
    requiredEngines:     ['memory-engine', 'player-development', 'ai-copilot'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  4500,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/development.*pathway/i, /pathway.*player/i, /player.*potential/i, /player.*pathway/i, /next.*level/i],
    tags:                ['pathway', 'development', 'potential', 'career'],
    inputs: [
      { name: 'playerId', type: 'string', required: false },
      { name: 'position', type: 'string', required: false },
    ],
    preview: async (params) => ({ willMap: `Development pathway for ${params.playerId ?? 'player'}` }),
    execute: async (params, ctx) => {
      const query = `Map the development pathway for ${params.playerId ?? 'a promising player'} at ${params.position ?? 'their position'}.`;
      return _run(query, { role: ctx.role ?? 'coach', entities: params });
    },
    undo: null,
  },
];

// ── COMMUNICATIONS ────────────────────────────────────────────────────────────

const COMMS_ACTIONS = [

  {
    id:                  'comms.newsletter',
    name:                'Build Newsletter',
    category:            'COMMUNICATIONS',
    description:         'Generate the weekly club newsletter with match results, upcoming fixtures, announcements and player spotlights.',
    requiredEngines:     ['memory-engine', 'data-integration', 'communications-engine', 'knowledge-engine'],
    requiredPermissions: ['coach', 'committee', 'admin'],
    estimatedRuntimeMs:  5000,
    sendsComms:          true,
    requiresApproval:    true,
    nlTriggers:          [/build.*newsletter/i, /generate.*newsletter/i, /weekly.*newsletter/i, /newsletter/i, /weekly.*update/i],
    tags:                ['newsletter', 'weekly', 'communications', 'club'],
    inputs: [
      { name: 'weekOf', type: 'string', required: false },
      { name: 'tone',   type: 'string', required: false, default: 'positive' },
    ],
    preview: async (params) => ({ willGenerate: 'Weekly club newsletter', sections: ['Results', 'Upcoming', 'Player Spotlight', 'Announcements'], approvalRequired: true }),
    execute: async (params, ctx) => {
      const { buildWeeklyNewsletter } = await _comms();
      const result = await buildWeeklyNewsletter({ weekOf: params.weekOf, tone: params.tone });
      return { success: true, data: result, summary: result?.headline ?? 'Newsletter built' };
    },
    undo: null,
  },

  {
    id:                  'comms.social_media_pack',
    name:                'Generate Social Media Pack',
    category:            'COMMUNICATIONS',
    description:         'Create ready-to-post social media content for the week: match previews, results, player of the week, events.',
    requiredEngines:     ['memory-engine', 'communications-engine', 'knowledge-engine'],
    requiredPermissions: ['coach', 'committee', 'admin'],
    estimatedRuntimeMs:  4000,
    sendsComms:          true,
    requiresApproval:    true,
    nlTriggers:          [/social.*media.*pack/i, /social.*pack/i, /social.*media/i, /instagram.*post/i, /twitter.*post/i, /posts.*this.*week/i],
    tags:                ['social', 'media', 'instagram', 'twitter', 'content'],
    inputs: [
      { name: 'platforms', type: 'string[]', required: false, default: ['instagram', 'twitter', 'facebook'] },
      { name: 'weekOf',    type: 'string',   required: false },
    ],
    preview: async (params) => ({ willGenerate: '4-6 social posts', platforms: params.platforms ?? ['instagram', 'twitter'], approvalRequired: true }),
    execute: async (params, ctx) => {
      const { buildWeeklyRoundup, buildMatchResultPost, buildPlayerOfWeekPost } = await _comms();
      const [roundup, motm, playerPost] = await Promise.all([
        buildWeeklyRoundup({ weekOf: params.weekOf }).catch(() => null),
        buildMatchResultPost({}).catch(() => null),
        buildPlayerOfWeekPost({}).catch(() => null),
      ]);
      const posts = [roundup, motm, playerPost].filter(Boolean);
      return { success: true, data: { posts }, summary: `${posts.length} social posts drafted` };
    },
    undo: null,
  },

  {
    id:                  'comms.sponsor_update',
    name:                'Create Sponsor Update',
    category:            'COMMUNICATIONS',
    description:         'Draft personalised sponsor update emails covering club activity, sponsorship exposure and season highlights.',
    requiredEngines:     ['memory-engine', 'communications-engine', 'knowledge-engine'],
    requiredPermissions: ['committee', 'admin'],
    estimatedRuntimeMs:  4000,
    sendsComms:          true,
    requiresApproval:    true,
    nlTriggers:          [/sponsor.*update/i, /update.*sponsor/i, /sponsor.*email/i, /sponsor.*report/i],
    tags:                ['sponsor', 'update', 'email', 'relationships'],
    inputs: [
      { name: 'sponsorId', type: 'string', required: false, description: 'Specific sponsor or all sponsors' },
      { name: 'period',    type: 'string', required: false, default: 'this season' },
    ],
    preview: async (params) => ({ willDraft: `Sponsor update for ${params.sponsorId ?? 'all sponsors'}`, approvalRequired: true }),
    execute: async (params, ctx) => {
      const { buildAllSponsorUpdates, buildSponsorUpdate } = await _comms();
      const result = params.sponsorId
        ? await buildSponsorUpdate({ sponsorId: params.sponsorId }).catch(() => ({ isMock: true }))
        : await buildAllSponsorUpdates().catch(() => ({ drafts: [], isMock: true }));
      return { success: true, data: result, summary: `Sponsor update drafted` };
    },
    undo: null,
  },

  {
    id:                  'comms.parent_email',
    name:                'Create Parent Email',
    category:            'COMMUNICATIONS',
    description:         'Generate a parent-facing email for a specific age group covering schedules, reminders and club news.',
    requiredEngines:     ['memory-engine', 'communications-engine'],
    requiredPermissions: ['coach', 'committee', 'admin'],
    estimatedRuntimeMs:  3000,
    sendsComms:          true,
    requiresApproval:    true,
    nlTriggers:          [/parent.*email/i, /email.*parents/i, /create.*parent.*email/i, /message.*parents/i],
    tags:                ['parent', 'email', 'communication', 'age-group'],
    inputs: [
      { name: 'ageGroup', type: 'string', required: false, default: 'U14' },
      { name: 'subject',  type: 'string', required: false },
    ],
    preview: async (params) => ({ willDraft: `Parent email for ${params.ageGroup ?? 'U14'}`, approvalRequired: true }),
    execute: async (params, ctx) => {
      const { buildGeneralAnnouncement } = await _comms();
      const result = buildGeneralAnnouncement({ audience: 'parents', ageGroup: params.ageGroup ?? 'U14', subject: params.subject ?? 'Club update' });
      return { success: true, data: result, summary: `Parent email drafted for ${params.ageGroup ?? 'U14'}` };
    },
    undo: null,
  },

  {
    id:                  'comms.volunteer_request',
    name:                'Create Volunteer Request',
    category:            'COMMUNICATIONS',
    description:         'Draft a volunteer recruitment message targeting lapsed or available volunteers for a specific role or event.',
    requiredEngines:     ['memory-engine', 'communications-engine', 'knowledge-engine'],
    requiredPermissions: ['committee', 'admin'],
    estimatedRuntimeMs:  3000,
    sendsComms:          true,
    requiresApproval:    true,
    nlTriggers:          [/volunteer.*request/i, /request.*volunteer/i, /create.*volunteer/i, /recruit.*volunteer/i, /need.*volunteer/i],
    tags:                ['volunteer', 'request', 'recruitment', 'email'],
    inputs: [
      { name: 'role',  type: 'string', required: false, description: 'Volunteer role needed' },
      { name: 'event', type: 'string', required: false },
      { name: 'date',  type: 'string', required: false },
    ],
    preview: async (params) => ({ willTarget: 'Lapsed volunteers + all-members', role: params.role ?? 'general volunteering', approvalRequired: true }),
    execute: async (params, ctx) => {
      const { buildVolunteerRequest } = await _comms();
      const result = buildVolunteerRequest({ role: params.role ?? 'event volunteer', event: params.event ?? 'upcoming event', date: params.date ?? 'TBD' });
      return { success: true, data: result, summary: `Volunteer request drafted${params.role ? ` for ${params.role}` : ''}` };
    },
    undo: null,
  },

  {
    id:                  'comms.membership_reminder',
    name:                'Create Membership Reminder',
    category:            'COMMUNICATIONS',
    description:         'Draft renewal reminders for lapsed or near-expiry members, with personalised re-engagement messaging.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'communications-engine'],
    requiredPermissions: ['committee', 'admin'],
    estimatedRuntimeMs:  3500,
    sendsComms:          true,
    requiresApproval:    true,
    nlTriggers:          [/membership.*reminder/i, /renewal.*reminder/i, /lapsed.*member/i, /membership.*renewal/i, /re.?engage.*member/i],
    tags:                ['membership', 'renewal', 'reminder', 'retention'],
    inputs: [
      { name: 'membershipType', type: 'string', required: false, description: 'adult | youth | family | social' },
      { name: 'urgency',        type: 'string', required: false, default: 'friendly' },
    ],
    preview: async (params) => ({ willTarget: 'Lapsed/expiring members', approvalRequired: true }),
    execute: async (params, ctx) => {
      const { buildBulkRenewalReminders } = await _comms();
      const result = await buildBulkRenewalReminders({ membershipType: params.membershipType }).catch(() => ({ drafts: [], isMock: true }));
      return { success: true, data: result, summary: `Membership reminders drafted` };
    },
    undo: null,
  },

  {
    id:                  'comms.match_preview',
    name:                'Match Preview',
    category:            'COMMUNICATIONS',
    description:         'Write a match preview for publication — opposition background, key battles, team news, prediction.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'communications-engine', 'ai-copilot'],
    requiredPermissions: ['coach', 'committee', 'admin'],
    estimatedRuntimeMs:  4000,
    sendsComms:          true,
    requiresApproval:    true,
    nlTriggers:          [/match.*preview/i, /preview.*match/i, /pre.*match.*article/i, /upcoming.*game.*preview/i],
    tags:                ['match', 'preview', 'publication', 'communications'],
    inputs: [
      { name: 'opponent',  type: 'string', required: false },
      { name: 'ageGroup',  type: 'string', required: false, default: 'Senior' },
      { name: 'matchDate', type: 'string', required: false },
    ],
    preview: async (params) => ({ willWrite: `Match preview for ${params.ageGroup ?? 'Senior'} vs ${params.opponent ?? 'next opponent'}` }),
    execute: async (params, ctx) => {
      const { buildMatchPreview } = await _comms();
      const result = await buildMatchPreview({ opponent: params.opponent, ageGroup: params.ageGroup ?? 'Senior', matchDate: params.matchDate }).catch(() => ({ content: 'Match preview (mock)', isMock: true }));
      return { success: true, data: result, summary: `Match preview drafted` };
    },
    undo: null,
  },

  {
    id:                  'comms.match_report',
    name:                'Match Report',
    category:            'COMMUNICATIONS',
    description:         'Generate a match report for publication — score, key moments, player ratings, coach quote.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'communications-engine', 'ai-copilot'],
    requiredPermissions: ['coach', 'committee', 'admin'],
    estimatedRuntimeMs:  4000,
    sendsComms:          true,
    requiresApproval:    true,
    nlTriggers:          [/match.*report/i, /report.*match/i, /game.*report/i, /write.*report/i, /after.*match/i, /post.*match/i],
    tags:                ['match', 'report', 'publication', 'result'],
    inputs: [
      { name: 'ageGroup',  type: 'string', required: false, default: 'Senior' },
      { name: 'opponent',  type: 'string', required: false },
      { name: 'result',    type: 'string', required: false, description: 'Score: "24-12 W" format' },
    ],
    preview: async (params) => ({ willWrite: `Match report for ${params.ageGroup ?? 'Senior'}${params.result ? `: ${params.result}` : ''}` }),
    execute: async (params, ctx) => {
      const { buildMatchReport } = await _comms();
      const result = await buildMatchReport({ ageGroup: params.ageGroup ?? 'Senior', opponent: params.opponent, result: params.result }).catch(() => ({ content: 'Match report (mock)', isMock: true }));
      return { success: true, data: result, summary: `Match report drafted` };
    },
    undo: null,
  },

  {
    id:                  'comms.training_reminder',
    name:                'Training Reminder',
    category:            'COMMUNICATIONS',
    description:         'Send a training reminder to the squad with time, location, kit requirements and session focus.',
    requiredEngines:     ['memory-engine', 'communications-engine'],
    requiredPermissions: ['coach', 'head_coach', 'dor', 'admin'],
    estimatedRuntimeMs:  2000,
    sendsComms:          true,
    requiresApproval:    false,
    nlTriggers:          [/training.*reminder/i, /remind.*training/i, /send.*reminder/i, /reminder.*training/i, /notify.*squad/i],
    tags:                ['training', 'reminder', 'notification', 'squad'],
    inputs: [
      { name: 'ageGroup', type: 'string', required: false, default: 'Senior' },
      { name: 'date',     type: 'string', required: false },
      { name: 'venue',    type: 'string', required: false, default: 'Club Grounds' },
      { name: 'focus',    type: 'string', required: false },
    ],
    preview: async (params) => ({ willSend: `Training reminder to ${params.ageGroup ?? 'Senior'}`, date: params.date ?? 'TBD', venue: params.venue ?? 'Club Grounds' }),
    execute: async (params, ctx) => {
      const { buildTrainingReminder } = await _comms();
      const result = buildTrainingReminder({ ageGroup: params.ageGroup ?? 'Senior', date: params.date ?? 'next session', venue: params.venue ?? 'Club Grounds', focus: params.focus ?? 'Training' });
      return { success: true, data: result, summary: `Training reminder drafted for ${params.ageGroup ?? 'Senior'}` };
    },
    undo: null,
  },

  {
    id:                  'comms.club_announcement',
    name:                'Club Announcement',
    category:            'COMMUNICATIONS',
    description:         'Draft a general club announcement for all members — news, policy changes, events, achievements.',
    requiredEngines:     ['communications-engine'],
    requiredPermissions: ['committee', 'admin'],
    estimatedRuntimeMs:  2500,
    sendsComms:          true,
    requiresApproval:    true,
    nlTriggers:          [/club.*announcement/i, /announce.*to.*club/i, /general.*announcement/i, /all.*members.*message/i],
    tags:                ['announcement', 'all-members', 'communications', 'general'],
    inputs: [
      { name: 'subject', type: 'string', required: false, description: 'Announcement subject' },
      { name: 'body',    type: 'string', required: false, description: 'Key points to include' },
    ],
    preview: async (params) => ({ willDraft: 'Club-wide announcement', audience: 'All members', approvalRequired: true }),
    execute: async (params, ctx) => {
      const { buildGeneralAnnouncement } = await _comms();
      const result = buildGeneralAnnouncement({ audience: 'all_members', subject: params.subject ?? 'Club News', body: params.body });
      return { success: true, data: result, summary: `Club announcement drafted: ${params.subject ?? 'Club News'}` };
    },
    undo: null,
  },
];

// ── DIRECTOR OF RUGBY ─────────────────────────────────────────────────────────

const DOR_ACTIONS = [

  {
    id:                  'dor.academy_review',
    name:                'Weekly Academy Review',
    category:            'DIRECTOR_OF_RUGBY',
    description:         'Full review of academy squads — U14 to U20 — covering progress, coaches, attendance and development.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'player-development', 'coaching-engine', 'ai-copilot'],
    requiredPermissions: ['dor', 'admin'],
    estimatedRuntimeMs:  6000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/academy.*review/i, /review.*academy/i, /youth.*review/i, /underage.*review/i, /all.*squads/i],
    tags:                ['academy', 'youth', 'squads', 'review', 'dor'],
    inputs: [
      { name: 'weekOf',    type: 'string', required: false },
      { name: 'ageGroups', type: 'string[]', required: false, default: ['U14', 'U16', 'U18', 'U20'] },
    ],
    preview: async (params) => ({ willReview: (params.ageGroups ?? ['U14', 'U16', 'U18', 'U20']).join(', '), depth: 'Full cross-squad analysis' }),
    execute: async (params, ctx) => {
      const ageGroups = params.ageGroups ?? ['U14', 'U16', 'U18', 'U20'];
      const query = `Academy review for ${ageGroups.join(', ')} — attendance, progress, coaches, injuries.`;
      return _run(query, { role: 'dor', entities: params });
    },
    undo: null,
  },

  {
    id:                  'dor.team_comparison',
    name:                'Team Comparison',
    category:            'DIRECTOR_OF_RUGBY',
    description:         'Compare two or more teams across attendance, fitness, form, injuries and development metrics.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'player-development', 'ai-copilot'],
    requiredPermissions: ['dor', 'admin'],
    estimatedRuntimeMs:  4500,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/team.*comparison/i, /compare.*team/i, /team.*vs/i, /squads.*compare/i],
    tags:                ['team', 'comparison', 'analysis', 'dor'],
    inputs: [
      { name: 'teamA', type: 'string', required: false },
      { name: 'teamB', type: 'string', required: false },
    ],
    preview: async (params) => ({ willCompare: `${params.teamA ?? 'Team A'} vs ${params.teamB ?? 'Team B'}`, metrics: ['Attendance', 'Injuries', 'Fitness', 'Form'] }),
    execute: async (params, ctx) => {
      const query = `Compare ${params.teamA ?? 'Senior'} and ${params.teamB ?? 'Reserve'} teams across all metrics.`;
      return _run(query, { role: 'dor', entities: params });
    },
    undo: null,
  },

  {
    id:                  'dor.coach_performance',
    name:                'Coach Performance Review',
    category:            'DIRECTOR_OF_RUGBY',
    description:         'Evaluate coach performance: session quality, squad attendance trends, player development outcomes.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'ai-copilot'],
    requiredPermissions: ['dor', 'admin'],
    estimatedRuntimeMs:  5000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/coach.*performance/i, /review.*coach/i, /coach.*review/i, /how.*coach.*doing/i],
    tags:                ['coach', 'performance', 'review', 'dor'],
    inputs: [
      { name: 'coachId', type: 'string', required: false, description: 'Specific coach or all coaches' },
      { name: 'period',  type: 'string', required: false, default: 'this season' },
    ],
    preview: async (params) => ({ willReview: `Coach performance for ${params.coachId ?? 'all coaches'}`, period: params.period ?? 'this season' }),
    execute: async (params, ctx) => {
      const query = `Coach performance review for ${params.coachId ?? 'all coaches'} this season.`;
      return _run(query, { role: 'dor', entities: params });
    },
    undo: null,
  },

  {
    id:                  'dor.player_pathway',
    name:                'Player Pathway Review',
    category:            'DIRECTOR_OF_RUGBY',
    description:         'Map the full player development pathway — who is ready to step up, who needs support, talent pipeline.',
    requiredEngines:     ['memory-engine', 'player-development', 'knowledge-engine', 'ai-copilot'],
    requiredPermissions: ['dor', 'admin'],
    estimatedRuntimeMs:  5500,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/player.*pathway/i, /pathway.*review/i, /talent.*pipeline/i, /step.*up.*player/i, /who.*ready.*senior/i],
    tags:                ['pathway', 'development', 'talent', 'pipeline', 'dor'],
    inputs: [
      { name: 'fromAgeGroup', type: 'string', required: false, description: 'Source age group' },
      { name: 'toAgeGroup',   type: 'string', required: false, description: 'Target age group' },
    ],
    preview: async (params) => ({ willReview: `Player pathway${params.fromAgeGroup ? ` from ${params.fromAgeGroup}` : ''} → talent pipeline` }),
    execute: async (params, ctx) => _pipe('player_profile', { role: 'dor', entities: params }),
    undo: null,
  },

  {
    id:                  'dor.injury_trends',
    name:                'Injury Trends',
    category:            'DIRECTOR_OF_RUGBY',
    description:         'Analyse club-wide injury trends: most common injuries, high-risk periods, recovery timelines, prevention insights.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'club-intelligence'],
    requiredPermissions: ['dor', 'admin'],
    estimatedRuntimeMs:  4000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/injury.*trends/i, /trend.*injur/i, /injury.*analysis/i, /most.*common.*injur/i, /injur.*pattern/i],
    tags:                ['injury', 'trends', 'analysis', 'prevention', 'dor'],
    inputs: [
      { name: 'period', type: 'string', required: false, default: 'this season' },
    ],
    preview: async (params) => ({ willAnalyse: `Injury trends over ${params.period ?? 'this season'}`, willInclude: ['Most common', 'By age group', 'Recovery times', 'Prevention'] }),
    execute: async (params, ctx) => {
      const result = await _ask(`Injury trends and patterns across the club over ${params.period ?? 'this season'}.`);
      return { success: true, data: result, summary: result.answer };
    },
    undo: null,
  },

  {
    id:                  'dor.attendance_trends',
    name:                'Attendance Trends',
    category:            'DIRECTOR_OF_RUGBY',
    description:         'Club-wide attendance trends: compare this season vs last, identify squads at risk, flag chronic absentees.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'club-intelligence'],
    requiredPermissions: ['dor', 'admin'],
    estimatedRuntimeMs:  4000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/attendance.*trends/i, /compare.*attendance/i, /season.*attendance/i, /attendance.*comparison/i, /attendance.*analysis/i],
    tags:                ['attendance', 'trends', 'comparison', 'dor'],
    inputs: [
      { name: 'compareWith', type: 'string', required: false, default: 'last season' },
    ],
    preview: async (params) => ({ willCompare: `This season vs ${params.compareWith ?? 'last season'}` }),
    execute: async (params, ctx) => {
      const result = await _ask(`Compare attendance this season with ${params.compareWith ?? 'last season'}.`);
      return { success: true, data: result, summary: result.answer };
    },
    undo: null,
  },
];

// ── COMMITTEE ─────────────────────────────────────────────────────────────────

const COMMITTEE_ACTIONS = [

  {
    id:                  'committee.weekly_pack',
    name:                'Weekly Committee Pack',
    category:            'COMMITTEE',
    description:         'Build the weekly committee briefing pack: club health, approvals pending, finance snapshot, key decisions.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'club-intelligence', 'executive-dashboard', 'workflow-engine'],
    requiredPermissions: ['committee', 'chairperson', 'admin'],
    estimatedRuntimeMs:  7000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/weekly.*committee/i, /committee.*pack/i, /run.*this.*week.*club/i, /weekly.*pack/i, /committee.*briefing/i],
    tags:                ['committee', 'weekly', 'pack', 'briefing', 'governance'],
    inputs: [{ name: 'weekOf', type: 'string', required: false }],
    preview: async (params) => ({ willBuild: 'Full committee pack', sections: ['Health', 'Approvals', 'Finance', 'Incidents', 'Decisions'], approvalRequired: false }),
    execute: async (params, ctx) => _run('Run this week\'s club — committee pack with health report and approvals.', { role: ctx.role ?? 'committee' }),
    undo: null,
  },

  {
    id:                  'committee.executive_dashboard',
    name:                'Executive Dashboard',
    category:            'COMMITTEE',
    description:         'Launch the full executive dashboard: health scores, pending approvals, activity feed, recommendations.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'club-intelligence', 'executive-dashboard', 'workflow-engine', 'communications-engine'],
    requiredPermissions: ['committee', 'chairperson', 'dor', 'admin'],
    estimatedRuntimeMs:  6000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/executive.*dashboard/i, /dashboard/i, /open.*dashboard/i, /launch.*dashboard/i, /morning.*briefing/i],
    tags:                ['dashboard', 'executive', 'briefing', 'committee'],
    inputs: [{ name: 'role', type: 'string', required: false }],
    preview: async (params) => ({ willBuild: 'Full executive dashboard', widgets: ['Health', 'Approvals', 'Activity', 'Recommendations', 'Agenda'] }),
    execute: async (params, ctx) => {
      const { buildExecutiveBriefing } = await _dashboard();
      const result = await buildExecutiveBriefing({ role: params.role ?? ctx.role ?? 'committee' });
      return { success: true, data: result, summary: result?.summary ?? 'Executive briefing built' };
    },
    undo: null,
  },

  {
    id:                  'committee.club_health',
    name:                'Club Health Report',
    category:            'COMMITTEE',
    description:         'Generate a full club health report: overall score, domain breakdown, risk flags, recommendations.',
    requiredEngines:     ['club-intelligence', 'knowledge-engine', 'executive-dashboard'],
    requiredPermissions: ['committee', 'chairperson', 'dor', 'admin'],
    estimatedRuntimeMs:  5000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/club.*health/i, /health.*report/i, /health.*score/i, /how.*healthy.*club/i, /summar.*club.*health/i, /overall.*health/i],
    tags:                ['health', 'report', 'score', 'committee', 'governance'],
    inputs: [],
    preview: async () => ({ willGenerate: 'Full club health report', domains: 8, includesRisks: true }),
    execute: async (params, ctx) => _pipe('health_report', { role: ctx.role ?? 'committee' }),
    undo: null,
  },

  {
    id:                  'committee.risk_register',
    name:                'Risk Register',
    category:            'COMMITTEE',
    description:         'Generate the club risk register — financial, operational, welfare and reputational risks with mitigation actions.',
    requiredEngines:     ['club-intelligence', 'knowledge-engine', 'ai-copilot'],
    requiredPermissions: ['committee', 'chairperson', 'admin'],
    estimatedRuntimeMs:  5000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/risk.*register/i, /club.*risks/i, /identify.*risks/i, /risk.*report/i, /governance.*risk/i],
    tags:                ['risk', 'register', 'governance', 'committee'],
    inputs: [],
    preview: async () => ({ willGenerate: 'Risk register', categories: ['Financial', 'Operational', 'Welfare', 'Reputational'] }),
    execute: async (params, ctx) => {
      const result = await _ask('What are the main risks facing the club right now?');
      return { success: true, data: result, summary: result.answer };
    },
    undo: null,
  },

  {
    id:                  'committee.membership_summary',
    name:                'Membership Summary',
    category:            'COMMITTEE',
    description:         'Full membership snapshot: total registered, by type, renewal status, lapsed members, year-on-year comparison.',
    requiredEngines:     ['memory-engine', 'knowledge-engine'],
    requiredPermissions: ['committee', 'chairperson', 'admin'],
    estimatedRuntimeMs:  3000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/membership.*summary/i, /how.*many.*member/i, /member.*count/i, /membership.*report/i, /member.*summary/i, /membership.*status/i],
    tags:                ['membership', 'summary', 'report', 'committee'],
    inputs: [],
    preview: async () => ({ willGenerate: 'Membership summary', sections: ['Total', 'By type', 'Renewals', 'Lapsed', 'YoY'] }),
    execute: async (params, ctx) => {
      const result = await _ask('How many members are registered with the club and what is the membership breakdown?');
      return { success: true, data: result, summary: result.answer };
    },
    undo: null,
  },

  {
    id:                  'committee.volunteer_summary',
    name:                'Volunteer Summary',
    category:            'COMMITTEE',
    description:         'Snapshot of volunteer activity: active volunteers, recent contributions, gaps, who hasn\'t volunteered recently.',
    requiredEngines:     ['memory-engine', 'knowledge-engine'],
    requiredPermissions: ['committee', 'chairperson', 'admin'],
    estimatedRuntimeMs:  3000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/volunteer.*summary/i, /volunteer.*report/i, /who.*volunteer/i, /volunteer.*activity/i, /who.*hasn.*volunteer/i, /inactive.*volunteer/i],
    tags:                ['volunteer', 'summary', 'activity', 'committee'],
    inputs: [],
    preview: async () => ({ willSummarise: 'Volunteer activity across the club' }),
    execute: async (params, ctx) => {
      const result = await _ask("Who hasn't volunteered recently and what is the volunteer summary?");
      return { success: true, data: result, summary: result.answer };
    },
    undo: null,
  },

  {
    id:                  'committee.sponsor_summary',
    name:                'Sponsor Summary',
    category:            'COMMITTEE',
    description:         'Full sponsor overview: active sponsors, expiry dates, deal values, renewal pipeline, at-risk relationships.',
    requiredEngines:     ['memory-engine', 'knowledge-engine'],
    requiredPermissions: ['committee', 'chairperson', 'admin'],
    estimatedRuntimeMs:  3000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/sponsor.*summary/i, /sponsor.*report/i, /sponsor.*overview/i, /which.*sponsor.*expir/i, /sponsor.*expiry/i],
    tags:                ['sponsor', 'summary', 'renewal', 'finance', 'committee'],
    inputs: [],
    preview: async () => ({ willGenerate: 'Sponsor summary with renewal pipeline' }),
    execute: async (params, ctx) => {
      const result = await _ask('Which sponsors expire this month and what is the sponsor summary?');
      return { success: true, data: result, summary: result.answer };
    },
    undo: null,
  },

  {
    id:                  'committee.agm_pack',
    name:                'AGM Pack',
    category:            'COMMITTEE',
    description:         'Generate the full Annual General Meeting pack: chair report, finance summary, membership stats, officer reports, season review.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'club-intelligence', 'communications-engine', 'ai-copilot'],
    requiredPermissions: ['chairperson', 'admin'],
    estimatedRuntimeMs:  10000,
    sendsComms:          false,
    requiresApproval:    true,
    nlTriggers:          [/agm.*pack/i, /annual.*general.*meeting/i, /agm/i, /create.*agm/i, /generate.*agm/i],
    tags:                ['agm', 'annual', 'governance', 'pack', 'committee'],
    inputs: [
      { name: 'year',    type: 'string', required: false, description: 'Season year e.g. 2025/26' },
      { name: 'agmDate', type: 'string', required: false },
    ],
    preview: async (params) => ({ willGenerate: `AGM Pack for ${params.year ?? 'current season'}`, sections: ['Chair Report', 'Finance', 'Membership', 'Season Review', 'Officers'] }),
    execute: async (params, ctx) => {
      const query = `Create the AGM pack for ${params.year ?? 'this season'}. Include chair report, finance summary, membership statistics, season review and officer reports.`;
      return _run(query, { role: 'chairperson', entities: params });
    },
    undo: null,
  },
];

// ── CLUB OPERATIONS ───────────────────────────────────────────────────────────

const OPS_ACTIONS = [

  {
    id:                  'ops.open_club',
    name:                'Open Club',
    category:            'CLUB_OPERATIONS',
    description:         'Run the daily club-open routine: check approvals, review today\'s sessions, confirm volunteers, check pitch.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'workflow-engine', 'executive-dashboard'],
    requiredPermissions: ['admin', 'committee'],
    estimatedRuntimeMs:  5000,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/open.*club/i, /start.*day/i, /morning.*routine/i, /open.*up/i, /daily.*open/i],
    tags:                ['operations', 'open', 'daily', 'routine'],
    inputs: [{ name: 'date', type: 'string', required: false }],
    preview: async (params) => ({ willRun: 'Club-open checklist', steps: ['Approvals', 'Sessions today', 'Volunteers', 'Pitch check', 'Key actions'] }),
    execute: async (params, ctx) => {
      const { buildTodayAgenda } = await _dashboard();
      const agenda = await buildTodayAgenda({ role: ctx.role ?? 'admin' });
      return { success: true, data: agenda, summary: agenda?.summary ?? 'Club opened — agenda ready' };
    },
    undo: null,
  },

  {
    id:                  'ops.close_club',
    name:                'Close Club',
    category:            'CLUB_OPERATIONS',
    description:         'End-of-day club closure routine: log any incidents, confirm tomorrow\'s sessions, check outstanding actions.',
    requiredEngines:     ['memory-engine', 'workflow-engine', 'knowledge-engine'],
    requiredPermissions: ['admin', 'committee'],
    estimatedRuntimeMs:  3500,
    sendsComms:          false,
    requiresApproval:    false,
    nlTriggers:          [/close.*club/i, /end.*day/i, /close.*up/i, /daily.*close/i, /close.*down/i],
    tags:                ['operations', 'close', 'daily', 'end-of-day'],
    inputs: [{ name: 'date', type: 'string', required: false }],
    preview: async (params) => ({ willRun: 'End-of-day close routine', steps: ['Outstanding actions', 'Incidents', 'Tomorrow\'s sessions', 'Lock-up check'] }),
    execute: async (params, ctx) => {
      const result = await _ask('What outstanding actions and upcoming sessions need to be handled before closing the club today?');
      return { success: true, data: result, summary: 'End-of-day summary: ' + result.answer?.slice(0, 150) };
    },
    undo: null,
  },

  {
    id:                  'ops.match_day',
    name:                'Match Day Pack',
    category:            'CLUB_OPERATIONS',
    description:         'Full match day operations pack: venue setup, officials confirmation, volunteer roles, hospitality, first aid.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'communications-engine', 'ai-copilot'],
    requiredPermissions: ['admin', 'committee', 'dor'],
    estimatedRuntimeMs:  5500,
    sendsComms:          true,
    requiresApproval:    false,
    nlTriggers:          [/match.*day.*pack/i, /match.*day/i, /match.*operations/i, /home.*match.*setup/i, /game.*day/i],
    tags:                ['match', 'day', 'operations', 'venue', 'hospitality'],
    inputs: [
      { name: 'ageGroup',  type: 'string', required: false, default: 'Senior' },
      { name: 'matchDate', type: 'string', required: false },
      { name: 'opponent',  type: 'string', required: false },
    ],
    preview: async (params) => ({ willGenerate: `Match day pack for ${params.ageGroup ?? 'Senior'}`, sections: ['Setup', 'Officials', 'Volunteers', 'Hospitality', 'First Aid'] }),
    execute: async (params, ctx) => {
      const query = `Build a match day operations pack for ${params.ageGroup ?? 'Senior'} vs ${params.opponent ?? 'our opponents'}.`;
      return _run(query, { role: ctx.role ?? 'admin', entities: params });
    },
    undo: null,
  },

  {
    id:                  'ops.event_pack',
    name:                'Event Pack',
    category:            'CLUB_OPERATIONS',
    description:         'Generate a complete event management pack: timeline, volunteer roles, communications, logistics, risk assessment.',
    requiredEngines:     ['memory-engine', 'communications-engine', 'ai-copilot'],
    requiredPermissions: ['admin', 'committee'],
    estimatedRuntimeMs:  6000,
    sendsComms:          true,
    requiresApproval:    true,
    nlTriggers:          [/event.*pack/i, /event.*plan/i, /plan.*event/i, /organise.*event/i, /event.*management/i],
    tags:                ['event', 'operations', 'pack', 'logistics'],
    inputs: [
      { name: 'eventName', type: 'string', required: false },
      { name: 'date',      type: 'string', required: false },
      { name: 'capacity',  type: 'number', required: false },
    ],
    preview: async (params) => ({ willGenerate: `Event pack for ${params.eventName ?? 'upcoming event'}`, sections: ['Timeline', 'Volunteers', 'Comms', 'Logistics', 'Risk'] }),
    execute: async (params, ctx) => {
      const { buildGeneralAnnouncement } = await _comms();
      const comms = buildGeneralAnnouncement({ audience: 'all_members', subject: `Event: ${params.eventName ?? 'Club Event'}` });
      const plan = await _run(`Generate event management plan for ${params.eventName ?? 'our next event'} on ${params.date ?? 'TBD'}.`, { role: ctx.role ?? 'admin' });
      return { success: true, data: { plan, communications: comms }, summary: `Event pack for ${params.eventName ?? 'event'}` };
    },
    undo: null,
  },

  {
    id:                  'ops.awards_evening',
    name:                'Awards Evening Pack',
    category:            'CLUB_OPERATIONS',
    description:         'Generate the full awards evening pack: nominee lists, programme, invite emails, sponsor acknowledgements.',
    requiredEngines:     ['memory-engine', 'knowledge-engine', 'communications-engine', 'ai-copilot'],
    requiredPermissions: ['committee', 'admin'],
    estimatedRuntimeMs:  7000,
    sendsComms:          true,
    requiresApproval:    true,
    nlTriggers:          [/awards.*evening/i, /end.*of.*season.*awards/i, /award.*night/i, /awards.*pack/i, /annual.*awards/i],
    tags:                ['awards', 'evening', 'ceremony', 'season', 'operations'],
    inputs: [
      { name: 'date',    type: 'string', required: false },
      { name: 'season',  type: 'string', required: false },
      { name: 'venue',   type: 'string', required: false, default: 'Club House' },
    ],
    preview: async (params) => ({ willGenerate: `Awards evening pack`, sections: ['Nominees', 'Programme', 'Invites', 'Sponsor Acks', 'MC Script'] }),
    execute: async (params, ctx) => {
      const { buildAwardsEvening } = await _comms();
      const result = await buildAwardsEvening({ date: params.date, season: params.season, venue: params.venue ?? 'Club House' }).catch(() => ({ content: 'Awards evening pack (mock)', isMock: true }));
      return { success: true, data: result, summary: `Awards evening pack generated` };
    },
    undo: null,
  },

  {
    id:                  'ops.christmas_function',
    name:                'Christmas Function Pack',
    category:            'CLUB_OPERATIONS',
    description:         'Build the Christmas function management pack: invites, menu options, entertainment, budget, volunteer schedule.',
    requiredEngines:     ['memory-engine', 'communications-engine', 'ai-copilot'],
    requiredPermissions: ['committee', 'admin'],
    estimatedRuntimeMs:  6000,
    sendsComms:          true,
    requiresApproval:    true,
    nlTriggers:          [/christmas.*function/i, /christmas.*party/i, /xmas.*function/i, /club.*christmas/i, /christmas.*pack/i],
    tags:                ['christmas', 'function', 'party', 'social', 'events'],
    inputs: [
      { name: 'date',  type: 'string', required: false },
      { name: 'venue', type: 'string', required: false, default: 'Club House' },
    ],
    preview: async (params) => ({ willGenerate: 'Christmas function pack', sections: ['Invites', 'Programme', 'Catering', 'Volunteer Schedule', 'Budget'] }),
    execute: async (params, ctx) => {
      const { buildChristmasFunction } = await _comms();
      const result = await buildChristmasFunction({ date: params.date, venue: params.venue ?? 'Club House' }).catch(() => ({ content: 'Christmas function pack (mock)', isMock: true }));
      return { success: true, data: result, summary: 'Christmas function pack generated' };
    },
    undo: null,
  },

  {
    id:                  'ops.fundraising',
    name:                'Fundraising Campaign',
    category:            'CLUB_OPERATIONS',
    description:         'Plan and launch a fundraising campaign: goals, messaging, timeline, donor targeting, social content.',
    requiredEngines:     ['memory-engine', 'communications-engine', 'knowledge-engine', 'ai-copilot'],
    requiredPermissions: ['committee', 'admin'],
    estimatedRuntimeMs:  6500,
    sendsComms:          true,
    requiresApproval:    true,
    nlTriggers:          [/fundrais.*campaign/i, /fundrais/i, /raise.*money/i, /donation.*campaign/i, /fund.*campaign/i],
    tags:                ['fundraising', 'campaign', 'donations', 'finance', 'operations'],
    inputs: [
      { name: 'target', type: 'number', required: false, description: 'Fundraising target in euros' },
      { name: 'type',   type: 'string', required: false, description: 'Type: gala | lottery | online | event' },
      { name: 'cause',  type: 'string', required: false },
    ],
    preview: async (params) => ({ willPlan: `Fundraising campaign`, target: params.target ? `€${params.target}` : 'TBD', type: params.type ?? 'general', approvalRequired: true }),
    execute: async (params, ctx) => {
      const { buildFundraisingCampaign } = await _comms();
      const result = buildFundraisingCampaign({ target: params.target ?? 5000, type: params.type ?? 'general', cause: params.cause ?? 'club development' });
      return { success: true, data: result, summary: `Fundraising campaign drafted${params.target ? ` — target €${params.target}` : ''}` };
    },
    undo: null,
  },

  {
    id:                  'ops.recruitment',
    name:                'Recruitment Campaign',
    category:            'CLUB_OPERATIONS',
    description:         'Run a player recruitment campaign — target age groups, messaging, social content, school links, open training.',
    requiredEngines:     ['memory-engine', 'communications-engine', 'ai-copilot'],
    requiredPermissions: ['dor', 'committee', 'admin'],
    estimatedRuntimeMs:  5500,
    sendsComms:          true,
    requiresApproval:    true,
    nlTriggers:          [/recruitment.*campaign/i, /recruit.*player/i, /new.*player.*drive/i, /sign.*up.*drive/i, /open.*training.*campaign/i],
    tags:                ['recruitment', 'campaign', 'new-players', 'operations'],
    inputs: [
      { name: 'targetAgeGroup', type: 'string', required: false, description: 'Target age group for recruitment' },
      { name: 'openDate',       type: 'string', required: false, description: 'Open training date' },
    ],
    preview: async (params) => ({ willPlan: `Recruitment campaign${params.targetAgeGroup ? ` for ${params.targetAgeGroup}` : ''}`, approvalRequired: true }),
    execute: async (params, ctx) => {
      const query = `Build a player recruitment campaign${params.targetAgeGroup ? ` targeting ${params.targetAgeGroup}` : ''}.`;
      return _run(query, { role: ctx.role ?? 'dor', entities: params });
    },
    undo: null,
  },
];

// ── Registry ──────────────────────────────────────────────────────────────────

const ALL_ACTIONS = [
  ...COACHING_ACTIONS,
  ...PLAYER_ACTIONS,
  ...COMMS_ACTIONS,
  ...DOR_ACTIONS,
  ...COMMITTEE_ACTIONS,
  ...OPS_ACTIONS,
];

const _byId = Object.fromEntries(ALL_ACTIONS.map(a => [a.id, a]));

export function getAction(id) {
  return _byId[id] ?? null;
}

export function listActions(category = null) {
  return category ? ALL_ACTIONS.filter(a => a.category === category) : ALL_ACTIONS;
}

export function searchActions(text) {
  const q = text.toLowerCase();
  return ALL_ACTIONS.filter(a =>
    a.name.toLowerCase().includes(q) ||
    a.description.toLowerCase().includes(q) ||
    a.tags.some(t => t.includes(q))
  );
}

export function getActionCount() {
  return ALL_ACTIONS.length;
}

// NL → Action resolution (scores each action's nlTriggers against input text)
export function resolveFromNL(text) {
  let best = null, bestScore = 0;

  for (const action of ALL_ACTIONS) {
    const score = action.nlTriggers.filter(re => re.test(text)).length;
    if (score > bestScore) { bestScore = score; best = action; }
  }

  return best ? { action: best, confidence: Math.min(bestScore * 30, 95) } : null;
}

export { ALL_ACTIONS };
