// season-intelligence/weekly-brief.js
//
// AI WEEKLY BRIEF — the first production coach-facing Intelligence feature.
//
// Consumes ONLY a Coach Experience snapshot (see coach-experience.js, which
// reads only published Core APIs). Produces one presentation-ready model,
// shaped exactly as the future dashboard screen will consume it.
//
// Design contract (why this is safe to depend on weekly):
//   • DETERMINISTIC. Same snapshot → same brief (bar the timestamp). The
//     numbers a coach sees — attendance, availability, load — are computed,
//     never generated, so they cannot hallucinate.
//   • EVIDENCE-BACKED. Every claim carries an evidence reference pointing at
//     the snapshot field that produced it.
//   • HONEST CONFIDENCE. The confidence score reflects how complete the input
//     was, not how fluent the prose is.
//   • NEVER A DEPENDENCY. No network, no LLM, no Core import. If Intelligence
//     is disabled the function returns a typed "unavailable" model and the
//     dashboard renders its off-state. Core is unaffected either way.
//
// LLM enrichment seam: opts.narrator (optional) may rephrase headline/summary
// strings. It is called inside a try/catch and its absence/failure degrades to
// the deterministic strings. The Brief is fully functional with no narrator —
// that is the point.

import { normalizeExperience } from './coach-experience.js';

export const WEEKLY_BRIEF_VERSION = '1.0.0';

// Subscription tiers gate DEPTH, never correctness. A free tier sees a true,
// smaller brief; paid tiers see more priorities, risks and recommended actions.
const TIER_LIMITS = {
  free:  { priorities: 1, risks: 1, actions: 0, predictive: false },
  pro:   { priorities: 3, risks: 3, actions: 4, predictive: true },
  elite: { priorities: 3, risks: 5, actions: 6, predictive: true },
};

const AVAILABLE = 'available';
const STARTING_XV = 15;

function tierLimits(tier) { return TIER_LIMITS[tier] || TIER_LIMITS.pro; }

function ref(refId, label, value) { return { ref: refId, label, value }; }

// ── Slice computations (pure) ─────────────────────────────────────────────────

function matchSessionId(exp) {
  // Core's match session id is 'game'; fall back to any Match-typed session.
  if (exp.availability.game) return 'game';
  const m = exp.sessions.find(s => String(s.type).toLowerCase() === 'match');
  return m ? m.id : 'game';
}

function tallyResponses(responses = []) {
  const t = { available: 0, maybe: 0, unavailable: 0, 'no-reply': 0, injury: 0, total: 0 };
  for (const r of responses) {
    const resp = String(r?.response || 'no-reply');
    t.total += 1;
    if (resp in t) t[resp] += 1; else t['no-reply'] += 1;
    if (String(r?.reason || '') === 'injury') t.injury += 1;
  }
  return t;
}

function attendanceSummary(exp) {
  const perSession = exp.sessions
    .filter(s => String(s.type).toLowerCase() === 'training')
    .map(s => {
      const t = tallyResponses(exp.availability[s.id]);
      return { sessionId: s.id, title: s.title || s.id, ...t,
        responseRate: t.total ? Math.round(((t.total - t['no-reply']) / t.total) * 100) : 0 };
    });
  const agg = perSession.reduce((a, s) => {
    ['available', 'maybe', 'unavailable', 'no-reply', 'total'].forEach(k => { a[k] += s[k]; });
    return a;
  }, { available: 0, maybe: 0, unavailable: 0, 'no-reply': 0, total: 0 });
  const responded = agg.total - agg['no-reply'];
  return {
    sessionsTracked: perSession.length,
    responded,
    responseRate: agg.total ? Math.round((responded / agg.total) * 100) : 0,
    available: agg.available,
    perSession,
    evidence: ref('availability.training', 'Training availability responses', `${responded}/${agg.total} replied`),
  };
}

