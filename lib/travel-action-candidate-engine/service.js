import { createHash } from 'crypto';
import {
  CANDIDATE_AUDIT_ACTIONS,
  CANDIDATE_PRIORITY,
  CANDIDATE_PRIORITY_RANK,
  CANDIDATE_STATUS,
  CANDIDATE_TITLE,
  CANDIDATE_TYPE,
  CONTEXT_RISK,
  HIGH_IMPACT_CANDIDATE_TYPES,
  INSIGHT_SEVERITY_RANK,
  INSIGHT_TYPE,
} from './constants.js';
import { configurationError, notFoundError, validationError } from './errors.js';

const EXACT_LOCATION_FIELDS = [
  'coordinates', 'coordinate', 'lat', 'lng', 'latitude', 'longitude',
  'exactLocation', 'liveLocation', 'travellerLocation', 'currentLocation', 'gps', 'geo',
];

function assertNoLocationDeep(value) {
  if (Array.isArray(value)) { value.forEach(assertNoLocationDeep); return; }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (EXACT_LOCATION_FIELDS.includes(key)) {
        throw validationError(`Action candidate output must not include exact location field: ${key}`, { field: key });
      }
      assertNoLocationDeep(nested);
    }
  }
}

function assertInsight(insight) {
  if (!insight || typeof insight !== 'object'
    || typeof insight.insightId !== 'string'
    || typeof insight.travellerIdentityId !== 'string'
    || typeof insight.insightType !== 'string'
    || typeof insight.severity !== 'string'
    || typeof insight.sourceContextVersion !== 'string') {
    throw validationError('each insight must be an object with insightId, travellerIdentityId, insightType, severity, sourceContextVersion');
  }
  return insight;
}

function unionSorted(...lists) {
  return [...new Set(lists.flat().filter(v => v != null))].sort();
}

function unionEvidence(...lists) {
  const map = new Map();
  for (const e of lists.flat()) {
    if (!e || typeof e !== 'object') continue;
    map.set(`${e.source}:${e.kind}`, { ...e });
  }
  return [...map.values()].sort((a, b) => String(a.source).localeCompare(String(b.source)) || String(a.kind).localeCompare(String(b.kind)));
}

// Deterministic insight -> candidate-type mapping. Planning gaps are refined by
// the risk code the insight carries.
function candidateTypeFor(insight) {
  switch (insight.insightType) {
    case INSIGHT_TYPE.SAFETY_GAP: return CANDIDATE_TYPE.REVIEW_SAFETY_GAP;
    case INSIGHT_TYPE.MISSING_INFORMATION: return CANDIDATE_TYPE.COMPLETE_MISSING_INFORMATION;
    case INSIGHT_TYPE.COMPANION_OPPORTUNITY: return CANDIDATE_TYPE.REVIEW_COMPANION_OPPORTUNITY;
    case INSIGHT_TYPE.DESTINATION_PATTERN: return CANDIDATE_TYPE.REVIEW_DESTINATION_PATTERN;
    case INSIGHT_TYPE.PREFERENCE_PATTERN: return CANDIDATE_TYPE.REVIEW_PREFERENCE_PATTERN;
    case INSIGHT_TYPE.MEMORY_PATTERN: return CANDIDATE_TYPE.REVIEW_MEMORY_PATTERN;
    case INSIGHT_TYPE.CONTEXT_QUALITY: return CANDIDATE_TYPE.IMPROVE_CONTEXT_QUALITY;
    case INSIGHT_TYPE.PLANNING_GAP: {
      const risks = insight.riskSignals ?? [];
      if (risks.includes(CONTEXT_RISK.NO_ACCOMMODATION)) return CANDIDATE_TYPE.ADD_ACCOMMODATION;
      if (risks.includes(CONTEXT_RISK.NO_ITINERARY)) return CANDIDATE_TYPE.CREATE_ITINERARY;
      return CANDIDATE_TYPE.CUSTOM;
    }
    default: return CANDIDATE_TYPE.CUSTOM; // timeline_pattern, relationship_pattern, custom
  }
}

// A signal that distinguishes candidates of the same type (drives dedupe/cooldown).
function discriminatorFor(insight) {
  return (insight.riskSignals ?? [])[0]
    ?? (insight.missingSignals ?? [])[0]
    ?? insight.insightType;
}

