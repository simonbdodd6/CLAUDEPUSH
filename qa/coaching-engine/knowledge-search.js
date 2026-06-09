/**
 * Rugby knowledge base adapter for the coaching engine.
 * Wraps qa/rugby-assistant/query.js for use inside engine context building.
 * Returns formatted context items suitable for prompt injection.
 */

import { retrieveRelevant } from '../rugby-assistant/query.js';

/**
 * Search the knowledge base using context from a player or team profile.
 * Builds a targeted query from position, goals, season phase, and age group.
 */
export function searchForPlayer(playerProfile, opts = {}) {
  const { position, goals = [], ageGroup, seasonPhase, positionGroup } = playerProfile;
  const limit = opts.limit ?? 6;

  const queryTerms = [
    positionGroup?.replace('-', ' '),
    ...goals.slice(0, 3),
    seasonPhase,
  ].filter(Boolean);

  const query = queryTerms.join(' ');

  const result = retrieveRelevant(query, {
    limit,
    ageGroup: ageGroup?.toLowerCase(),
    filterPractical: opts.practicalOnly ?? false,
  });

  return formatKBItems(result.items, result);
}

/**
 * Search the knowledge base for a team session context.
 */
export function searchForTeam(teamProfile, focusTopic = '', opts = {}) {
  const { ageGroup, keyFocusAreas = [], seasonPhase } = teamProfile;
  const limit = opts.limit ?? 5;

  const queryTerms = [
    focusTopic,
    ...keyFocusAreas.slice(0, 2),
    seasonPhase,
    'drill',
  ].filter(Boolean);

  const query = queryTerms.join(' ');

  const result = retrieveRelevant(query, {
    limit,
    ageGroup: ageGroup?.toLowerCase(),
    filterPractical: true,
  });

  return formatKBItems(result.items, result);
}

/**
 * Search the knowledge base for injury/rehab context.
 */
export function searchForRehab(injuryDescription = '', playerProfile = {}, opts = {}) {
  const query = `${injuryDescription} rehabilitation return to play ${playerProfile.position ?? ''}`;

  const result = retrieveRelevant(query, {
    limit:          opts.limit ?? 5,
    filterPractical: false,
  });

  return formatKBItems(result.items, result);
}

/**
 * Direct keyword search — used by prompt builder to add law or safety context.
 */
export function searchByKeyword(query, opts = {}) {
  const result = retrieveRelevant(query, {
    limit: opts.limit ?? 4,
    filterLaw:       opts.filterLaw       ?? false,
    filterPractical: opts.filterPractical ?? false,
  });
  return formatKBItems(result.items, result);
}

function formatKBItems(items, meta = {}) {
  const formatted = items.map(item => ({
    title:      item.title,
    summary:    item.summary,
    takeaway:   item.takeaway,
    categories: item.categories,
    ageGroup:   item.ageGroup,
    isLaw:      item.isLawUpdate,
    isSafety:   item.isSafetyAlert,
    isPractical: item.isPractical,
    confidence: item.confidence,
    source:     item.source,
  }));

  return {
    items:     formatted,
    itemCount: formatted.length,
    totalInKB: meta.knowledgeBaseSize ?? 0,
    hasKBData: formatted.length > 0,
  };
}
