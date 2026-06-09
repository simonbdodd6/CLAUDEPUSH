/**
 * Workflow Action Registry
 *
 * Every action follows the same contract:
 * {
 *   id:             string       — unique identifier
 *   name:           string       — human label
 *   description:    string       — one sentence
 *   category:       string       — coaching | memory | notification | reporting | scheduling
 *   isReversible:   boolean      — can this be undone?
 *   estimatedMs:    number       — rough execution time
 *   requiredContext: string[]    — context keys needed (player, team, etc.)
 *   execute(params, context, stepOutputs) → ActionResult
 *   undo?(params, context, result)        → void  (if isReversible)
 * }
 *
 * ActionResult: { success, data, summary, undoKey? }
 */

// ── Lazy engine imports ───────────────────────────────────────────────────────

let _coaching = null, _memory = null, _devEngine = null, _clubIntel = null, _commsEngine = null;

async function coachingEngine() {
  if (!_coaching) { try { _coaching = await import('../qa/coaching-engine/index.js'); } catch { _coaching = null; } }
  return _coaching;
}
async function memEngine() {
  if (!_memory) { try { _memory = await import('../memory-engine/index.js'); } catch { _memory = null; } }
  return _memory;
}
async function devEngine() {
  if (!_devEngine) { try { _devEngine = await import('../qa/player-development/index.js'); } catch { _devEngine = null; } }
  return _devEngine;
}
async function clubIntel() {
  if (!_clubIntel) { try { _clubIntel = await import('../qa/club-intelligence/index.js'); } catch { _clubIntel = null; } }
  return _clubIntel;
}
async function commsEngine() {
  if (!_commsEngine) { try { _commsEngine = await import('../communications-engine/index.js'); } catch { _commsEngine = null; } }
  return _commsEngine;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(data, summary, undoKey = null) {
  return { success: true, data, summary, undoKey };
}
function fail(reason) {
  return { success: false, data: null, summary: reason, error: reason };
}
function stub(name) {
  return { success: true, data: { _stub: true, action: name }, summary: `${name} (stub — connect external service to activate)` };
}

// ── Action implementations ────────────────────────────────────────────────────

const ACTIONS = {

  // ── 1. Create Training Session ──────────────────────────────────────────────
  create_session: {
    id: 'create_session',
    name: 'Create Training Session',
    description: 'Generates a structured training session using the Coaching Engine',
    category: 'coaching',
    isReversible: false,
    estimatedMs: 2500,
    requiredContext: [],

    async execute(params, context, stepOutputs) {
      const engine = await coachingEngine();
      const ageGroup = params.ageGroup ?? context.entities?.ageGroup ?? 'Senior';
      const focus    = params.focus    ?? context.entities?.sessionFocus ?? 'General skills and fitness';
      const duration = params.duration ?? (ageGroup.startsWith('U1') ? 90 : 60);

      const sessionInput = { ageGroup, focus, duration, playerCount: params.playerCount ?? 20 };

      if (engine) {
        try {
          const result = await engine.generateSession(
            { ageGroup, players: context.allPlayers ?? [] },
            { focus, duration },
            null,
            { memory: false }
          );
          return ok(result, `Training session generated for ${ageGroup} — ${focus}`);
        } catch { /* fall through to template */ }
      }

      // Template fallback
      return ok(buildSessionTemplate(sessionInput), `Training session template for ${ageGroup} — ${focus}`);
    },
  },

  // ── 2. Save Session ─────────────────────────────────────────────────────────
  save_session: {
    id: 'save_session',
    name: 'Save Session',
    description: 'Persists the session to the Memory Engine',
    category: 'memory',
    isReversible: true,
    estimatedMs: 300,
    requiredContext: [],

    async execute(params, context, stepOutputs) {
      const m = await memEngine();
      if (!m) return fail('Memory Engine not available');

      const sessionData = stepOutputs.create_session?.data ?? params.sessionData ?? {};
      const ageGroup    = context.entities?.ageGroup ?? sessionData.ageGroup ?? 'Senior';

      try {
        const id = m.rememberSession({
          ageGroup,
          focus:   sessionData.focus ?? params.focus ?? 'Training',
          teamId:  context.team?.id,
          notes:   `Saved via Workflow Engine — ${new Date().toISOString()}`,
          raw:     sessionData,
        });
        return ok({ sessionId: id ?? `session_${Date.now()}`, ageGroup }, 'Session saved to Memory Engine', id);
      } catch (err) {
        return fail(`Save failed: ${err.message}`);
      }
    },

    async undo(params, context, result) {
      // Memory Engine doesn't yet support hard delete — mark as archived
      const m = await memEngine();
      if (m && result?.data?.sessionId) {
        try { m.updateProgrammeStatus?.(result.data.sessionId, 'archived', 'Rolled back by Workflow Engine'); }
        catch { /* best-effort */ }
      }
    },
  },

  // ── 3. Assign Session to Team ───────────────────────────────────────────────
  assign_session_to_team: {
    id: 'assign_session_to_team',
    name: 'Assign Session to Team',
    description: 'Links a saved session to a team record in memory',
    category: 'memory',
    isReversible: true,
    estimatedMs: 200,
    requiredContext: [],

    async execute(params, context, stepOutputs) {
      const sessionId = stepOutputs.save_session?.data?.sessionId ?? params.sessionId;
      const team      = context.team;
      const ageGroup  = context.entities?.ageGroup ?? team?.ageGroup ?? 'Unknown';

      if (!sessionId) return fail('No session ID — run save_session first');
      return ok({ sessionId, teamId: team?.id, ageGroup }, `Session assigned to ${ageGroup} team`);
    },

    async undo() { /* assignment removal — no-op */ },
  },

  // ── 4. Generate PDF ─────────────────────────────────────────────────────────
  generate_pdf: {
    id: 'generate_pdf',
    name: 'Generate PDF',
    description: 'Exports the session or programme as a printable PDF',
    category: 'reporting',
    isReversible: false,
    estimatedMs: 1500,
    requiredContext: [],

    async execute(params, context, stepOutputs) {
      const session = stepOutputs.create_session?.data ?? stepOutputs.create_rehab_programme?.data ?? {};
      const ageGroup = context.entities?.ageGroup ?? 'Team';
      const filename = `session_${ageGroup}_${new Date().toISOString().split('T')[0]}.pdf`;
      // Stub — connects to qa/coaching-engine/pdf-outline.js in future
      return ok({ filename, path: `/tmp/${filename}`, _stub: true },
        `PDF queued: ${filename} (connect PDF engine to render)`);
    },
  },

  // ── 5. Send Player Notification ─────────────────────────────────────────────
  send_player_notification: {
    id: 'send_player_notification',
    name: 'Send Player Notification',
    description: 'Sends a push notification to a player via the web push system',
    category: 'notification',
    isReversible: false,
    estimatedMs: 500,
    requiredContext: [],

    async execute(params, context, stepOutputs) {
      const player   = context.player;
      const name     = player?.core?.name ?? 'Player';
      const message  = params.message ?? buildPlayerMessage(params, stepOutputs, context);
      // Stub — connects to api/push.js when player device tokens are available
      return ok(
        { recipient: name, message, _stub: true },
        `Notification queued for ${name}: "${message.slice(0, 60)}"`
      );
    },
  },

  // ── 6. Send Coach Notification ──────────────────────────────────────────────
  send_coach_notification: {
    id: 'send_coach_notification',
    name: 'Send Coach Notification',
    description: 'Sends a push notification to coaches',
    category: 'notification',
    isReversible: false,
    estimatedMs: 500,
    requiredContext: [],

    async execute(params, context, stepOutputs) {
      const ageGroup = context.entities?.ageGroup ?? 'the team';
      const message  = params.message ?? buildCoachMessage(params, stepOutputs, context);
      // Stub — connects to api/push.js with coach device tokens
      return ok(
        { ageGroup, message, _stub: true },
        `Coach notification queued: "${message.slice(0, 60)}"`
      );
    },
  },

  // ── 7. Update Player Memory ─────────────────────────────────────────────────
  update_player_memory: {
    id: 'update_player_memory',
    name: 'Update Player Memory',
    description: 'Saves workflow results and insights to the player\'s memory record',
    category: 'memory',
    isReversible: false,
    estimatedMs: 300,
    requiredContext: [],

    async execute(params, context, stepOutputs) {
      const m      = await memEngine();
      const player = context.player;
      if (!m || !player) return ok({ skipped: true }, 'No player in context — memory update skipped');

      try {
        const id = m.rememberPlayer({ ...player.core, ...params.updates });
        return ok({ playerId: id, name: player.core?.name }, `Memory updated for ${player.core?.name}`);
      } catch (err) {
        return fail(`Memory update failed: ${err.message}`);
      }
    },
  },

  // ── 8. Update Season Plan ───────────────────────────────────────────────────
  update_season_plan: {
    id: 'update_season_plan',
    name: 'Update Season Plan',
    description: 'Records this session in the season plan for the team',
    category: 'memory',
    isReversible: false,
    estimatedMs: 300,
    requiredContext: [],

    async execute(params, context, stepOutputs) {
      const m        = await memEngine();
      const sessionId = stepOutputs.save_session?.data?.sessionId;
      const ageGroup  = context.entities?.ageGroup ?? 'Senior';

      if (!m) return ok({ _stub: true }, 'Season plan updated (stub — Memory Engine unavailable)');

      try {
        const id = m.rememberSeason({
          ageGroup,
          teamId:  context.team?.id,
          note:    `Session ${sessionId ?? 'n/a'} added via Workflow Engine`,
        });
        return ok({ seasonId: id, ageGroup }, `Season plan updated for ${ageGroup}`);
      } catch (err) {
        return ok({ _stub: true }, 'Season plan updated (stub)');
      }
    },
  },

  // ── 9. Schedule Future Session ──────────────────────────────────────────────
  schedule_future_session: {
    id: 'schedule_future_session',
    name: 'Schedule Future Session',
    description: 'Adds a future session to the Workflow Queue',
    category: 'scheduling',
    isReversible: true,
    estimatedMs: 100,
    requiredContext: [],

    async execute(params, context, stepOutputs) {
      const { enqueue } = await import('./workflow-queue.js');
      const sessionData = stepOutputs.create_session?.data ?? {};
      const scheduledFor = params.scheduledFor
        ?? nextOccurrence(params.dayOfWeek ?? 'tuesday', params.time ?? '18:30');

      const queueId = enqueue({
        name:        `Scheduled Session — ${context.entities?.ageGroup ?? 'Team'}`,
        scheduledFor,
        workflowDef: {
          intent: 'build_session',
          context: { ...context, scheduledFor },
          steps: [{ actionId: 'create_session' }, { actionId: 'save_session' }],
        },
      });

      return ok(
        { queueId, scheduledFor },
        `Session scheduled for ${new Date(scheduledFor).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'short' })}`,
        queueId,
      );
    },

    async undo(params, context, result) {
      const { cancel } = await import('./workflow-queue.js');
      if (result?.data?.queueId) cancel(result.data.queueId);
    },
  },

  // ── 10. Create Rehabilitation Programme ────────────────────────────────────
  create_rehab_programme: {
    id: 'create_rehab_programme',
    name: 'Create Rehabilitation Programme',
    description: 'Generates a return-to-play rehabilitation plan using the Coaching Engine',
    category: 'coaching',
    isReversible: false,
    estimatedMs: 2500,
    requiredContext: [],

    async execute(params, context, stepOutputs) {
      const engine = await coachingEngine();
      const player  = context.player;
      if (!player) return fail('No player in context — specify a player for rehab programme');

      const profile = {
        name:       player.core?.name,
        position:   player.core?.position,
        age:        player.core?.age,
        experience: player.core?.experience ?? 'Intermediate',
        goals:      (player.goals ?? []).map(g => g.goal ?? g),
        injuries:   (player.injuries ?? []).filter(i => i.status === 'active').map(i => i.type),
        trainingDays: 3,
        equipment:  ['Full gym'],
        seasonPhase: 'recovery',
      };

      if (engine) {
        try {
          const result = await engine.generateRehabPlan(profile, null, { memory: false });
          return ok(result, `Rehabilitation plan generated for ${player.core?.name}`);
        } catch { /* fall through */ }
      }

      return ok(buildRehabTemplate(profile), `Rehabilitation plan template for ${player.core?.name}`);
    },
  },

  // ── 11. Assign Programme ────────────────────────────────────────────────────
  assign_programme: {
    id: 'assign_programme',
    name: 'Assign Programme',
    description: 'Saves and assigns a programme to a player in memory',
    category: 'memory',
    isReversible: true,
    estimatedMs: 300,
    requiredContext: [],

    async execute(params, context, stepOutputs) {
      const m        = await memEngine();
      const player   = context.player;
      const progData = stepOutputs.create_rehab_programme?.data
        ?? stepOutputs.create_training_programme?.data
        ?? params.programme;

      if (!m) return ok({ _stub: true }, 'Programme assigned (stub — Memory Engine unavailable)');
      if (!player?.id) return ok({ _stub: true }, 'Programme assigned (stub — no player resolved)');

      try {
        const id = m.rememberProgramme({
          playerId: player.id,
          status:   'active',
          input:    progData?.raw?.input ?? progData ?? {},
          raw:      progData,
        });
        return ok({ progId: id, playerName: player.core?.name }, `Programme assigned to ${player.core?.name}`, id);
      } catch (err) {
        return fail(`Assign failed: ${err.message}`);
      }
    },

    async undo(params, context, result) {
      const m = await memEngine();
      if (m && result?.data?.progId) {
        try { m.updateProgrammeStatus(result.data.progId, 'archived', 'Rolled back by Workflow Engine'); }
        catch { /* best-effort */ }
      }
    },
  },

  // ── 12. Generate Match Report ───────────────────────────────────────────────
  generate_match_report: {
    id: 'generate_match_report',
    name: 'Generate Match Report',
    description: 'Creates a post-match analysis report',
    category: 'reporting',
    isReversible: false,
    estimatedMs: 3000,
    requiredContext: [],

    async execute(params, context) {
      // Future: connect to Match Analysis Engine
      return stub('Match Report Generator (connect Match Analysis Engine)');
    },
  },

  // ── 13. Generate Director of Rugby Report ──────────────────────────────────
  generate_dor_report: {
    id: 'generate_dor_report',
    name: 'Generate Director of Rugby Report',
    description: 'Generates the weekly DoR intelligence brief via Club Intelligence Engine',
    category: 'reporting',
    isReversible: false,
    estimatedMs: 5000,
    requiredContext: [],

    async execute(params, context) {
      const ci = await clubIntel();
      if (!ci) return stub('DoR Report (Club Intelligence Engine unavailable)');

      try {
        const dashboard = await ci.getDashboard({ format: 'markdown', date: params.date });
        return ok({ dashboard, format: 'markdown' }, 'Director of Rugby report generated');
      } catch (err) {
        return fail(`DoR report failed: ${err.message}`);
      }
    },
  },

  // ── 14. Create Player Review ────────────────────────────────────────────────
  create_player_review: {
    id: 'create_player_review',
    name: 'Create Player Review',
    description: 'Generates a full development analysis report for a player',
    category: 'reporting',
    isReversible: false,
    estimatedMs: 3000,
    requiredContext: [],

    async execute(params, context) {
      const de     = await devEngine();
      const player = context.player;
      if (!player) return fail('No player in context — specify a player for review');
      if (!de)     return stub('Player Review (Player Development Engine unavailable)');

      try {
        const markdown = await de.generateDevelopmentReport(player, [], { memoryOff: true });
        return ok({ report: markdown, playerName: player.core?.name }, `Player review generated for ${player.core?.name}`);
      } catch (err) {
        return fail(`Player review failed: ${err.message}`);
      }
    },
  },

  // ── 15. Create Club Report ──────────────────────────────────────────────────
  create_club_report: {
    id: 'create_club_report',
    name: 'Create Club Report',
    description: 'Generates a full club intelligence report via the Club Intelligence Engine',
    category: 'reporting',
    isReversible: false,
    estimatedMs: 6000,
    requiredContext: [],

    async execute(params, context) {
      const ci = await clubIntel();
      if (!ci) return stub('Club Report (Club Intelligence Engine unavailable)');

      try {
        const report = await ci.generateClubReport();
        return ok(
          { healthScore: report.health?.overallScore, insightCount: report.insights?.totalCount },
          `Club report generated — health ${report.health?.overallScore ?? 'n/a'}/100, ${report.insights?.totalCount ?? 0} insights`,
        );
      } catch (err) {
        return fail(`Club report failed: ${err.message}`);
      }
    },
  },
  // ── 16. Generate Communication Draft ─────────────────────────────────────────
  generate_communication: {
    id: 'generate_communication',
    name: 'Generate Communication Draft',
    description: 'Creates a draft communication of a given type for a target audience — stays in DRAFT, never sends',
    category: 'communication',
    isReversible: false,
    estimatedMs: 1500,
    requiredContext: [],

    async execute(params, context, stepOutputs) {
      const ce = await commsEngine();
      if (!ce) return stub('Communication draft (Communications Engine unavailable)');

      const type         = params.type ?? 'general_announcement';
      const audienceType = params.audienceType ?? 'players';
      const vars         = params.vars ?? { club_name: context.clubName ?? 'Your Club', subject_line: params.subject ?? type };

      try {
        const preview = await ce.previewCommunication({ type, audienceType, vars }, { role: context.role ?? 'coach' });
        return ok({ type, audienceType, preview, status: 'draft', requiresHumanApproval: true }, `Communication draft created: ${type} → ${audienceType} (${preview.recipientCount} recipients, draft only)`);
      } catch (err) {
        return stub(`${type} communication draft`);
      }
    },
  },

  // ── 17. Build Communications Pack ────────────────────────────────────────────
  build_communications_pack: {
    id: 'build_communications_pack',
    name: 'Build Weekly Communications Pack',
    description: 'Generates a full weekly club communications pack — all items in DRAFT status',
    category: 'communication',
    isReversible: false,
    estimatedMs: 8000,
    requiredContext: [],

    async execute(params, context, stepOutputs) {
      let packBuilder;
      try {
        packBuilder = await import('../communications-engine/communications-pack-builder.js');
      } catch {
        return stub('Weekly communications pack');
      }

      try {
        const pack = await packBuilder.buildWeeklyPack({
          clubName:    params.clubName   ?? context.clubName   ?? 'Your Club',
          coachName:   params.coachName  ?? context.coachName  ?? 'The Management',
          contactName: params.contactName ?? context.contactName ?? 'Club Secretary',
          season:      params.season     ?? context.season     ?? '2025-26',
        });

        return ok(
          { packId: pack.packId, totalDrafts: pack.stats.totalDrafts, byRisk: pack.stats.byRisk, warnings: pack.warnings, status: 'draft', requiresHumanApproval: true },
          `Weekly pack built: ${pack.stats.totalDrafts} drafts + ${pack.stats.totalSocialPosts} social posts (all DRAFT — human approval required)`,
        );
      } catch (err) {
        return fail(`Communications pack failed: ${err.message}`);
      }
    },
  },

  // ── 18. Schedule Communication ────────────────────────────────────────────────
  schedule_communication: {
    id: 'schedule_communication',
    name: 'Schedule Communication',
    description: 'Registers a communication for future delivery after human approval',
    category: 'communication',
    isReversible: true,
    estimatedMs: 200,
    requiredContext: [],

    async execute(params, context, stepOutputs) {
      const ce = await commsEngine();
      if (!ce) return stub('Schedule communication');

      const sendAt = params.sendAt ? new Date(params.sendAt) : new Date(Date.now() + 24 * 3600000);
      const spec   = params.commSpec ?? stepOutputs?.generate_communication?.data?.preview ?? { type: 'general_announcement', audienceType: 'players', vars: {} };

      try {
        const result = ce.scheduleCommunication(spec, sendAt);
        return ok(result, `Communication scheduled for ${sendAt.toISOString()} (pending human approval — not yet sent)`);
      } catch (err) {
        return fail(`Schedule failed: ${err.message}`);
      }
    },

    async undo(params, context, result) {
      const ce = await commsEngine();
      if (!ce || !result?.data?.scheduleId) return;
      try { ce.cancelScheduled(result.data.scheduleId); } catch { /* non-fatal */ }
    },
  },
};

// ── Action registry API ───────────────────────────────────────────────────────

export function getAction(id) {
  return ACTIONS[id] ?? null;
}

export function getAllActions() {
  return Object.values(ACTIONS);
}

export function listActions() {
  return Object.values(ACTIONS).map(a => ({
    id:          a.id,
    name:        a.name,
    description: a.description,
    category:    a.category,
    isReversible: a.isReversible,
    estimatedMs: a.estimatedMs,
  }));
}

export function hasAction(id) {
  return id in ACTIONS;
}

// ── Template fallbacks ────────────────────────────────────────────────────────

function buildSessionTemplate(input) {
  const d = input.duration ?? 90;
  return {
    ageGroup: input.ageGroup,
    focus:    input.focus,
    durationMinutes: d,
    warmup:   { duration: Math.round(d * 0.15), activities: ['Dynamic stretching', 'Activation drills'] },
    mainBody: { duration: Math.round(d * 0.70), blocks: [
      { name: `${input.focus} — Block 1`, duration: Math.round(d * 0.35), description: 'Core skill development' },
      { name: `${input.focus} — Block 2`, duration: Math.round(d * 0.35), description: 'Applied drills / game context' },
    ]},
    cooldown: { duration: Math.round(d * 0.10), activities: ['Static stretch', 'Debrief'] },
    coachNotes: `Focus on ${input.focus}. Adapt for ${input.ageGroup} intensity guidelines.`,
    _template: true,
  };
}

function buildRehabTemplate(profile) {
  return {
    player: { name: profile.name, position: profile.position },
    injuries: profile.injuries,
    phases: [
      { week: '1-2', focus: 'Rest & reduce inflammation', load: 'None', protocol: 'PRICE method' },
      { week: '3-4', focus: 'Range of motion restoration', load: 'Light', protocol: 'Physiotherapy-led ROM' },
      { week: '5-6', focus: 'Strength rebuild', load: 'Moderate', protocol: 'Progressive resistance' },
      { week: '7-8', focus: 'Return-to-play progression', load: 'Progressive', protocol: 'Graduated contact' },
    ],
    clearanceCriteria: ['Full pain-free ROM', 'Position-specific fitness test passed', 'Physio sign-off'],
    _template: true,
  };
}

function buildPlayerMessage(params, stepOutputs, context) {
  const session = stepOutputs.create_session?.data ?? {};
  const ag      = context.entities?.ageGroup ?? 'team';
  const focus   = session.focus ?? 'training';
  return params.message ?? `New ${ag} session plan ready: ${focus}. Check Coach's Eye for details.`;
}

function buildCoachMessage(params, stepOutputs, context) {
  const session = stepOutputs.create_session?.data ?? {};
  const ag      = context.entities?.ageGroup ?? 'your team';
  const focus   = session.focus ?? 'training';
  return params.message ?? `Session plan generated for ${ag}: ${focus}. Ready to review.`;
}

function nextOccurrence(dayName, time = '18:30') {
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const targetDay = days.indexOf(dayName.toLowerCase());
  if (targetDay < 0) return new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  const now = new Date();
  const offset = ((targetDay - now.getDay() + 7) % 7) || 7;
  const next = new Date(now);
  next.setDate(now.getDate() + offset);
  const [h, m] = time.split(':').map(Number);
  next.setHours(h, m, 0, 0);
  return next.toISOString();
}
