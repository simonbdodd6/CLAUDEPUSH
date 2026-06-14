import { createHash } from 'crypto';
import {
  CONTEXT_MISSING,
  CONTEXT_RISK,
  EVIDENCE_SOURCE,
  INSIGHT_AUDIT_ACTIONS,
  INSIGHT_SEVERITY,
  INSIGHT_SEVERITY_RANK,
  INSIGHT_STATUS,
  INSIGHT_THRESHOLDS,
  INSIGHT_TYPE,
  RULE_ID,
} from './constants.js';
import { configurationError, notFoundError, validationError } from './errors.js';

const EXACT_LOCATION_FIELDS = [
  'coordinates', 'coordinate', 'lat', 'lng', 'latitude', 'longitude',
  'exactLocation', 'liveLocation', 'travellerLocation', 'currentLocation', 'gps', 'geo',
];

function round2(value) {
  return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function assertNoLocationDeep(value) {
  if (Array.isArray(value)) { value.forEach(assertNoLocationDeep); return; }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (EXACT_LOCATION_FIELDS.includes(key)) {
        throw validationError(`Insight output must not include exact location field: ${key}`, { field: key });
      }
      assertNoLocationDeep(nested);
    }
  }
}

function assertContextSnapshot(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw validationError('contextSnapshot must be an object');
  }
  if (!context.traveller || typeof context.traveller.travellerId !== 'string') {
    throw validationError('contextSnapshot.traveller.travellerId is required');
  }
  if (typeof context.contextVersion !== 'string') {
    throw validationError('contextSnapshot.contextVersion is required');
  }
  return context;
}

function riskPresent(context, code) {
  return (context.riskSignals ?? []).some(s => s.code === code);
}

function missingPresent(context, code) {
  return (context.missingInformation ?? []).includes(code);
}

function evidenceFor(context, sources) {
  return (context.availableEvidence ?? [])
    .filter(e => sources.includes(e.source))
    .map(e => ({ ...e }));
}