function trainingLoadSummary(exp) {
  const training = exp.sessions.filter(s => String(s.type).toLowerCase() === 'training');
  const published = training.filter(s => s.published);
  const hasMatch = exp.sessions.some(s => String(s.type).toLowerCase() === 'match') ||
    Boolean(exp.squad?.kickoffDate);
  // A simple, explainable load index: trainings planned this week, weighted by
  // whether a match caps the week. Not a physiological model — an honesty-first
  // planning signal.
  const sessionsThisWeek = training.length + (hasMatch ? 1 : 0);
  const band = sessionsThisWeek >= 3 ? 'high' : sessionsThisWeek === 2 ? 'moderate' : sessionsThisWeek === 1 ? 'light' : 'none';
  return {
    trainingSessions: training.length,
    published: published.length,
    unpublished: training.length - published.length,
    matchScheduled: hasMatch,
    sessionsThisWeek,
    loadBand: band,
    evidence: ref('sessions', 'Published session schedule', `${training.length} training, match ${hasMatch ? 'scheduled' : 'none'}`),
  };
}

function availabilitySummary(exp) {
  const gameId = matchSessionId(exp);
  const t = tallyResponses(exp.availability[gameId]);
  const rosterSize = exp.roster.length;
  const shortfall = Math.max(0, STARTING_XV - t.available);
  return {
    forSession: gameId,
    rosterSize,
    available: t.available,
    maybe: t.maybe,
    unavailable: t.unavailable,
    noReply: t['no-reply'],
    injured: t.injury,
    shortfallToXV: shortfall,
    canFieldXV: t.available >= STARTING_XV,
    evidence: ref(`availability.${gameId}`, 'Match availability', `${t.available} available, ${t['no-reply']} no reply, ${t.injury} injured`),
  };
}

function squadStatus(exp) {
  const fn = exp.squad?.formationNames || {};
  const picked = Object.values(fn).filter(n => String(n || '').trim()).length;
  return { published: Boolean(exp.squad?.published), picked, complete: picked >= STARTING_XV };
}

function nextFixture(exp) {
  const fx = (exp.fixtures || []).filter(f => f?.opposition && f?.date).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  const sq = exp.squad;
  if (fx) return { opposition: fx.opposition, date: fx.date, venue: fx.venue || '', time: fx.time || '', source: 'fixtures' };
  if (sq?.opposition || sq?.kickoffDate) return { opposition: sq.opposition || 'TBC', date: sq.kickoffDate || '', venue: sq.venue || '', time: sq.kickoffTime || '', source: 'squad' };
  return null;
}

// ── Risks & priorities (pure, ranked) ─────────────────────────────────────────

function computeRisks(exp, avail, load, squad) {
  const risks = [];
  if (squad && nextFixture(exp)) {
    if (avail.shortfallToXV > 0) {
      risks.push({ severity: 'high', score: 90, title: `Only ${avail.available} available for the match`,
        detail: `${avail.shortfallToXV} short of a starting XV`,
        evidence: avail.evidence });
    }
    if (avail.injured >= 2) {
      risks.push({ severity: 'high', score: 80, title: `${avail.injured} players carrying injuries`,
        detail: 'Confirm fitness before selection', evidence: avail.evidence });
    }
    if (!squad.published) {
      risks.push({ severity: 'medium', score: 60, title: 'Squad not published',
        detail: 'Players have not been told the team', evidence: ref('squad.published', 'Squad publish state', 'draft') });
    }
  }
  if (avail.noReply >= Math.max(3, Math.ceil(avail.rosterSize * 0.3))) {
    risks.push({ severity: 'medium', score: 55, title: `${avail.noReply} players have not replied`,
      detail: 'Availability picture is incomplete', evidence: avail.evidence });
  }
  if (load.trainingSessions > 0 && load.unpublished === load.trainingSessions) {
    risks.push({ severity: 'low', score: 35, title: 'No training published this week',
      detail: 'Players have no plan to prepare from', evidence: load.evidence });
  }
  return risks.sort((a, b) => b.score - a.score);
}

