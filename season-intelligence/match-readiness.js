// season-intelligence/match-readiness.js
//
// MATCH READINESS PACK — read-only match preparation intelligence.
//
// Consumes a Coach Experience snapshot (same shape as weekly-brief.js) plus
// match-specific Core state fields (formationNames, medicalNotes, etc.) passed
// as opts. Produces a complete, evidence-backed Match Readiness Pack.
//
// Design contract:
//  • DETERMINISTIC. Same input → same pack. Evidence-backed, never invented.
//  • READ-ONLY. No mutations, no fetches, no Core imports.
//  • REMOVABLE. Entire module is additive; deleting it reverts Core to baseline.
//  • SAFE DEGRADATION. Invalid/null input → typed unavailable model, never throws.
//  • NEVER A DEPENDENCY. Core is fully functional if this module fails to load.

import { normalizeExperience } from './coach-experience.js';

export const MATCH_READINESS_VERSION = '1.0.0';

// Standard rugby XV positions keyed by shirt number.
const RUGBY_POSITIONS = {
  '1': 'Loosehead Prop',  '2': 'Hooker',          '3': 'Tighthead Prop',
  '4': 'Lock',             '5': 'Lock',             '6': 'Blindside Flanker',
  '7': 'Openside Flanker', '8': 'No. 8',            '9': 'Scrum-half',
  '10': 'Fly-half',        '11': 'Left Wing',       '12': 'Inside Centre',
  '13': 'Outside Centre',  '14': 'Right Wing',      '15': 'Fullback',
};

const STARTING_SLOTS = Object.keys(RUGBY_POSITIONS); // ['1'..'15']

/**
 * Generate a Match Readiness Pack from a Coach Experience snapshot and Core
 * match-specific opts.
 *
 * @param {object} experience  - normalizeExperience-compatible snapshot
 * @param {object} opts
 * @param {boolean}  [opts.enabled=true]          - feature gate (false → unavailable model)
 * @param {string}   [opts.now]                   - ISO timestamp for generatedAt
 * @param {object}   [opts.formationNames={}]     - { '1': 'Alex', '9': 'Sam', … }
 * @param {string[]} [opts.benchPlayers=[]]       - bench player name strings
 * @param {object[]} [opts.availabilityRequests=[]]- Core availability request records
 * @param {object}   [opts.matchCentre={}]        - Core matchCentre state slice
 * @param {object[]} [opts.messages=[]]           - Core messages array
 * @param {object}   [opts.medicalNotes={}]       - { [playerId]: { condition, returnTarget, … } }
 * @param {object[]} [opts.fixtures=[]]           - Core fixtures array
 * @returns {object} Match Readiness Pack model
 */
