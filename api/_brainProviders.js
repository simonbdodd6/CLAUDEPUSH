// api/_brainProviders.js — Core-owned adapter from live Core data into the Brain's synchronous
// M164/M167 providers, plus the read-only draft orchestration (staging/brain-integration).
//
// This REPLACES the Brain branch's api/_brainProviders.js, which was written against June-era Core:
// it read the global, tenant-less `key('fixtures')`, took every active player in the club with no
// playing-group scoping, called `loadAvailability(sessionId)` against today's
// `(teamId, sessionId)` signature, and served `getCoachMemories: () => []`. Build 116 found all
// four. The Brain's reasoning (packages/, byte-identical copies — see packages/BRAIN_PROVENANCE.json)
// is untouched; only the Core-coupled boundary is Core's code.
//
// Every read is scoped to ONE club and ONE playing group that the CALLER has already authorised
// (api/_brainDraftRoute.js resolves it with assertOperationalGroup — the same rule as a staff
// training publish). Nothing here widens a read:
//
//   coach memories → loadCoachMemoriesForBrain({ teamId, coachId })   (one club+coach key; M3 provider)
//   fixtures       → readClubFixtures(teamId), kept only where fixtureGroupOf(fx) === groupId
//   players        → this club's ACTIVE memberships whose resolvePlayerGroup() is groupId, joined to
//                    their player profile; only { id, userId, displayName, position } leave Core —
//                    never the roster record (phone, email, DOB, guardian contacts)
//   availability   → loadGroupAvailability(teamId, groupId, sessionId) — ONE dated, group-scoped
//                    record (a fixture's availability event id IS its fixture id), resolved per
//                    player with Core's own recency rule (resolveAvailabilityForIdentity)
//
// All loads happen BEFORE the providers are built (the Brain contracts are synchronous). Every
// loader is injectable through `deps`, so the whole module is testable without Redis.
import { loadPlayerProfiles, loadTeamMembers } from './_identityStore.js';
import { loadGroupAvailability, resolveAvailabilityForIdentity } from './_availabilityStore.js';
import { loadClubStructure } from './_structureStore.js';
import { resolvePlayerGroup } from './_accessScope.js';
import { loadCoachMemoriesForBrain } from './_coachMemoryProvider.js';
import { readClubFixtures, fixtureGroupOf } from './publish.js';
import { runBrainDryRun } from '../packages/brain-decision-planner/brain-dry-run-harness.js';
import { normalizePosition } from '../packages/coach-core-adapter/position-normalization.js';
import {
  runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline,
  assessMatchReadiness, assessSquadReadiness, explainPlayerReadiness, summarizeSquadReadiness,
  gateReadinessReport, buildReadinessEvidenceBundle, buildReadinessCoachView,
} from '../packages/coach-intelligence/index.js';

const DEFAULT_INTENT = Object.freeze({ category: 'selection-preference', confidence: 0.7, matchedSignals: [] });

const todayIso = () => new Date().toISOString().slice(0, 10);

const DEFAULT_DEPS = Object.freeze({
  loadPlayerProfiles,
  loadTeamMembers,
  loadClubStructure,
  loadGroupAvailability,
  loadCoachMemoriesForBrain,
  loadFixtures: async (teamId) => (await readClubFixtures(teamId)).fixtures,
  today: todayIso,
  runBrainDryRun,
  engines: { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline },
});

// Core's canonical position label: a jersey number, an em dash, a label — "9 — Scrum-half".
const CANONICAL_POSITION = /^(1[0-5]|[1-9])\s+—\s+\S/;

/**
 * The position string to hand the Brain for one Core position, or null when the Brain cannot place
 * it. LOSSLESS ONLY: a canonical "N — Label" yields just its own jersey number N (the label is never
 * read); anything else passes through unchanged if the Brain's own normaliser already recognises it
 * ("Scrum-half", "Lock", "Flanker"…). Nothing is inferred: "TBC", "Prop", "Front row", "Back row",
 * "Back three", "Outside back" and any other position the Brain cannot place return null — they are
 * never re-mapped to a different position.
 */
