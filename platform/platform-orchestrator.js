// Platform Orchestrator — executes multi-engine pipelines in dependency order.
// The AI Copilot is the single entry point: ask() delegates to execute() here.
//
// Pipeline execution model:
//   1. Parse intent from NL text
//   2. Match pipeline template
//   3. Execute phases in order (parallel within each phase)
//   4. Validate each result against contracts
//   5. Merge results
//   6. Return unified PlatformResponse

import { boot, getEngineOrNull, topoSort } from './platform-registry.js';
import { createRequest, createResponse, createErrorResponse, fromToolResult, mergeResponses, PLATFORM_INTENTS } from './platform-contracts.js';
import { normalise, PipelineFailedError } from './platform-errors.js';
import { emit, EVENT_TYPES } from './platform-events.js';

const EXEC_TIMEOUT_MS = 15000;

// ── Pipeline Templates ─────────────────────────────────────────────────────────
// Each template defines: which engines, in what phases, and how to merge results.
//
// Phase shape: { id, engines: [engineId], parallel: bool, optional: bool, intent: string }

export const PIPELINES = {

  training_prepare: {
    name:    'Prepare Training Session',
    intents: [PLATFORM_INTENTS.TRAINING_PREPARE, PLATFORM_INTENTS.SESSION_BUILD],
    trigger: /prepare.*training|training.*prep|plan.*session|tonight.*training|tomorrow.*training|build.*session|session.*for\s+\w/i,
    phases: [
      {
        id:       'gather',
        engines:  ['memory-engine', 'knowledge-engine'],
        parallel: true,
        optional: false,
        intent:   'squad_context',
      },
      {
        id:       'generate',
        engines:  ['ai-copilot'],
        parallel: false,
        optional: false,
        intent:   'session_build',
        depends:  ['gather'],
      },
      {
        id:       'communicate',
        engines:  ['communications-engine'],
        parallel: false,
        optional: true,
        intent:   'training_reminder',
        depends:  ['generate'],
      },
    ],
  },

  health_report: {
    name:    'Club Health Report',
    intents: [PLATFORM_INTENTS.HEALTH_SUMMARY],
    trigger: /club.*health|health.*report|how.*healthy|club.*score|summar.*club/i,
    phases: [
      {
        id:       'intelligence',
        engines:  ['club-intelligence', 'knowledge-engine'],
        parallel: true,
        optional: false,
        intent:   'health_summary',
      },
      {
        id:       'dashboard',
        engines:  ['executive-dashboard'],
        parallel: false,
        optional: true,
        intent:   'dashboard_build',
        depends:  ['intelligence'],
      },
    ],
  },

  player_profile: {
    name:    'Player Profile & Development',
    intents: [PLATFORM_INTENTS.PLAYER_PROFILE, PLATFORM_INTENTS.PLAYER_PROGRESS],
    trigger: /player.*profile|how.*is.*\w+.*doing|progress.*of|develop.*\w+|profile.*player/i,
    phases: [
      {
        id:       'memory',
        engines:  ['memory-engine'],
        parallel: false,
        optional: false,
        intent:   'player_context',
      },
      {
        id:       'analysis',
        engines:  ['player-development', 'knowledge-engine'],
        parallel: true,
        optional: true,
        intent:   'player_progress',
        depends:  ['memory'],
      },
    ],
  },

  injury_assessment: {
    name:    'Squad Injury Assessment',
    intents: [PLATFORM_INTENTS.INJURY_REPORT],
    trigger: /injur|unavailable|physio|hamstring|torn|sprain|who.*hurt/i,
    phases: [
      {
        id:       'medical',
        engines:  ['knowledge-engine', 'memory-engine'],
        parallel: true,
        optional: false,
        intent:   'injury_report',
      },
    ],
  },

  communications_pack: {
    name:    'Weekly Communications Pack',
    intents: [PLATFORM_INTENTS.COMMS_PACK],
    trigger: /comm.*pack|weekly.*pack|this.*week.*comm|newsletter|club.*comm/i,
    phases: [
      {
        id:       'data',
        engines:  ['memory-engine', 'data-integration', 'knowledge-engine'],
        parallel: true,
        optional: false,
        intent:   'comms_context',
      },
      {
        id:       'build',
        engines:  ['communications-engine'],
        parallel: false,
        optional: false,
        intent:   'comms_pack',
        depends:  ['data'],
      },
    ],
  },

  general: {
    name:    'General Query',
    intents: [],
    trigger: null,
    phases: [
      {
        id:       'answer',
        engines:  ['ai-copilot'],
        parallel: false,
        optional: false,
        intent:   'general',
      },
    ],
  },
};

// ── Intent → Pipeline matching ─────────────────────────────────────────────────

export function detectPipeline(text) {
  for (const [key, tmpl] of Object.entries(PIPELINES)) {
    if (key === 'general') continue;
    if (tmpl.trigger?.test(text)) return { key, template: tmpl };
  }
  return { key: 'general', template: PIPELINES.general };
}