export function generateMatchReadinessPack(experience, opts = {}) {
  const {
    enabled           = true,
    now               = null,
    formationNames    = {},
    benchPlayers      = [],
    availabilityRequests = [],
    matchCentre       = {},
    messages          = [],
    medicalNotes      = {},
    fixtures          = [],
  } = opts || {};

  if (!enabled) {
    return { version: MATCH_READINESS_VERSION, available: false, reason: 'intelligence_disabled' };
  }

  let exp;
  try { exp = normalizeExperience(experience || {}); }
  catch { exp = normalizeExperience({}); }

  const mc = (matchCentre && typeof matchCentre === 'object' && !Array.isArray(matchCentre))
    ? matchCentre : {};
  const fn = (formationNames && typeof formationNames === 'object' && !Array.isArray(formationNames))
    ? formationNames : {};
  const mNotes = (medicalNotes && typeof medicalNotes === 'object' && !Array.isArray(medicalNotes))
    ? medicalNotes : {};

  // ── Squad selection ──────────────────────────────────────────────────────────
  const filledSlots = STARTING_SLOTS.filter(s => fn[s] && String(fn[s]).trim());
  const emptySlots  = STARTING_SLOTS.filter(s => !fn[s] || !String(fn[s]).trim());
  const benchFilled = Array.isArray(benchPlayers)
    ? benchPlayers.filter(n => String(n || '').trim()).length
    : 0;

  // ── Match-day availability (from experience.availability['game']) ─────────────
  const MATCH_ID = 'game';
  const responses    = exp.availability?.[MATCH_ID] || [];
  const availCount   = responses.filter(r => r.response === 'available').length;
  const unavailCount = responses.filter(r => r.response === 'unavailable' && r.reason !== 'injury').length;
  const injuredCount = responses.filter(r => r.reason === 'injury').length;
  const repliedCount = responses.filter(r => r.response && r.response !== 'no-reply').length;
  const noReplyCount = Math.max(0, exp.roster.length - repliedCount) +
    responses.filter(r => !r.response || r.response === 'no-reply').length;

  // ── Medical clearances ────────────────────────────────────────────────────────
  // Injured players (reason === 'injury' in availability) who lack a return target
  const injuredRoster = exp.roster.filter(p => {
    const resp = responses.find(r => r.key === p.id);
    return resp?.reason === 'injury';
  });
  const clearanceMissing = injuredRoster.filter(p => {
    const note = mNotes[p.id];
    return !note?.returnTarget;
  });

  // ── Checklist ────────────────────────────────────────────────────────────────
  const availSentForGame = Array.isArray(availabilityRequests) &&
    availabilityRequests.some(r => r.sessionId === MATCH_ID || r.sessionId === 'game');
  const trainingPublished = exp.sessions.some(s =>
    String(s.type || '').toLowerCase() === 'training' && s.published
  );
  const squadSelected  = filledSlots.length >= 15;
  const squadPublished = Boolean(mc.published);
  const medComplete    = clearanceMissing.length === 0;
  const messagesSent   = Array.isArray(messages) && messages.some(m => m.from === 'Coach');

  const checklist = [
    { id: 'avail',     label: 'Availability requested',    done: availSentForGame,  section: 'message'  },
    { id: 'training',  label: 'Training published',         done: trainingPublished, section: 'training' },
    { id: 'selected',  label: 'Squad selected (XV)',         done: squadSelected,     section: 'matchday' },
    { id: 'published', label: 'Squad published',             done: squadPublished,    section: 'matchday' },
    { id: 'medical',   label: 'Medical clearances complete', done: medComplete,       section: 'medical'  },
    { id: 'messages',  label: 'Match messages sent',         done: messagesSent,      section: 'messages' },
  ];

  // ── Risks — evidence-backed only, no speculation ─────────────────────────────
  const risks = [];

  // Risk: incomplete front row (scrums cannot form)
  const frontRowGaps = ['1', '2', '3'].filter(s => !fn[s] || !String(fn[s]).trim());
  if (frontRowGaps.length > 0 && mc.opposition) {
    risks.push({
      severity: 'high',
      title: `${frontRowGaps.length === 1 ? '1 front row position' : frontRowGaps.length + ' front row positions'} not selected`,
      detail: frontRowGaps.map(s => RUGBY_POSITIONS[s]).join(', ') + ' missing — scrums cannot form.',
      evidence: { ref: 'squad.formationNames', label: 'Front row', value: `${3 - frontRowGaps.length}/3 filled` },
    });
  }

  // Risk: medical clearances pending
  if (clearanceMissing.length > 0) {
    const names = clearanceMissing.slice(0, 2).map(p => p.name || p.id).join(', ') +
      (clearanceMissing.length > 2 ? ` +${clearanceMissing.length - 2}` : '');
    risks.push({
      severity: 'high',
      title: `${clearanceMissing.length} medical clearance${clearanceMissing.length !== 1 ? 's' : ''} pending`,
      detail: `${names} — return date not set.`,
      evidence: { ref: 'medicalNotes', label: 'Clearances missing', value: String(clearanceMissing.length) },
    });
  }

  // Risk: high no-reply rate
  if (noReplyCount >= 5) {
    risks.push({
      severity: noReplyCount >= 7 ? 'high' : 'medium',
      title: `${noReplyCount} player${noReplyCount !== 1 ? 's' : ''} yet to respond`,
      detail: 'Availability picture is incomplete for match day.',
      evidence: { ref: `availability.${MATCH_ID}`, label: 'No reply', value: `${noReplyCount} players` },
    });
  }

  // Risk: selection incomplete when fixture confirmed
  if (filledSlots.length < 15 && mc.opposition) {
    risks.push({
      severity: filledSlots.length < 10 ? 'high' : 'medium',
      title: `Only ${filledSlots.length}/15 starters selected`,
      detail: `${emptySlots.length} position${emptySlots.length !== 1 ? 's' : ''} still empty.`,
      evidence: { ref: 'squad.formationNames', label: 'Selection', value: `${filledSlots.length}/15` },
    });
  }

  // Risk: no training published pre-match
  if (!trainingPublished && mc.opposition) {
    risks.push({
      severity: 'medium',
      title: 'No training session published',
      detail: 'Players have no published preparation plan this week.',
      evidence: { ref: 'sessions.published', label: 'Published sessions', value: '0' },
    });
  }

  // ── Recommended actions (top 3 unfulfilled checklist items) ──────────────────
  const actions = checklist
    .filter(c => !c.done)
    .slice(0, 3)
    .map(c => ({ title: c.label, section: c.section, label: 'Fix now →' }));

  // ── Confidence — evidence-backed formula ──────────────────────────────────────
  const checksDone      = checklist.filter(c => c.done).length;
  const selectionRatio  = filledSlots.length / 15;
  const rawConf         = (checksDone / checklist.length) * 0.6 + selectionRatio * 0.4;
  const confidence      = Math.min(1, Math.max(0, Math.round(rawConf * 100) / 100));

  // ── Fixture ───────────────────────────────────────────────────────────────────
  const safeFx = Array.isArray(fixtures) ? fixtures.find(f => f.opposition && f.date) : null;
  const fixture = {
    opposition:  mc.opposition  || safeFx?.opposition || null,
    kickoffDate: mc.kickoffDate || safeFx?.date       || null,
    kickoffTime: mc.kickoffTime || '15:00',
    venue:       mc.venue       || safeFx?.venue      || null,
    competition: mc.competition || null,
    referee:     mc.referee     || null,
    weather:     mc.weather     || null,
  };

  return {
    version:     MATCH_READINESS_VERSION,
    available:   true,
    generatedAt: now || new Date().toISOString(),
    fixture,
    squad: {
      filled:           filledSlots.length,
      bench:            benchFilled,
      total:            filledSlots.length + benchFilled,
      missingSlots:     emptySlots.map(s => ({ slot: s, label: RUGBY_POSITIONS[s] || `Position ${s}` })),
      available:        availCount,
      unavailable:      unavailCount,
      injured:          injuredCount,
      noReply:          noReplyCount,
      clearanceMissing: clearanceMissing.map(p => p.name || p.id),
    },
    checklist,
    risks:      risks.slice(0, 5),
    actions,
    confidence,
    hasFixture: Boolean(fixture.opposition),
  };
}
