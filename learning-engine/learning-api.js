/**
 * Learning Engine API — port 3006
 *
 * GET  /health                   — liveness check
 * GET  /outcomes                 — recent outcomes
 * POST /outcomes                 — record a new outcome
 * GET  /calibration              — calibration summary per type
 * GET  /accuracy                 — prediction accuracy (precision/recall/F1)
 * GET  /accuracy/trend           — accuracy trend over 4 periods
 * GET  /feedback/latest          — latest monthly feedback snapshot
 * GET  /feedback/history         — last 12 monthly snapshots
 * POST /feedback/run             — run feedback loop now
 * GET  /club-intelligence        — Club Intelligence Score
 * GET  /club-profile             — stored club profile
 * POST /club-profile/build       — build and persist club profile
 * GET  /improvement-plan         — self-improvement recommendations
 * GET  /status                   — full engine status summary
 */

import { createServer } from 'http';

async function _engine() {
  try { return await import('./index.js'); } catch { return null; }
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data, null, 2));
}

function err(res, msg, status = 500) {
  json(res, { error: msg }, status);
}

async function body(req) {
  return new Promise(resolve => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
  });
}

const server = createServer(async (req, res) => {
  const eng = await _engine();
  if (!eng) return err(res, 'Learning engine failed to load');

  const url = req.url.split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  try {
    if (url === '/health' && req.method === 'GET') {
      return json(res, { status: 'ok', engine: 'learning-engine', port: 3006, ts: new Date().toISOString() });
    }

    if (url === '/outcomes' && req.method === 'GET') {
      return json(res, { outcomes: eng.getRecentOutcomes(50), summary: eng.getOutcomeSummary() });
    }

    if (url === '/outcomes' && req.method === 'POST') {
      const b = await body(req);
      const outcome = eng.recordOutcome(b);
      return json(res, { ok: true, outcome }, 201);
    }

    if (url === '/calibration' && req.method === 'GET') {
      return json(res, eng.getCalibrationSummary());
    }

    if (url === '/accuracy' && req.method === 'GET') {
      return json(res, eng.getPredictionAccuracy());
    }

    if (url === '/accuracy/trend' && req.method === 'GET') {
      return json(res, { trend: eng.getAccuracyTrend(4) });
    }

    if (url === '/feedback/latest' && req.method === 'GET') {
      const history = eng.getFeedbackHistory();
      return json(res, history[history.length - 1] ?? { message: 'No feedback snapshots yet. POST /feedback/run to generate.' });
    }

    if (url === '/feedback/history' && req.method === 'GET') {
      return json(res, { snapshots: eng.getFeedbackHistory() });
    }

    if (url === '/feedback/run' && req.method === 'POST') {
      const snapshot = eng.runMonthlyFeedback();
      return json(res, snapshot, 201);
    }

    if (url === '/club-intelligence' && req.method === 'GET') {
      return json(res, eng.computeClubIntelligenceScore());
    }

    if (url === '/club-profile' && req.method === 'GET') {
      const stored = eng.getStoredProfile();
      if (!stored) return json(res, { message: 'No profile yet. POST /club-profile/build' }, 404);
      return json(res, stored);
    }

    if (url === '/club-profile/build' && req.method === 'POST') {
      const b = await body(req);
      const profile = eng.buildClubProfile(b.clubName ?? 'Club');
      return json(res, profile, 201);
    }

    if (url === '/improvement-plan' && req.method === 'GET') {
      return json(res, eng.generateImprovementPlan());
    }

    if (url === '/status' && req.method === 'GET') {
      const summary   = eng.getOutcomeSummary();
      const calSummary = eng.getCalibrationSummary();
      const cis       = eng.computeClubIntelligenceScore();
      const latest    = eng.getFeedbackHistory();
      return json(res, {
        engine:              'learning-engine',
        port:                3006,
        outcomesRecorded:    summary.total,
        overallAccuracy:     summary.overallAccuracy,
        calibrationMaturity: calSummary.calibrationMaturity,
        avgConfidence:       calSummary.averageConfidence,
        cisScore:            cis.score,
        cisGrade:            cis.grade,
        feedbackMonths:      latest.length,
        ts:                  new Date().toISOString(),
      });
    }

    json(res, { error: 'Not found' }, 404);
  } catch (e) {
    err(res, e.message);
  }
});

const PORT = 3006;
server.listen(PORT, () => console.log(`Learning Engine API → http://localhost:${PORT}`));