// ── Engine adapter — calls the engine's native API ─────────────────────────────

async function callEngine(engineId, intent, payload, context, phaseResults) {
  const engine = getEngineOrNull(engineId);
  if (!engine) return { success: false, error: `Engine '${engineId}' not registered`, data: null, summary: '', evidence: [] };

  const enrichedContext = {
    ...context,
    phaseResults,
    platformIntent: intent,
  };

  // Map platform intent to engine-native call
  try {
    switch (engineId) {
      case 'memory-engine': {
        const m = await import('../memory-engine/index.js');
        const players = m.getAllPlayers?.() ?? [];
        const teams   = m.getAllTeams?.() ?? [];
        const stats   = m.getStats?.() ?? {};
        return { success: true, data: { players, teams, stats }, summary: `${players.length} players, ${teams.length} teams`, evidence: [`${players.length} players from memory`] };
      }

      case 'data-integration': {
        const di = await import('../qa/data-integration/index.js');
        const [fixtures, attendance] = await Promise.all([
          di.query({ source: 'fixtures', role: 'public' }).catch(() => ({ data: [] })),
          di.query({ source: 'attendance', role: 'coach' }).catch(() => ({ data: [] })),
        ]);
        return { success: true, data: { fixtures: fixtures.data ?? [], attendance: attendance.data ?? [] }, summary: `${fixtures.data?.length ?? 0} fixtures, ${attendance.data?.length ?? 0} sessions`, evidence: [] };
      }

      case 'knowledge-engine': {
        const ke = await import('../knowledge-engine/index.js');
        const q  = context.query ?? intent;
        const result = await ke.ask(q, { role: context.role ?? 'coach' });
        return { success: true, data: result, summary: result.answer, evidence: result.citations?.map(c => c.fact) ?? [] };
      }

      case 'club-intelligence': {
        const ci = await import('../qa/club-intelligence/index.js');
        const [health, insights] = await Promise.all([ci.getClubHealth(), ci.getInsights()]);
        return { success: true, data: { health, insights }, summary: `Health: ${health?.overallScore ?? '?'}/100`, evidence: [`Score: ${health?.overallScore ?? '?'}`, `Trend: ${health?.trend ?? '?'}`] };
      }

      case 'coaching-engine': {
        const ce = await import('../qa/coaching-engine/index.js');
        const sessionInput = context.sessionInput ?? {
          ageGroup:    context.entities?.ageGroup ?? enrichedContext.phaseResults?.gather?.['memory-engine']?.data?.teams?.[0]?.ageGroup ?? 'Senior',
          focus:       context.entities?.sessionFocus ?? 'General fitness and skills',
          duration:    90,
          playerCount: enrichedContext.phaseResults?.gather?.['memory-engine']?.data?.players?.length ?? 20,
        };
        const session = ce.generateSession?.(sessionInput) ?? { plan: 'Session plan (mock)', isMock: true };
        return { success: true, data: session, summary: session.summary ?? `Session for ${sessionInput.ageGroup}`, evidence: [`Generated for ${sessionInput.ageGroup}`] };
      }

      case 'communications-engine': {
        const comms = await import('../communications-engine/index.js');
        if (intent === 'training_reminder' || intent === 'comms_context') {
          const sessionPlan = enrichedContext.phaseResults?.generate?.['ai-copilot']?.data ?? enrichedContext.phaseResults?.gather?.['memory-engine']?.data;
          const draft = comms.buildTrainingReminder?.({ ageGroup: context.entities?.ageGroup ?? 'Squad', date: new Date().toLocaleDateString('en-IE'), venue: 'Club Grounds', focus: 'Training' }) ?? null;
          return { success: true, data: { draft }, summary: 'Training reminder drafted', evidence: ['Reminder draft created'] };
        }
        const pack = await comms.buildWeeklyPack?.() ?? { status: 'draft', drafts: [], isMock: true };
        return { success: true, data: pack, summary: `Pack with ${pack.drafts?.length ?? 0} drafts`, evidence: [`Weekly pack generated`] };
      }

      case 'workflow-engine': {
        const wf = await import('../workflow-engine/index.js');
        const pending = wf.listPending?.() ?? [];
        return { success: true, data: { pending, count: pending.length }, summary: `${pending.length} pending workflows`, evidence: [] };
      }

      case 'player-development': {
        const pd = await import('../qa/player-development/index.js');
        const players = enrichedContext.phaseResults?.memory?.['memory-engine']?.data?.players
          ?? enrichedContext.phaseResults?.gather?.['memory-engine']?.data?.players ?? [];
        if (!players.length) return { success: true, data: { message: 'No players in memory yet' }, summary: 'No players', evidence: [] };
        const analysis = await pd.analyseSquad?.(players) ?? { isMock: true };
        return { success: true, data: analysis, summary: 'Squad analysis complete', evidence: [] };
      }

      case 'executive-dashboard': {
        const dash = await import('../dashboard/index.js');
        const briefing = await dash.buildMorningBriefing?.(context.role ?? 'coach');
        return { success: true, data: briefing, summary: briefing?.headline ?? 'Dashboard built', evidence: [] };
      }

      case 'ai-copilot': {
        const cp = await import('../ai-copilot/index.js');
        const query = context.query ?? payload?.text ?? intent;
        const result = await cp.chat(query, { context: enrichedContext });
        const res = result?.response ?? result;
        return { success: true, data: res, summary: res?.summary ?? 'Copilot response', evidence: res?.evidence ?? [] };
      }

      default:
        return { success: false, error: `No adapter for engine '${engineId}'`, data: null, summary: '', evidence: [] };
    }
  } catch (err) {
    return { success: false, error: err.message, data: null, summary: '', evidence: [] };
  }
}