export function brainPositionFor(corePosition) {
  const raw = typeof corePosition === 'string' ? corePosition.trim() : '';
  const match = CANONICAL_POSITION.exec(raw);
  const candidate = match ? match[1] : raw;
  return normalizePosition(candidate) === null ? null : candidate;
}

/** The group's active players: memberships of THIS club resolved to THIS group, joined to profiles. */
function groupPlayers({ members, profiles, structure, teamId, groupId }) {
  const inGroup = (Array.isArray(members) ? members : []).filter(m =>
    m && String(m.teamId) === String(teamId) && m.status === 'active' && m.userId
    && resolvePlayerGroup(m, structure).groupId === groupId);
  const profileFor = userId => (Array.isArray(profiles) ? profiles : [])
    .find(p => p && String(p.teamId) === String(teamId) && String(p.userId) === String(userId));
  return inGroup
    .map(m => ({ member: m, profile: profileFor(m.userId) }))
    .filter(x => x.profile)
    .map(({ member, profile }) => ({
      id: profile.id, userId: member.userId, displayName: profile.displayName, position: profile.position,
      legacyPlayerId: profile.legacyPlayerId || '',
    }));
}

/**
 * The next fixture for the group: the earliest non-cancelled fixture dated today or later, by
 * (date, id). The Brain branch's v1 picked the earliest fixture EVER (no clock), which in a live
 * club is a past match; `today` is injected so the choice stays deterministic under test.
 */
function pickNextFixture(fixtures, today) {
  const list = (Array.isArray(fixtures) ? fixtures : [])
    .filter(f => f && f.id && f.status !== 'cancelled' && String(f.date || '').slice(0, 10) >= today);
  if (!list.length) return null;
  const f = list.slice().sort((a, b) => {
    const da = String(a.date || ''); const db = String(b.date || '');
    if (da !== db) return da < db ? -1 : 1;
    return String(a.id) < String(b.id) ? -1 : 1;
  })[0];
  // Core stores the opponent as `opposition`; the Brain's fixture context calls it `opponent`.
  return { fixtureId: f.id, opponent: f.opposition || f.opponent || '', competition: f.competition || '', venue: f.venue || '', date: f.date || '' };
}

/** One answer per player from ONE session record, via Core's recency rule; keyed by userId. */
function availabilityFor(players, sessionId, record) {
  const bySession = { [sessionId]: record && typeof record === 'object' ? record : {} };
  const out = {};
  for (const p of players) {
    const answer = resolveAvailabilityForIdentity(bySession, { userId: p.userId, playerId: p.userId, legacyPlayerId: p.legacyPlayerId })[sessionId];
    if (answer) out[p.userId] = { response: answer.response };
  }
  return out;
}

/**
 * Build the synchronous M164/M167 providers over pre-fetched, group-scoped Core data.
 * `groupId` MUST already be authorised for the caller; `sessionId` is optional (default: the
 * selected fixture's availability event, else the legacy generic card 'game').
 */
export async function buildBrainProviders({ coachId, teamId, groupId, sessionId }, deps = DEFAULT_DEPS) {
  if (!teamId || !coachId || !groupId) {
    const e = new Error('Brain providers need an authorised club, coach and playing group');
    e.status = 400;
    throw e;
  }
  const [profiles, members, structure, fixtures, coachMemories] = await Promise.all([
    deps.loadPlayerProfiles(),
    deps.loadTeamMembers(),
    deps.loadClubStructure(teamId),
    deps.loadFixtures(teamId),
    deps.loadCoachMemoriesForBrain({ teamId, coachId }),
  ]);

  const players = groupPlayers({ members, profiles, structure, teamId, groupId });
  const groupFixtures = (Array.isArray(fixtures) ? fixtures : []).filter(f => fixtureGroupOf(f) === groupId);
  const fixture = pickNextFixture(groupFixtures, deps.today());
  const availabilitySessionId = sessionId || (fixture ? fixture.fixtureId : 'game');
  const record = await deps.loadGroupAvailability(teamId, groupId, availabilitySessionId);
  const availability = availabilityFor(players, availabilitySessionId, record);

  // The Brain's candidate assembly THROWS on a position it cannot place, so one such player would
  // fail the whole draft. Players the Brain can place reach it (canonical labels as their jersey
  // number); the rest are EXCLUDED from the candidate pool and only COUNTED — no ids or names.
  const brainPlayers = [];
  let excludedPlayers = 0;
  for (const { id, userId, displayName, position } of players) {
    const brainPosition = brainPositionFor(position);
    if (brainPosition === null) { excludedPlayers++; continue; }
    brainPlayers.push({ id, userId, displayName, position: brainPosition });
  }
  // Readiness is not candidate assembly: it covers every active player in the group, with their
  // Core position as stored (its grouping is tolerant text matching and never throws).
  const readinessPlayers = players.map(({ userId, position }) => ({ userId, position }));

  const squadLoader = {
    getActivePlayers: () => brainPlayers,
    getAvailabilityResponses: () => availability,
    getCoachMemories: () => coachMemories,   // Core Memory M1–M7 via the M3 provider (owner-stamped)
    getPlayerTags: () => ({}),                // no Core tag store yet ⇒ neutral
  };
  const decisionPlanSource = {
    getFixtureContext: () => ({ fixture, match: DEFAULT_INTENT }),
    getCoachIdentity: () => ({ coachId, clubId: teamId, tags: [] }),
  };
  return {
    squadLoader, decisionPlanSource, fixture, readinessPlayers,
    playerCount: brainPlayers.length, excludedPlayers, memoryCount: coachMemories.length,
    groupId, sessionId: availabilitySessionId,
  };
}