function priorityFor(candidateType, severity) {
  const sev = INSIGHT_SEVERITY_RANK[severity] ?? 1;
  if (candidateType === CANDIDATE_TYPE.REVIEW_SAFETY_GAP) {
    return sev >= INSIGHT_SEVERITY_RANK.high ? CANDIDATE_PRIORITY.CRITICAL : CANDIDATE_PRIORITY.HIGH;
  }
  if (candidateType === CANDIDATE_TYPE.ADD_ACCOMMODATION || candidateType === CANDIDATE_TYPE.CREATE_ITINERARY) {
    return sev >= INSIGHT_SEVERITY_RANK.high ? CANDIDATE_PRIORITY.HIGH : CANDIDATE_PRIORITY.MEDIUM;
  }
  if (sev >= INSIGHT_SEVERITY_RANK.high) return CANDIDATE_PRIORITY.HIGH;
  if (sev === INSIGHT_SEVERITY_RANK.medium) return CANDIDATE_PRIORITY.MEDIUM;
  return CANDIDATE_PRIORITY.LOW;
}

function approvalRequiredFor(candidateType, priority) {
  return HIGH_IMPACT_CANDIDATE_TYPES.includes(candidateType) || priority === CANDIDATE_PRIORITY.CRITICAL;
}

function defaultSort(a, b) {
  return (CANDIDATE_PRIORITY_RANK[b.priority] ?? 0) - (CANDIDATE_PRIORITY_RANK[a.priority] ?? 0)
    || b.confidence - a.confidence
    || a.candidateType.localeCompare(b.candidateType)
    || a.actionCandidateId.localeCompare(b.actionCandidateId);
}