function lc(value) {
  return String(value ?? '').trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Deterministic rules. Each returns an insight draft or null. A rule NEVER
// invents a fact — it fires only when its supporting signal exists in context.
// ---------------------------------------------------------------------------
const RULES = [
  function emergencyContact(ctx) {
    if (!missingPresent(ctx, CONTEXT_MISSING.EMERGENCY_CONTACT)) return null;
    return {
      ruleId: RULE_ID.EMERGENCY_CONTACT,
      insightType: INSIGHT_TYPE.SAFETY_GAP,
      severity: INSIGHT_SEVERITY.MEDIUM,
      confidence: 0.5,
      title: 'Emergency contact status unknown',
      summary: 'No emergency contact information is available to the platform. This is a placeholder — it cannot be confirmed present or absent from current data.',
      evidenceSources: [EVIDENCE_SOURCE.IDENTITY],
      missingSignals: [CONTEXT_MISSING.EMERGENCY_CONTACT],
    };
  },
  function passport(ctx) {
    if (!missingPresent(ctx, CONTEXT_MISSING.PASSPORT)) return null;
    return {
      ruleId: RULE_ID.PASSPORT,
      insightType: INSIGHT_TYPE.MISSING_INFORMATION,
      severity: INSIGHT_SEVERITY.LOW,
      confidence: 0.5,
      title: 'Passport information not available',
      summary: 'No passport information is available to the platform. This is a placeholder — no source currently provides it.',
      evidenceSources: [EVIDENCE_SOURCE.IDENTITY],
      missingSignals: [CONTEXT_MISSING.PASSPORT],
    };
  },
  function missingPreferences(ctx) {
    if (!riskPresent(ctx, CONTEXT_RISK.MISSING_PREFERENCES)) return null;
    return {
      ruleId: RULE_ID.MISSING_PREFERENCES,
      insightType: INSIGHT_TYPE.MISSING_INFORMATION,
      severity: INSIGHT_SEVERITY.LOW,
      confidence: 0.7,
      title: 'No traveller preferences on record',
      summary: 'The preferences platform has no profile for this traveller; preference-based insights are unavailable.',
      evidenceSources: [EVIDENCE_SOURCE.PREFERENCE],
      riskSignals: [CONTEXT_RISK.MISSING_PREFERENCES],
    };
  },
  function missingAccommodation(ctx) {
    if (!riskPresent(ctx, CONTEXT_RISK.NO_ACCOMMODATION)) return null;
    return {
      ruleId: RULE_ID.MISSING_ACCOMMODATION,
      insightType: INSIGHT_TYPE.PLANNING_GAP,
      severity: INSIGHT_SEVERITY.MEDIUM,
      confidence: 0.7,
      title: 'No accommodation linked',
      summary: 'No accommodation is linked in the relationship graph for this traveller based on available data.',
      evidenceSources: [EVIDENCE_SOURCE.RELATIONSHIP],
      riskSignals: [CONTEXT_RISK.NO_ACCOMMODATION],
    };
  },
  function missingItinerary(ctx) {
    if (!riskPresent(ctx, CONTEXT_RISK.NO_ITINERARY)) return null;
    return {
      ruleId: RULE_ID.MISSING_ITINERARY,
      insightType: INSIGHT_TYPE.PLANNING_GAP,
      severity: INSIGHT_SEVERITY.MEDIUM,
      confidence: 0.7,
      title: 'No itinerary activity',
      summary: 'No itinerary activity appears on the timeline based on available data.',
      evidenceSources: [EVIDENCE_SOURCE.TIMELINE],
      riskSignals: [CONTEXT_RISK.NO_ITINERARY],
    };
  },
  function sparseHistory(ctx) {
    if (!riskPresent(ctx, CONTEXT_RISK.SPARSE_TRAVEL_HISTORY)) return null;
    const total = ctx.travelHistory?.totalEvents ?? 0;
    return {
      ruleId: RULE_ID.SPARSE_HISTORY,
      insightType: INSIGHT_TYPE.CONTEXT_QUALITY,
      severity: INSIGHT_SEVERITY.LOW,
      confidence: total === 0 ? 0.9 : 0.6,
      title: 'Sparse travel history',
      summary: `Only ${total} timeline event(s) are on record for this traveller.`,
      evidenceSources: [EVIDENCE_SOURCE.TIMELINE],
      riskSignals: [CONTEXT_RISK.SPARSE_TRAVEL_HISTORY],
    };
  },
  function noCompanions(ctx) {
    if (!riskPresent(ctx, CONTEXT_RISK.NO_TRAVEL_COMPANIONS)) return null;
    const optedIn = ctx.companions?.discovery?.optedIn === true;
    return {
      ruleId: RULE_ID.NO_COMPANIONS,
      insightType: INSIGHT_TYPE.COMPANION_OPPORTUNITY,
      severity: INSIGHT_SEVERITY.LOW,
      confidence: optedIn ? 0.7 : 0.5,
      title: 'No connected travel companions',
      summary: `No connected travel companions on record.${optedIn ? ' The traveller has an opted-in discovery profile.' : ''}`,
      evidenceSources: [EVIDENCE_SOURCE.RELATIONSHIP, EVIDENCE_SOURCE.DISCOVERY],
      riskSignals: [CONTEXT_RISK.NO_TRAVEL_COMPANIONS],
    };
  },
  function lowEvidenceCoverage(ctx) {
    const cs = ctx.confidenceSignals;
    if (!cs) return null;
    if (cs.overall !== 'low' && cs.dataCompleteness >= INSIGHT_THRESHOLDS.LOW_COVERAGE) return null;
    const presentSources = (ctx.availableEvidence ?? []).filter(e => e.available).map(e => e.source);
    return {
      ruleId: RULE_ID.LOW_EVIDENCE_COVERAGE,
      insightType: INSIGHT_TYPE.CONTEXT_QUALITY,
      severity: INSIGHT_SEVERITY.MEDIUM,
      confidence: round2(clamp(1 - cs.dataCompleteness, 0.5, 0.95)),
      title: 'Low evidence coverage',
      summary: `Overall context data completeness is ${cs.dataCompleteness}; insights are limited by available evidence.`,
      evidenceSources: [...new Set(presentSources)],
    };
  },
  function conflictingPreferenceMemory(ctx) {
    const prefs = ctx.travelPreferences;
    const memory = ctx.travelMemory ?? [];
    if (!prefs || memory.length === 0) return null;
    const avoided = new Set([...(prefs.avoidedActivities ?? []), ...(prefs.avoidedDestinations ?? [])].map(lc));
    const favourite = new Set([...(prefs.favouriteActivities ?? []), ...(prefs.favouriteDestinations ?? [])].map(lc));
    const conflicts = [];
    for (const m of memory) {
      const value = lc(m.value);
      if (m.polarity === 'positive' && avoided.has(value)) conflicts.push({ value: m.value, kind: 'positive_memory_vs_avoided' });
      if (m.polarity === 'negative' && favourite.has(value)) conflicts.push({ value: m.value, kind: 'negative_memory_vs_favourite' });
    }
    if (conflicts.length === 0) return null;
    return {
      ruleId: RULE_ID.CONFLICTING_PREFERENCE_MEMORY,
      insightType: INSIGHT_TYPE.PREFERENCE_PATTERN,
      severity: INSIGHT_SEVERITY.MEDIUM,
      confidence: round2(clamp(0.5 + 0.1 * conflicts.length, 0.5, 0.95)),
      title: 'Conflicting preference and memory signals',
      summary: `${conflicts.length} conflict(s) between stated preferences and learned memory: ${conflicts.map(c => `${c.value} (${c.kind})`).join(', ')}.`,
      evidenceSources: [EVIDENCE_SOURCE.MEMORY, EVIDENCE_SOURCE.PREFERENCE],
    };
  },
  function strongDestinationPattern(ctx) {
    const visited = ctx.visitedDestinations ?? [];
    if (visited.length < INSIGHT_THRESHOLDS.STRONG_DESTINATION_COUNT) return null;
    return {
      ruleId: RULE_ID.STRONG_DESTINATION_PATTERN,
      insightType: INSIGHT_TYPE.DESTINATION_PATTERN,
      severity: visited.length >= 5 ? INSIGHT_SEVERITY.MEDIUM : INSIGHT_SEVERITY.LOW,
      confidence: round2(clamp(0.4 + 0.1 * visited.length, 0.4, 0.95)),
      title: 'Frequent destination activity',
      summary: `${visited.length} visited destinations are on record for this traveller.`,
      evidenceSources: [EVIDENCE_SOURCE.RELATIONSHIP],
    };
  },
  function strongCompanionOpportunity(ctx) {
    const disc = ctx.companions?.discovery;
    if (!disc || disc.optedIn !== true) return null;
    const looking = (disc.statuses ?? []).filter(s => String(s).startsWith('looking_for_'));
    if (looking.length === 0) return null;
    return {
      ruleId: RULE_ID.STRONG_COMPANION_OPPORTUNITY,
      insightType: INSIGHT_TYPE.COMPANION_OPPORTUNITY,
      severity: INSIGHT_SEVERITY.LOW,
      confidence: 0.6,
      title: 'Active companion intent',
      summary: `Traveller is opted in to discovery and currently: ${looking.sort().join(', ')}.`,
      evidenceSources: [EVIDENCE_SOURCE.DISCOVERY],
    };
  },
  function strongMemoryPattern(ctx) {
    const memory = ctx.travelMemory ?? [];
    const positives = memory.filter(m => m.polarity === 'positive' && Number(m.confidence) >= INSIGHT_THRESHOLDS.HIGH_CONFIDENCE_MEMORY);
    if (positives.length < INSIGHT_THRESHOLDS.STRONG_MEMORY_COUNT) return null;
    return {
      ruleId: RULE_ID.STRONG_MEMORY_PATTERN,
      insightType: INSIGHT_TYPE.MEMORY_PATTERN,
      severity: INSIGHT_SEVERITY.LOW,
      confidence: round2(clamp(0.4 + 0.1 * positives.length, 0.4, 0.95)),
      title: 'Strong positive memory pattern',
      summary: `${positives.length} high-confidence positive travel memories are on record.`,
      evidenceSources: [EVIDENCE_SOURCE.MEMORY],
    };
  },
  function relationshipHub(ctx) {
    const important = ctx.travelRelationships?.importantEntities ?? [];
    const top = important[0];
    if (!top || (top.connectionCount ?? 0) < INSIGHT_THRESHOLDS.STRONG_CONNECTION_COUNT) return null;
    return {
      ruleId: RULE_ID.RELATIONSHIP_HUB,
      insightType: INSIGHT_TYPE.RELATIONSHIP_PATTERN,
      severity: INSIGHT_SEVERITY.LOW,
      confidence: round2(clamp(0.4 + 0.05 * top.connectionCount, 0.4, 0.95)),
      title: 'Highly connected entity',
      summary: `Entity ${top.entity.type}:${top.entity.id} has ${top.connectionCount} relationships in this traveller's graph.`,
      evidenceSources: [EVIDENCE_SOURCE.RELATIONSHIP],
    };
  },
  function dominantTimeline(ctx) {
    const dist = ctx.travelPatterns?.eventTypeDistribution ?? {};
    const total = ctx.travelHistory?.totalEvents ?? 0;
    if (total < INSIGHT_THRESHOLDS.MIN_EVENTS_FOR_TIMELINE_PATTERN) return null;
    const entries = Object.entries(dist).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (entries.length === 0) return null;
    const [topType, topCount] = entries[0];
    const ratio = topCount / total;
    if (ratio < INSIGHT_THRESHOLDS.DOMINANT_EVENT_RATIO) return null;
    return {
      ruleId: RULE_ID.DOMINANT_TIMELINE,
      insightType: INSIGHT_TYPE.TIMELINE_PATTERN,
      severity: INSIGHT_SEVERITY.LOW,
      confidence: round2(clamp(ratio, 0.5, 0.95)),
      title: 'Dominant timeline activity',
      summary: `${topType} accounts for ${Math.round(ratio * 100)}% of this traveller's timeline events.`,
      evidenceSources: [EVIDENCE_SOURCE.TIMELINE],
    };
  },
];

function defaultSort(a, b) {
  return (INSIGHT_SEVERITY_RANK[b.severity] ?? 0) - (INSIGHT_SEVERITY_RANK[a.severity] ?? 0)
    || b.confidence - a.confidence
    || a.insightType.localeCompare(b.insightType)
    || a.insightId.localeCompare(b.insightId);
}

export function createTravelInsightEngine(options = {}) {
  const travelIntelligenceContext = options.travelIntelligenceContext;
  if (!travelIntelligenceContext || typeof travelIntelligenceContext.buildContextSnapshot !== 'function') {
    throw configurationError('createTravelInsightEngine requires a travelIntelligenceContext with buildContextSnapshot()');
  }

  function buildInsight(context, draft) {
    const travellerId = context.traveller.travellerId;
    const sourceContextVersion = context.contextVersion;
    // Deterministic id — identical context + rule always yields the same id.
    const seed = `${travellerId}:${sourceContextVersion}:${draft.ruleId}:${draft.dedupKey ?? ''}`;
    const insightId = `insight_${createHash('sha256').update(seed).digest('hex').slice(0, 16)}`;
    return {
      insightId,
      travellerIdentityId: travellerId,
      insightType: draft.insightType,
      severity: draft.severity,
      confidence: draft.confidence,
      title: draft.title,
      summary: draft.summary,
      evidenceRefs: evidenceFor(context, draft.evidenceSources ?? []),
      riskSignals: draft.riskSignals ?? [],
      missingSignals: draft.missingSignals ?? [],
      sourceContextVersion,
      createdFrom: {
        schemaVersion: context.schemaVersion ?? null,
        contextVersion: sourceContextVersion,
        generatedAt: context.generatedAt ?? null,
      },
      status: INSIGHT_STATUS.ACTIVE,
      audit: [{ action: INSIGHT_AUDIT_ACTIONS.GENERATED, rule: draft.ruleId }],
    };
  }

  /**
   * Run the deterministic rule set over a context snapshot and return insights
   * in stable order. Pure: the same snapshot always yields the same insights.
   */
  function generateInsightsFromContext(contextSnapshot, viewOptions = {}) {
    const context = assertContextSnapshot(contextSnapshot);
    const insights = [];
    for (const rule of RULES) {
      const draft = rule(context);
      if (!draft) continue;
      insights.push(buildInsight(context, draft));
    }
    insights.sort(defaultSort);
    const result = viewOptions.filters ? filterInsights(insights, viewOptions.filters) : insights;
    assertNoLocationDeep(result);
    return result;
  }

  async function generateTravellerInsights(travellerIdentityId, viewOptions = {}) {
    const context = await travelIntelligenceContext.buildContextSnapshot(travellerIdentityId, viewOptions.contextOptions ?? {});
    return generateInsightsFromContext(context, viewOptions);
  }

  function rankInsights(insights, rankOptions = {}) {
    const list = [...(insights ?? [])];
    if (rankOptions.by === 'confidence') {
      list.sort((a, b) => b.confidence - a.confidence
        || (INSIGHT_SEVERITY_RANK[b.severity] ?? 0) - (INSIGHT_SEVERITY_RANK[a.severity] ?? 0)
        || a.insightId.localeCompare(b.insightId));
      return list;
    }
    list.sort(defaultSort);
    return list;
  }

  function filterInsights(insights, filters = {}) {
    let list = [...(insights ?? [])];
    if (filters.insightType) list = list.filter(i => i.insightType === filters.insightType);
    if (Array.isArray(filters.insightTypes)) list = list.filter(i => filters.insightTypes.includes(i.insightType));
    if (filters.status) list = list.filter(i => i.status === filters.status);
    if (filters.minConfidence != null) list = list.filter(i => i.confidence >= filters.minConfidence);
    if (filters.minSeverity) {
      const min = INSIGHT_SEVERITY_RANK[filters.minSeverity] ?? 0;
      list = list.filter(i => (INSIGHT_SEVERITY_RANK[i.severity] ?? 0) >= min);
    }
    return list;
  }

  function explainInsight(insightOrId, explainOptions = {}) {
    let insight = insightOrId;
    if (typeof insightOrId === 'string') {
      insight = (explainOptions.insights ?? []).find(i => i.insightId === insightOrId);
      if (!insight) throw notFoundError(insightOrId);
    }
    if (!insight || typeof insight !== 'object' || !insight.insightId) {
      throw validationError('explainInsight requires an insight object or an id resolvable via options.insights');
    }
    const sources = [...new Set((insight.evidenceRefs ?? []).map(e => e.source))].sort();
    const reasoning = `This ${insight.insightType} insight (severity ${insight.severity}, confidence ${insight.confidence}) `
      + `was derived deterministically from evidence sources: ${sources.length ? sources.join(', ') : 'none'}. `
      + `Related risk signals: ${insight.riskSignals?.length ? insight.riskSignals.join(', ') : 'none'}. `
      + `Related missing signals: ${insight.missingSignals?.length ? insight.missingSignals.join(', ') : 'none'}. `
      + `Generated from context ${insight.sourceContextVersion}.`;
    return {
      insightId: insight.insightId,
      insightType: insight.insightType,
      severity: insight.severity,
      confidence: insight.confidence,
      title: insight.title,
      summary: insight.summary,
      reasoning,
      evidenceRefs: (insight.evidenceRefs ?? []).map(e => ({ ...e })),
      riskSignals: insight.riskSignals ?? [],
      missingSignals: insight.missingSignals ?? [],
      sourceContextVersion: insight.sourceContextVersion,
    };
  }

  return {
    generateTravellerInsights,
    generateInsightsFromContext,
    explainInsight,
    rankInsights,
    filterInsights,
  };
}