function computePriorities(exp, avail, load, squad, fixture) {
  const items = [];
  if (fixture && !squad.published && squad.picked >= STARTING_XV) {
    items.push({ score: 95, title: 'Publish your squad', why: `XV picked for ${fixture.opposition}, not yet sent`,
      action: { section: 'matchday', label: 'Open Match Centre' }, evidence: ref('squad', 'Squad selection', `${squad.picked} picked, draft`) });
  } else if (fixture && squad.picked < STARTING_XV) {
    items.push({ score: 90, title: 'Finish selecting your squad', why: `${squad.picked} of ${STARTING_XV} picked for ${fixture.opposition}`,
      action: { section: 'matchday', label: 'Select squad' }, evidence: ref('squad.formationNames', 'Players selected', `${squad.picked}/${STARTING_XV}`) });
  }
  if (avail.noReply > 0) {
    items.push({ score: 70 + Math.min(20, avail.noReply), title: `Chase ${avail.noReply} non-responder${avail.noReply > 1 ? 's' : ''}`,
      why: 'Availability is incomplete for the week', action: { section: 'message', label: 'Send availability request' }, evidence: avail.evidence });
  }
  if (load.trainingSessions > 0 && load.unpublished > 0) {
    items.push({ score: 50, title: 'Publish this week’s training', why: `${load.unpublished} session${load.unpublished > 1 ? 's' : ''} still in draft`,
      action: { section: 'training', label: 'Open Training' }, evidence: load.evidence });
  }
  if (fixture && (!fixture.venue || !fixture.opposition || fixture.opposition === 'TBC')) {
    items.push({ score: 45, title: 'Complete match details', why: 'Opposition or venue still missing',
      action: { section: 'matchday', label: 'Add match details' }, evidence: ref('fixtures', 'Next fixture', fixture.opposition || 'TBC') });
  }
  return items.sort((a, b) => b.score - a.score);
}

function matchPrepChecklist(exp, avail, squad, fixture) {
  return [
    { id: 'fixture', label: 'Match details set', done: Boolean(fixture && fixture.opposition && fixture.opposition !== 'TBC' && fixture.venue),
      evidence: ref('fixtures', 'Next fixture', fixture ? `${fixture.opposition} ${fixture.date}` : 'none') },
    { id: 'availability', label: 'Availability requested', done: avail.available + avail.maybe + avail.unavailable > 0,
      evidence: ref(`availability.${avail.forSession}`, 'Replies received', `${avail.available + avail.maybe + avail.unavailable}`) },
    { id: 'selected', label: 'Squad selected (XV)', done: squad.complete,
      evidence: ref('squad.formationNames', 'Players picked', `${squad.picked}/${STARTING_XV}`) },
    { id: 'published', label: 'Squad published', done: squad.published,
      evidence: ref('squad.published', 'Publish state', squad.published ? 'published' : 'draft') },
    { id: 'training', label: 'Training published this week', done: exp.sessions.some(s => String(s.type).toLowerCase() === 'training' && s.published),
      evidence: ref('sessions', 'Published trainings', String(exp.sessions.filter(s => s.published).length)) },
  ];
}

// Confidence = how complete the input was. Honest, not flattering.
function computeConfidence(exp) {
  const signals = [
    exp.roster.length > 0,
    exp.sessions.length > 0,
    Object.keys(exp.availability).length > 0,
    Object.values(exp.availability).some(r => Array.isArray(r) && r.length > 0),
    (exp.fixtures.length > 0 || Boolean(exp.squad)),
    Boolean(exp.club?.clubName),
    !exp.meta?.partial,
  ];
  const score = signals.filter(Boolean).length / signals.length;
  return Math.round(score * 100) / 100;
}

/**
 * Generate the Weekly Brief presentation model.
 *
 * @param {object} experience  a normalized Coach Experience snapshot
 * @param {object} [opts]
 * @param {boolean} [opts.enabled=true]   Intelligence feature flag
 * @param {string}  [opts.tier='pro']     subscription tier: free|pro|elite
 * @param {string}  [opts.now]            ISO timestamp (injectable for tests)
 * @param {function}[opts.narrator]       optional async (model)→{headline,summary} LLM enrichment
 * @returns {object} presentation-ready Weekly Brief, OR a typed unavailable model
 */
