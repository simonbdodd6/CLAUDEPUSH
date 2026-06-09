/**
 * Assistant Core
 *
 * Orchestrates the full observation → detect → rank → timeline pipeline.
 * Also provides the morning briefing and runs automatable actions.
 */

import { observe, MOCK_OBSERVATIONS }    from './observation-engine.js';
import { detectAndRank, summarise }      from './recommendation-engine.js';
import { generateTimeline }              from './ai-timeline.js';
import { classifyRecommendations,
         getAutomationReport,
         getAutoExecutableActions,
         generateCoachBriefing }         from './decision-support.js';
import { saveRecommendation,
         loadActiveRecommendations,
         dismissRecommendation,
         snoozeRecommendation,
         resolveRecommendation }         from './assistant-state.js';

let _lastRun    = null;
let _lastResult = null;

// ── Full pipeline run ─────────────────────────────────────────────────────────

export async function runCheck(opts = {}) {
  const { useMock = false, saveToState = true } = opts;

  const observations  = useMock ? MOCK_OBSERVATIONS : await observe();
  const recommendations = detectAndRank(observations);
  const fixtures      = observations?.fixtures?.within7d ?? [];
  const timeline      = generateTimeline(observations, fixtures);
  const classified    = classifyRecommendations(recommendations);
  const briefing      = generateCoachBriefing(recommendations, timeline, observations);
  const automation    = getAutomationReport(recommendations);
  const summary       = summarise(recommendations);

  if (saveToState) {
    for (const rec of recommendations) {
      try { saveRecommendation(rec); } catch { /* non-fatal */ }
    }
  }

  _lastRun    = new Date().toISOString();
  _lastResult = { observations, recommendations, timeline, classified, briefing, automation, summary };

  return _lastResult;
}

// ── Morning briefing ──────────────────────────────────────────────────────────

export async function runMorningBriefing(opts = {}) {
  const result = await runCheck({ ...opts, saveToState: true });
  return {
    ts:        new Date().toISOString(),
    type:      'MORNING_BRIEFING',
    briefing:  result.briefing,
    summary:   result.summary,
    topRecs:   result.recommendations.slice(0, 3),
    timeline:  result.timeline.byDay.slice(0, 5),
    automation: result.automation,
  };
}

// ── Auto-execute ──────────────────────────────────────────────────────────────

export async function runAutomations(opts = {}) {
  const result  = opts.result ?? await runCheck(opts);
  const actions = getAutoExecutableActions(result.recommendations);

  const executed = [];
  const failed   = [];

  for (const action of actions) {
    try {
      const actionMod = await import('../actions/index.js').catch(() => null);
      if (actionMod?.runAction) {
        const res = await actionMod.runAction(action.actionId, action.params ?? {}, { role: 'system', source: 'autonomous-assistant' });
        executed.push({ ...action, result: res });
        try { resolveRecommendation(action.recId); } catch { /* non-fatal */ }
      } else {
        executed.push({ ...action, result: { simulated: true, message: `Would execute ${action.actionId}` } });
      }
    } catch (e) {
      failed.push({ ...action, error: e.message });
    }
  }

  return { executed, failed, totalSaved: actions.reduce((s,a) => s + (a.timeSaved ?? 0), 0) };
}

// ── State management proxies ──────────────────────────────────────────────────

export function dismiss(id) {
  return dismissRecommendation(id);
}

export function snooze(id, hoursFromNow = 4) {
  const until = new Date(Date.now() + hoursFromNow * 3600000).toISOString();
  return snoozeRecommendation(id, until);
}

export function resolve(id) {
  return resolveRecommendation(id);
}

export function getActiveRecommendations() {
  return loadActiveRecommendations();
}

// ── Status ────────────────────────────────────────────────────────────────────

export function getStatus() {
  return {
    lastRun:   _lastRun,
    hasResult: _lastResult != null,
    summary:   _lastResult?.summary ?? null,
    briefing:  _lastResult?.briefing?.headline ?? null,
  };
}