/** Compose the read-only draft response body (the JSON the endpoint returns). */
export async function buildBrainDraft({ coachId, teamId, groupId, sessionId }, deps = DEFAULT_DEPS) {
  const providers = await buildBrainProviders({ coachId, teamId, groupId, sessionId }, deps);
  const meta = {
    readOnly: true,
    preview: true,
    // true when this coach's memories reached the Brain's inputs (the Phase 0 provider never sent any)
    dnaApplied: false,
    intent: DEFAULT_INTENT.category,
    playerCount: providers.playerCount,          // players that reached the Brain as candidates
    excludedPlayers: providers.excludedPlayers,  // active group players the Brain cannot place — a count only
    fixtureId: providers.fixture ? providers.fixture.fixtureId : null,
  };
  const players = providers.readinessPlayers;
  const availability = providers.squadLoader.getAvailabilityResponses();

  if (!providers.fixture) {
    const readiness = assessMatchReadiness({ squad: null, availability });
    const readinessBundle = buildReadinessBundleFor(players, availability, readiness, null);
    const coachView = buildReadinessCoachView(readinessBundle);   // M217
    return { draft: true, squad: null, explanation: null, verification: null, readiness, readinessBundle, coachView, reason: 'no-fixture', meta };
  }
  const result = deps.runBrainDryRun(
    { squadLoader: providers.squadLoader, decisionPlanSource: providers.decisionPlanSource },
    { pipelineServices: deps.engines },
  );
  meta.dnaApplied = Boolean(result.summary && result.summary.memoryCount > 0);
  const readiness = assessMatchReadiness({ squad: result.capstone.squad, explanation: result.explanation, availability });
  const readinessBundle = buildReadinessBundleFor(players, availability, readiness, result.explanation);
  const coachView = buildReadinessCoachView(readinessBundle);     // M217
  return { draft: true, squad: result.capstone.squad, explanation: result.explanation, verification: result.verification, readiness, readinessBundle, coachView, meta };
}

/** The read-only M213 readiness evidence bundle (M208 → M209 → M211 → M212 → M213 + M206). */
function buildReadinessBundleFor(players, availability, matchReadiness, explanation) {
  const records = (Array.isArray(players) ? players : [])
    .filter(p => p && typeof p.userId === 'string' && p.userId)
    .map(p => ({ playerId: p.userId, position: p.position, availability: (availability[p.userId] && typeof availability[p.userId] === 'object') ? availability[p.userId].response : undefined }));

  const squadSummary = assessSquadReadiness(records);                   // M209
  const explanations = records.map(explainPlayerReadiness);             // M208
  const report = summarizeSquadReadiness({ readiness: squadSummary });  // M211
  const envelope = gateReadinessReport(report);                         // M212
  return buildReadinessEvidenceBundle({ readiness: matchReadiness, explanations, squadSummary, report, envelope });  // M213
}