export function generateWeeklyBrief(experience, opts = {}) {
  const { enabled = true, tier = 'pro', now = null } = opts;
  const generatedAt = now || experience?.asOf || null;

  // Feature flag OFF → typed unavailable model. The dashboard renders its
  // off-state; nothing throws, nothing in Core notices.
  if (enabled === false) {
    return {
      version: WEEKLY_BRIEF_VERSION,
      available: false,
      reason: 'intelligence_disabled',
      tier,
      generatedAt,
    };
  }

  // Always normalize: total, never throws, fills every array/object the slice
  // computations rely on. Malformed or partial input degrades cleanly.
  const exp = normalizeExperience(experience || {});
  const limits = tierLimits(tier);

  const attendance = attendanceSummary(exp);
  const load = trainingLoadSummary(exp);
  const avail = availabilitySummary(exp);
  const squad = squadStatus(exp);
  const fixture = nextFixture(exp);

  const allRisks = computeRisks(exp, avail, load, squad);
  const allPriorities = computePriorities(exp, avail, load, squad, fixture);
  const checklist = matchPrepChecklist(exp, avail, squad, fixture);
  const confidence = computeConfidence(exp);

  // Recommended actions = the priorities expressed as do-this-next items, tier-gated.
  const recommendedActions = allPriorities.slice(0, limits.actions).map(p => ({
    title: p.title, rationale: p.why, action: p.action,
  }));

  const evidence = dedupeEvidence([
    attendance.evidence, load.evidence, avail.evidence,
    ...allPriorities.map(p => p.evidence), ...allRisks.map(r => r.evidence),
  ]);

  const degraded = Boolean(exp.meta?.partial) || confidence < 0.5;
  const headline = buildHeadline(exp, avail, squad, fixture, allPriorities);

  const model = {
    version: WEEKLY_BRIEF_VERSION,
    available: true,
    tier,
    degraded,
    generatedAt,
    team: { name: exp.club?.clubName || exp.team?.name || '', teamName: exp.club?.teamName || exp.team?.teamName || '' },
    headline,
    nextFixture: fixture,
    priorities: allPriorities.slice(0, limits.priorities)
      .map((p, i) => ({ rank: i + 1, title: p.title, why: p.why, action: p.action, evidence: p.evidence })),
    risks: allRisks.slice(0, limits.risks)
      .map(r => ({ severity: r.severity, title: r.title, detail: r.detail, evidence: r.evidence })),
    attendanceSummary: {
      sessionsTracked: attendance.sessionsTracked, responded: attendance.responded,
      responseRate: attendance.responseRate, perSession: attendance.perSession,
    },
    trainingLoadSummary: {
      trainingSessions: load.trainingSessions, published: load.published, unpublished: load.unpublished,
      matchScheduled: load.matchScheduled, loadBand: load.loadBand,
    },
    availabilitySummary: {
      forSession: avail.forSession, rosterSize: avail.rosterSize, available: avail.available,
      maybe: avail.maybe, unavailable: avail.unavailable, noReply: avail.noReply, injured: avail.injured,
      shortfallToXV: avail.shortfallToXV, canFieldXV: avail.canFieldXV,
    },
    matchPrepChecklist: checklist.map(c => ({ id: c.id, label: c.label, done: c.done })),
    recommendedActions,
    confidence,
    evidence,
  };

  // Optional LLM narrative enrichment — never required, never trusted with numbers.
  if (typeof opts.narrator === 'function') {
    try {
      const enrich = opts.narrator(model);
      if (enrich && typeof enrich === 'object' && !enrich.then) {
        if (enrich.headline) model.headline = String(enrich.headline);
        if (enrich.summary) model.summary = String(enrich.summary);
        model.narrated = true;
      }
    } catch { /* deterministic strings stand */ }
  }

  return model;
}

function buildHeadline(exp, avail, squad, fixture, priorities) {
  if (!fixture) return 'No match scheduled — set your next fixture to start match-week planning.';
  if (priorities[0]) return `${priorities[0].title} — ${fixture.opposition}${fixture.date ? ' on ' + fixture.date : ''}.`;
  return `On track for ${fixture.opposition}${fixture.date ? ' on ' + fixture.date : ''} — ${avail.available} available.`;
}

function dedupeEvidence(list) {
  const seen = new Set();
  const out = [];
  for (const e of list) {
    if (!e || !e.ref) continue;
    const k = e.ref + '|' + e.value;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}
