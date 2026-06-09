/**
 * Autonomous Assistant API Server — port 3004
 *
 * Routes:
 *   GET  /status                           → assistant status
 *   GET  /briefing                         → morning briefing
 *   GET  /recommendations                  → active ranked recommendations
 *   POST /recommendations/:id/dismiss      → dismiss
 *   POST /recommendations/:id/snooze       → snooze (body: { hours })
 *   POST /recommendations/:id/resolve      → mark resolved
 *   GET  /timeline                         → 14-day AI timeline
 *   GET  /decision-support                 → classified recommendations
 *   GET  /automation-report                → what can be automated
 *   POST /run                              → trigger full check
 *   POST /automate                         → execute auto-executable actions
 */

import express from 'express';
import { runCheck, runMorningBriefing, runAutomations, getStatus, dismiss, snooze, resolve } from './assistant-core.js';
import { MOCK_OBSERVATIONS }       from './observation-engine.js';
import { detectAndRank }           from './recommendation-engine.js';
import { generateTimeline }        from './ai-timeline.js';
import { classifyRecommendations, getAutomationReport } from './decision-support.js';
import { loadActiveRecommendations }                    from './assistant-state.js';

const app  = express();
app.use(express.json());
app.use((_, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

function wrap(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req, res);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  };
}

app.get('/status', wrap(async () => {
  return { status: getStatus(), ts: new Date().toISOString() };
}));

app.get('/briefing', wrap(async () => {
  const b = await runMorningBriefing({ useMock: true });
  return b;
}));

app.get('/recommendations', wrap(async () => {
  const active = loadActiveRecommendations();
  const obs    = MOCK_OBSERVATIONS;
  const fresh  = detectAndRank(obs);
  const merged = fresh.map(r => {
    const saved = active.find(a => a.type === r.type);
    return saved ? { ...r, state: saved.state, snoozedUntil: saved.snoozedUntil } : r;
  }).filter(r => r.state !== 'DISMISSED' && r.state !== 'RESOLVED');
  return { recommendations: merged, count: merged.length };
}));

app.post('/recommendations/:id/dismiss', wrap(async (req) => {
  dismiss(req.params.id);
  return { id: req.params.id, action: 'dismissed' };
}));

app.post('/recommendations/:id/snooze', wrap(async (req) => {
  const hours = req.body?.hours ?? 4;
  snooze(req.params.id, hours);
  return { id: req.params.id, action: 'snoozed', hours };
}));

app.post('/recommendations/:id/resolve', wrap(async (req) => {
  resolve(req.params.id);
  return { id: req.params.id, action: 'resolved' };
}));

app.get('/timeline', wrap(async () => {
  const obs      = MOCK_OBSERVATIONS;
  const timeline = generateTimeline(obs, obs.fixtures?.within7d ?? []);
  return { timeline };
}));

app.get('/decision-support', wrap(async () => {
  const obs  = MOCK_OBSERVATIONS;
  const recs = detectAndRank(obs);
  const classified = classifyRecommendations(recs);
  return {
    auto:    classified.auto.length,
    approve: classified.approve.length,
    human:   classified.human.length,
    details: classified,
  };
}));

app.get('/automation-report', wrap(async () => {
  const obs    = MOCK_OBSERVATIONS;
  const recs   = detectAndRank(obs);
  const report = getAutomationReport(recs);
  return { report };
}));

app.post('/run', wrap(async (req) => {
  const result = await runCheck({ useMock: req.body?.useMock ?? false, saveToState: true });
  return {
    summary:      result.summary,
    briefing:     result.briefing,
    recCount:     result.recommendations.length,
    timelineSize: result.timeline.totalEvents,
    automation:   result.automation,
  };
}));

app.post('/automate', wrap(async (req) => {
  const result  = await runCheck({ useMock: req.body?.useMock ?? true });
  const actions = await runAutomations({ result });
  return { executed: actions.executed.length, failed: actions.failed.length, timeSaved: actions.totalSaved, details: actions };
}));

const PORT = process.env.ASSISTANT_PORT ?? 3004;
app.listen(PORT, () => {
  console.log(`Autonomous Assistant API running on http://localhost:${PORT}`);
});

export default app;