export function createTravelActionCandidateEngine(options = {}) {
  const travelInsightEngine = options.travelInsightEngine;
  if (!travelInsightEngine
    || typeof travelInsightEngine.generateTravellerInsights !== 'function'
    || typeof travelInsightEngine.generateInsightsFromContext !== 'function') {
    throw configurationError('createTravelActionCandidateEngine requires a travelInsightEngine with generateTravellerInsights() and generateInsightsFromContext()');
  }

  function buildCandidate(insight) {
    const candidateType = candidateTypeFor(insight);
    const discriminator = discriminatorFor(insight);
    const priority = priorityFor(candidateType, insight.severity);
    const travellerId = insight.travellerIdentityId;
    const sourceContextVersion = insight.sourceContextVersion;

    const seed = `${travellerId}:${sourceContextVersion}:${candidateType}:${discriminator}:${insight.insightId}`;
    const actionCandidateId = `action_${createHash('sha256').update(seed).digest('hex').slice(0, 16)}`;
    // dedupeKey: collapse same type+discriminator within one generation.
    const dedupeKey = `dedupe:${travellerId}:${candidateType}:${discriminator}`;
    // cooldownKey: cross-time suppression — intentionally excludes contextVersion
    // so the SAME proposal is recognisable across context refreshes.
    const cooldownKey = `cooldown:${travellerId}:${candidateType}:${discriminator}`;

    const title = CANDIDATE_TITLE[candidateType] ?? CANDIDATE_TITLE[CANDIDATE_TYPE.CUSTOM];
    const signalNote = [...(insight.riskSignals ?? []), ...(insight.missingSignals ?? [])];
    return {
      actionCandidateId,
      travellerIdentityId: travellerId,
      candidateType,
      priority,
      confidence: insight.confidence,
      title,
      summary: `Proposed in response to insight "${insight.title}". ${insight.summary}`,
      whyNow: `Triggered by a ${insight.insightType} insight at ${insight.severity} severity`
        + `${signalNote.length ? ` (signals: ${signalNote.join(', ')})` : ''}. This is a non-executing proposal.`,
      sourceInsightIds: [insight.insightId],
      evidenceRefs: (insight.evidenceRefs ?? []).map(e => ({ ...e })),
      riskSignals: insight.riskSignals ?? [],
      missingSignals: insight.missingSignals ?? [],
      approvalRequired: approvalRequiredFor(candidateType, priority),
      cooldownKey,
      dedupeKey,
      status: CANDIDATE_STATUS.PROPOSED, // never approved/executed by this engine
      createdFrom: { contextVersion: sourceContextVersion, fromInsightId: insight.insightId },
      sourceContextVersion,
      audit: [{ action: CANDIDATE_AUDIT_ACTIONS.GENERATED, candidateType, fromInsight: insight.insightId }],
    };
  }

  // Collapse candidates sharing a dedupeKey into one, merging provenance.
  function dedupe(candidates) {
    const groups = new Map();
    for (const candidate of candidates) {
      const existing = groups.get(candidate.dedupeKey);
      if (!existing) { groups.set(candidate.dedupeKey, candidate); continue; }
      // Keep the higher-priority / higher-confidence one; merge provenance.
      const best = defaultSort(existing, candidate) <= 0 ? existing : candidate;
      const other = best === existing ? candidate : existing;
      best.sourceInsightIds = unionSorted(existing.sourceInsightIds, candidate.sourceInsightIds);
      best.evidenceRefs = unionEvidence(existing.evidenceRefs, candidate.evidenceRefs);
      best.riskSignals = unionSorted(existing.riskSignals, candidate.riskSignals);
      best.missingSignals = unionSorted(existing.missingSignals, candidate.missingSignals);
      best.confidence = Math.max(existing.confidence, candidate.confidence);
      best.priority = (CANDIDATE_PRIORITY_RANK[existing.priority] >= CANDIDATE_PRIORITY_RANK[candidate.priority]) ? existing.priority : candidate.priority;
      best.approvalRequired = existing.approvalRequired || candidate.approvalRequired;
      best.audit = [...existing.audit, ...other.audit].sort((a, b) => String(a.fromInsight).localeCompare(String(b.fromInsight)));
      groups.set(candidate.dedupeKey, best);
    }
    return [...groups.values()];
  }

  /**
   * Convert a list of insights into ranked, non-executing action candidates.
   * Pure: the same insights always produce the same candidates in the same order.
   */
  function generateCandidatesFromInsights(insights, viewOptions = {}) {
    if (!Array.isArray(insights)) throw validationError('insights must be an array');
    const candidates = dedupe(insights.map(assertInsight).map(buildCandidate));
    candidates.sort(defaultSort);
    const result = viewOptions.filters ? filterCandidates(candidates, viewOptions.filters) : candidates;
    assertNoLocationDeep(result);
    return result;
  }

  async function generateTravellerActionCandidates(travellerIdentityId, viewOptions = {}) {
    const insights = await travelInsightEngine.generateTravellerInsights(travellerIdentityId, viewOptions.insightOptions ?? {});
    return generateCandidatesFromInsights(insights, viewOptions);
  }

  function rankCandidates(candidates, rankOptions = {}) {
    const list = [...(candidates ?? [])];
    if (rankOptions.by === 'confidence') {
      list.sort((a, b) => b.confidence - a.confidence
        || (CANDIDATE_PRIORITY_RANK[b.priority] ?? 0) - (CANDIDATE_PRIORITY_RANK[a.priority] ?? 0)
        || a.actionCandidateId.localeCompare(b.actionCandidateId));
      return list;
    }
    list.sort(defaultSort);
    return list;
  }

  function filterCandidates(candidates, filters = {}) {
    let list = [...(candidates ?? [])];
    if (filters.candidateType) list = list.filter(c => c.candidateType === filters.candidateType);
    if (Array.isArray(filters.candidateTypes)) list = list.filter(c => filters.candidateTypes.includes(c.candidateType));
    if (filters.status) list = list.filter(c => c.status === filters.status);
    if (typeof filters.approvalRequired === 'boolean') list = list.filter(c => c.approvalRequired === filters.approvalRequired);
    if (filters.minConfidence != null) list = list.filter(c => c.confidence >= filters.minConfidence);
    if (filters.minPriority) {
      const min = CANDIDATE_PRIORITY_RANK[filters.minPriority] ?? 0;
      list = list.filter(c => (CANDIDATE_PRIORITY_RANK[c.priority] ?? 0) >= min);
    }
    return list;
  }

  function explainCandidate(candidateOrId, explainOptions = {}) {
    let candidate = candidateOrId;
    if (typeof candidateOrId === 'string') {
      candidate = (explainOptions.candidates ?? []).find(c => c.actionCandidateId === candidateOrId);
      if (!candidate) throw notFoundError(candidateOrId);
    }
    if (!candidate || typeof candidate !== 'object' || !candidate.actionCandidateId) {
      throw validationError('explainCandidate requires a candidate object or an id resolvable via options.candidates');
    }
    const sources = [...new Set((candidate.evidenceRefs ?? []).map(e => e.source))].sort();
    const reasoning = `Action candidate "${candidate.candidateType}" (priority ${candidate.priority}, confidence ${candidate.confidence}) `
      + `was proposed deterministically from insight(s): ${candidate.sourceInsightIds.join(', ')}. `
      + `Evidence sources: ${sources.length ? sources.join(', ') : 'none'}. `
      + `Approval required: ${candidate.approvalRequired}. This engine proposes only and never executes. `
      + `Generated from context ${candidate.sourceContextVersion}.`;
    return {
      actionCandidateId: candidate.actionCandidateId,
      candidateType: candidate.candidateType,
      priority: candidate.priority,
      confidence: candidate.confidence,
      title: candidate.title,
      summary: candidate.summary,
      whyNow: candidate.whyNow,
      reasoning,
      sourceInsightIds: candidate.sourceInsightIds,
      evidenceRefs: (candidate.evidenceRefs ?? []).map(e => ({ ...e })),
      approvalRequired: candidate.approvalRequired,
      dedupeKey: candidate.dedupeKey,
      cooldownKey: candidate.cooldownKey,
      sourceContextVersion: candidate.sourceContextVersion,
    };
  }

  return {
    generateTravellerActionCandidates,
    generateCandidatesFromInsights,
    rankCandidates,
    filterCandidates,
    explainCandidate,
  };
}