// ── Pipeline executor ──────────────────────────────────────────────────────────

export async function executePipeline(pipelineKey, context = {}, options = {}) {
  boot();
  const start    = Date.now();
  const template = PIPELINES[pipelineKey] ?? PIPELINES.general;
  const reqId    = `pipe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  emit(EVENT_TYPES.WORKFLOW_STARTED, { pipelineKey, reqId }, 'platform-orchestrator');

  const allPhaseResults = {};  // phaseId → { engineId: PlatformResponse }

  for (const phase of template.phases) {
    // Check dependency results
    if (phase.depends) {
      const depsFailed = phase.depends.filter(dep => {
        const depResults = allPhaseResults[dep];
        return !depResults || Object.values(depResults).every(r => !r.success);
      });
      if (depsFailed.length > 0 && !phase.optional) {
        emit(EVENT_TYPES.WORKFLOW_FAILED, { pipelineKey, phase: phase.id, depsFailed }, 'platform-orchestrator');
        return createErrorResponse(reqId, new PipelineFailedError(pipelineKey, phase.id, `Deps failed: ${depsFailed.join(', ')}`));
      }
    }

    const phaseContext = { ...context, phaseResults: allPhaseResults };
    const phaseResults = {};

    if (phase.parallel) {
      const calls = phase.engines.map(async (engineId) => {
        const result = await Promise.race([
          callEngine(engineId, phase.intent, context.payload ?? {}, phaseContext, allPhaseResults),
          new Promise((_, r) => setTimeout(() => r(new Error(`Timeout: ${engineId}`)), EXEC_TIMEOUT_MS)),
        ]).catch(err => ({ success: false, error: err.message, data: null, summary: '', evidence: [] }));

        phaseResults[engineId] = fromToolResult(result, reqId, engineId);
      });
      await Promise.all(calls);
    } else {
      for (const engineId of phase.engines) {
        const result = await callEngine(engineId, phase.intent, context.payload ?? {}, phaseContext, allPhaseResults)
          .catch(err => ({ success: false, error: err.message, data: null, summary: '', evidence: [] }));
        phaseResults[engineId] = fromToolResult(result, reqId, engineId);
      }
    }

    allPhaseResults[phase.id] = phaseResults;
  }

  // Merge all results
  const allResponses = Object.values(allPhaseResults).flatMap(pr => Object.values(pr));
  const merged = mergeResponses(allResponses, reqId);

  // Build readable summary
  const summaries = allResponses
    .filter(r => r.success && r.meta?.engine)
    .map(r => `${r.meta.engine}: ${typeof r.data?.summary === 'string' ? r.data.summary : r.data?.answer ?? '✓'}`)
    .join(' · ');

  const durationMs = Date.now() - start;
  emit(EVENT_TYPES.PIPELINE_COMPLETED, { pipelineKey, reqId, durationMs, engineCount: allResponses.length }, 'platform-orchestrator');

  return {
    ...merged,
    pipelineKey,
    pipelineName: template.name,
    phaseResults: allPhaseResults,
    unified: {
      summary:   summaries || `${template.name} complete`,
      engines:   [...new Set(allResponses.map(r => r.meta?.engine).filter(Boolean))],
      succeeded: merged.meta.succeeded,
      failed:    merged.meta.failed,
      durationMs,
    },
  };
}

// ── Main entry point — text → pipeline → unified response ─────────────────────

export async function execute(text, context = {}) {
  boot();
  const { key, template } = detectPipeline(text);

  return executePipeline(key, {
    ...context,
    query:   text,
    payload: { text },
  });
}

// ── Single-engine adapter (used by platform.ask) ───────────────────────────────

export async function callSingleEngine(engineId, intent, payload = {}, context = {}) {
  boot();
  const reqId = `single-${Date.now()}`;
  const result = await callEngine(engineId, intent, payload, context, {})
    .catch(err => ({ success: false, error: err.message, data: null, summary: '', evidence: [] }));
  return fromToolResult(result, reqId, engineId);
}
