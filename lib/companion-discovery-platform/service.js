import { randomUUID } from 'crypto';
import {
  DEFAULT_DISCOVERY_LIMIT,
  DISCOVERY_AUDIT_ACTIONS,
  DISCOVERY_SCORE_CAPS,
  DISCOVERY_SCORE_WEIGHTS,
  DISCOVERY_STATUS,
  DISCOVERY_STATUSES,
  DISCOVERY_VISIBILITY,
  DISCOVERY_VISIBILITIES,
} from './constants.js';
import { InMemoryCompanionDiscoveryRepository } from './repository.js';
import { forbiddenError, notFoundError, validationError } from './errors.js';

const EXACT_LOCATION_FIELDS = [
  'coordinates',
  'coordinate',
  'lat',
  'lng',
  'latitude',
  'longitude',
  'exactLocation',
  'liveLocation',
  'travellerLocation',
  'currentLocation',
  'gps',
  'geo',
];

// Decimal coordinate pair, e.g. "-8.65, 115.13" — rejected from any free-text
// area field so exact GPS can never be smuggled in as a string.
const COORDINATE_PATTERN = /-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/;

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, precision = 4) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function assertNoExactLocation(input = {}, label = 'discovery input') {
  if (input == null || typeof input !== 'object') return input;
  const present = EXACT_LOCATION_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(input, field));
  if (present.length) {
    throw validationError(`${label} must not include exact traveller location`, { fields: present });
  }
  return input;
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw validationError(`${field} is required`, { field });
  }
  return value.trim();
}

function assertAreaLabel(value, field) {
  const area = assertNonEmptyString(value, field);
  if (COORDINATE_PATTERN.test(area)) {
    throw validationError(`${field} must be an approximate area label, not coordinates`, { field });
  }
  return area;
}

function normalizeString(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeTags(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw validationError('expected an array of strings', { value });
  return [...new Set(value.map(normalizeString).filter(Boolean))];
}

function assertStatuses(value) {
  const statuses = normalizeTags(value);
  const invalid = statuses.filter(status => !DISCOVERY_STATUSES.includes(status));
  if (invalid.length) {
    throw validationError(`status must be one of: ${DISCOVERY_STATUSES.join(', ')}`, { invalid });
  }
  return statuses;
}

function assertVisibility(value) {
  if (!DISCOVERY_VISIBILITIES.includes(value)) {
    throw validationError(`visibility must be one of: ${DISCOVERY_VISIBILITIES.join(', ')}`, { visibility: value });
  }
  return value;
}

function intersection(a = [], b = []) {
  const set = new Set(b);
  return a.filter(item => set.has(item));
}

function dateOverlapDays(start1, end1, start2, end2) {
  if (!start1 || !end1 || !start2 || !end2) return 0;
  const s1 = new Date(start1).getTime();
  const e1 = new Date(end1).getTime();
  const s2 = new Date(start2).getTime();
  const e2 = new Date(end2).getTime();
  if ([s1, e1, s2, e2].some(Number.isNaN)) return 0;
  const start = Math.max(s1, s2);
  const end = Math.min(e1, e2);
  if (end < start) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

// Sum of every positive weight at its cap — the denominator for normalising the
// raw compatibility score into a 0..1 band.
const SCORE_REFERENCE = DISCOVERY_SCORE_WEIGHTS.SHARED_DESTINATION
  + DISCOVERY_SCORE_WEIGHTS.SHARED_AREA
  + DISCOVERY_SCORE_WEIGHTS.SHARED_ACTIVITY * DISCOVERY_SCORE_CAPS.SHARED_ACTIVITY
  + DISCOVERY_SCORE_WEIGHTS.SHARED_DATES
  + DISCOVERY_SCORE_WEIGHTS.SHARED_TRAVEL_STYLE * DISCOVERY_SCORE_CAPS.SHARED_TRAVEL_STYLE
  + DISCOVERY_SCORE_WEIGHTS.POSITIVE_MEMORY_AFFINITY * DISCOVERY_SCORE_CAPS.POSITIVE_MEMORY_AFFINITY
  + DISCOVERY_SCORE_WEIGHTS.SHARED_STATUS * DISCOVERY_SCORE_CAPS.SHARED_STATUS
  + DISCOVERY_SCORE_WEIGHTS.AVAILABLE_TODAY_BOOST;

/**
 * Deterministic compatibility scoring between a seeker profile and a candidate
 * profile. Pure function of overlapping, privacy-safe attributes — no exact
 * location is read or returned.
 */
function scoreCandidate(seeker, candidate) {
  let raw = 0;
  const factors = [];
  const add = (factor, contribution, detail) => {
    raw += contribution;
    factors.push({ factor, contribution: round(contribution, 2), detail });
  };

  const sharedDestination = Boolean(seeker.destinationId)
    && seeker.destinationId === candidate.destinationId;
  if (sharedDestination) {
    add('shared_destination', DISCOVERY_SCORE_WEIGHTS.SHARED_DESTINATION, { destinationId: candidate.destinationId });
  }

  const sharedArea = Boolean(seeker.approximateArea)
    && normalizeString(seeker.approximateArea) === normalizeString(candidate.approximateArea);
  if (sharedArea) {
    add('shared_area', DISCOVERY_SCORE_WEIGHTS.SHARED_AREA, { approximateArea: candidate.approximateArea });
  }

  const sharedActivities = intersection(seeker.activityInterests, candidate.activityInterests);
  if (sharedActivities.length) {
    add('shared_activities',
      DISCOVERY_SCORE_WEIGHTS.SHARED_ACTIVITY * Math.min(sharedActivities.length, DISCOVERY_SCORE_CAPS.SHARED_ACTIVITY),
      { shared: sharedActivities });
  }

  const overlapDays = dateOverlapDays(
    seeker.travelStartDate, seeker.travelEndDate,
    candidate.travelStartDate, candidate.travelEndDate,
  );
  if (overlapDays > 0) {
    add('shared_dates', DISCOVERY_SCORE_WEIGHTS.SHARED_DATES, { overlapDays });
  }

  const sharedStyles = intersection(seeker.travelStyles, candidate.travelStyles);
  if (sharedStyles.length) {
    add('shared_travel_style',
      DISCOVERY_SCORE_WEIGHTS.SHARED_TRAVEL_STYLE * Math.min(sharedStyles.length, DISCOVERY_SCORE_CAPS.SHARED_TRAVEL_STYLE),
      { shared: sharedStyles });
  }

  const sharedMemory = intersection(seeker.positiveMemoryTags, candidate.positiveMemoryTags);
  if (sharedMemory.length) {
    add('memory_affinity',
      DISCOVERY_SCORE_WEIGHTS.POSITIVE_MEMORY_AFFINITY * Math.min(sharedMemory.length, DISCOVERY_SCORE_CAPS.POSITIVE_MEMORY_AFFINITY),
      { shared: sharedMemory });
  }

  const conflicts = [
    ...intersection(seeker.positiveMemoryTags, candidate.negativeMemoryTags),
    ...intersection(seeker.negativeMemoryTags, candidate.positiveMemoryTags),
  ];
  if (conflicts.length) {
    add('memory_conflict', -DISCOVERY_SCORE_WEIGHTS.MEMORY_CONFLICT_PENALTY * conflicts.length, { conflicts });
  }

  const sharedStatuses = intersection(seeker.statuses, candidate.statuses)
    .filter(status => status !== DISCOVERY_STATUS.AVAILABLE_TODAY);
  if (sharedStatuses.length) {
    add('shared_status',
      DISCOVERY_SCORE_WEIGHTS.SHARED_STATUS * Math.min(sharedStatuses.length, DISCOVERY_SCORE_CAPS.SHARED_STATUS),
      { shared: sharedStatuses });
  }

  if (candidate.statuses.includes(DISCOVERY_STATUS.AVAILABLE_TODAY)) {
    add('available_today', DISCOVERY_SCORE_WEIGHTS.AVAILABLE_TODAY_BOOST, {});
  }

  // Confidence reflects how many comparison dimensions both travellers supplied
  // data for — not a learned probability.
  const dimensions = [
    Boolean(seeker.destinationId && candidate.destinationId),
    Boolean(seeker.approximateArea && candidate.approximateArea),
    Boolean(seeker.activityInterests.length && candidate.activityInterests.length),
    Boolean(seeker.travelStartDate && candidate.travelStartDate),
    Boolean(seeker.travelStyles.length && candidate.travelStyles.length),
    Boolean(seeker.positiveMemoryTags.length && candidate.positiveMemoryTags.length),
    Boolean(seeker.statuses.length && candidate.statuses.length),
  ];
  const filled = dimensions.filter(Boolean).length;

  return {
    raw: round(raw, 2),
    compatibility: round(clamp(raw / SCORE_REFERENCE, 0, 1)),
    confidence: round(filled / dimensions.length),
    sharedDestination,
    sharedArea,
    sharedActivities,
    overlapDays,
    sharedStatuses,
    conflicts,
    factors,
  };
}

function buildExplanation(candidate, scored) {
  const reasons = [];
  if (scored.sharedDestination) reasons.push(`you share the destination (${candidate.destinationId})`);
  if (scored.sharedArea) reasons.push(`you are both around ${candidate.approximateArea}`);
  if (scored.sharedActivities.length) reasons.push(`you share ${scored.sharedActivities.length} activity interest(s): ${scored.sharedActivities.join(', ')}`);
  if (scored.overlapDays > 0) reasons.push(`your travel dates overlap by ${scored.overlapDays} day(s)`);
  if (scored.sharedStatuses.length) reasons.push(`you are both ${scored.sharedStatuses.join(', ')}`);
  if (candidate.statuses.includes(DISCOVERY_STATUS.AVAILABLE_TODAY)) reasons.push('they are available today');
  const base = reasons.length
    ? `Recommended because ${reasons.join('; ')}.`
    : 'Recommended on a partial deterministic match.';
  return scored.conflicts.length
    ? `${base} Note: ${scored.conflicts.length} preference conflict(s) reduced the score.`
    : base;
}

export function createCompanionDiscoveryPlatform(options = {}) {
  const repository = options.repository ?? new InMemoryCompanionDiscoveryRepository();

  async function audit(action, profile, details = {}) {
    return repository.appendAudit({
      action,
      profileId: profile.profileId,
      travellerIdentityId: profile.travellerIdentityId,
      details,
    });
  }

  async function loadProfile(profileId) {
    const profile = await repository.getProfile(profileId);
    if (!profile) throw notFoundError(profileId);
    return profile;
  }

  async function commit(profile, action, details = {}) {
    profile.updatedAt = now();
    await repository.saveProfile(profile);
    await audit(action, profile, details);
    return clone(profile);
  }

  /**
   * Derive privacy-safe discovery fields from immutable Traveller Preferences
   * and Travel Memory snapshots. Reads plain snapshot objects; imports and
   * mutates nothing upstream. No exact location is ever carried over.
   */
  function deriveProfileFieldsFromSnapshots(input = {}) {
    const preferences = input.preferences ?? {};
    const memories = Array.isArray(input.memories) ? input.memories : [];
    assertNoExactLocation(preferences, 'preferences snapshot');
    memories.forEach(memory => assertNoExactLocation(memory, 'memory snapshot'));

    const activityInterests = normalizeTags([
      ...(preferences.activities ?? []),
      ...(preferences.favouriteActivities ?? []),
    ]);
    const travelStyles = normalizeTags(preferences.travelStyles ?? preferences.styles ?? []);
    const positiveMemoryTags = normalizeTags(memories
      .filter(memory => memory.polarity === 'positive')
      .map(memory => `${memory.key}:${memory.value}`));
    const negativeMemoryTags = normalizeTags(memories
      .filter(memory => memory.polarity === 'negative')
      .map(memory => `${memory.key}:${memory.value}`));

    return { activityInterests, travelStyles, positiveMemoryTags, negativeMemoryTags };
  }

  async function createProfile(input = {}) {
    assertNoExactLocation(input, 'createProfile input');
    const travellerIdentityId = assertNonEmptyString(input.travellerIdentityId, 'travellerIdentityId');

    const existing = await repository.getProfileByTraveller(travellerIdentityId);
    if (existing) {
      throw validationError('a discovery profile already exists for this traveller', { travellerIdentityId });
    }

    const createdAt = now();
    const profile = {
      profileId: `discovery_${randomUUID()}`,
      travellerIdentityId,
      optedIn: input.optedIn === true,
      visibility: input.visibility ? assertVisibility(input.visibility) : DISCOVERY_VISIBILITY.EVERYONE,
      approximateArea: input.approximateArea != null ? assertAreaLabel(input.approximateArea, 'approximateArea') : null,
      destinationId: input.destinationId ?? null,
      country: input.country ?? null,
      region: input.region ?? null,
      travelStartDate: input.travelStartDate ?? null,
      travelEndDate: input.travelEndDate ?? null,
      activityInterests: normalizeTags(input.activityInterests),
      travelStyles: normalizeTags(input.travelStyles),
      positiveMemoryTags: normalizeTags(input.positiveMemoryTags),
      negativeMemoryTags: normalizeTags(input.negativeMemoryTags),
      statuses: assertStatuses(input.statuses),
      blockedTravellerIds: normalizeTags(input.blockedTravellerIds),
      deterministic: true,
      aiUsed: false,
      createdAt,
      updatedAt: createdAt,
    };

    await repository.saveProfile(profile);
    await audit(DISCOVERY_AUDIT_ACTIONS.PROFILE_CREATED, profile, { optedIn: profile.optedIn });
    return clone(profile);
  }

  async function updateProfile(input = {}) {
    const profile = await loadProfile(assertNonEmptyString(input.profileId, 'profileId'));
    const changes = input.changes ?? {};
    assertNoExactLocation(changes, 'changes');

    if ('approximateArea' in changes) {
      profile.approximateArea = changes.approximateArea == null
        ? null
        : assertAreaLabel(changes.approximateArea, 'approximateArea');
    }
    if ('destinationId' in changes) profile.destinationId = changes.destinationId ?? null;
    if ('country' in changes) profile.country = changes.country ?? null;
    if ('region' in changes) profile.region = changes.region ?? null;
    if ('travelStartDate' in changes) profile.travelStartDate = changes.travelStartDate ?? null;
    if ('travelEndDate' in changes) profile.travelEndDate = changes.travelEndDate ?? null;
    if ('activityInterests' in changes) profile.activityInterests = normalizeTags(changes.activityInterests);
    if ('travelStyles' in changes) profile.travelStyles = normalizeTags(changes.travelStyles);
    if ('positiveMemoryTags' in changes) profile.positiveMemoryTags = normalizeTags(changes.positiveMemoryTags);
    if ('negativeMemoryTags' in changes) profile.negativeMemoryTags = normalizeTags(changes.negativeMemoryTags);

    return commit(profile, DISCOVERY_AUDIT_ACTIONS.PROFILE_UPDATED, { fields: Object.keys(changes) });
  }

  async function optIn(profileId) {
    const profile = await loadProfile(assertNonEmptyString(profileId, 'profileId'));
    if (profile.optedIn) return clone(profile);
    profile.optedIn = true;
    return commit(profile, DISCOVERY_AUDIT_ACTIONS.OPTED_IN);
  }

  async function optOut(profileId) {
    const profile = await loadProfile(assertNonEmptyString(profileId, 'profileId'));
    if (!profile.optedIn) return clone(profile);
    profile.optedIn = false;
    return commit(profile, DISCOVERY_AUDIT_ACTIONS.OPTED_OUT);
  }

  async function setStatuses(input = {}) {
    const profile = await loadProfile(assertNonEmptyString(input.profileId, 'profileId'));
    profile.statuses = assertStatuses(input.statuses);
    return commit(profile, DISCOVERY_AUDIT_ACTIONS.STATUS_SET, { statuses: profile.statuses });
  }

  async function setVisibility(input = {}) {
    const profile = await loadProfile(assertNonEmptyString(input.profileId, 'profileId'));
    profile.visibility = assertVisibility(input.visibility);
    return commit(profile, DISCOVERY_AUDIT_ACTIONS.VISIBILITY_CHANGED, { visibility: profile.visibility });
  }

  async function blockTraveller(input = {}) {
    const profile = await loadProfile(assertNonEmptyString(input.profileId, 'profileId'));
    const blocked = assertNonEmptyString(input.blockedTravellerIdentityId, 'blockedTravellerIdentityId');
    if (!profile.blockedTravellerIds.includes(blocked)) profile.blockedTravellerIds.push(blocked);
    return commit(profile, DISCOVERY_AUDIT_ACTIONS.TRAVELLER_BLOCKED, { blocked });
  }

  async function unblockTraveller(input = {}) {
    const profile = await loadProfile(assertNonEmptyString(input.profileId, 'profileId'));
    const blocked = assertNonEmptyString(input.blockedTravellerIdentityId, 'blockedTravellerIdentityId');
    profile.blockedTravellerIds = profile.blockedTravellerIds.filter(id => id !== blocked);
    return commit(profile, DISCOVERY_AUDIT_ACTIONS.TRAVELLER_UNBLOCKED, { blocked });
  }

  async function getProfile(profileId) {
    return clone(await loadProfile(profileId));
  }

  async function getProfileByTraveller(travellerIdentityId) {
    return repository.getProfileByTraveller(assertNonEmptyString(travellerIdentityId, 'travellerIdentityId'));
  }

  // Visibility gate: can the seeker discover this candidate at all?
  function passesVisibility(seeker, candidate) {
    switch (candidate.visibility) {
      case DISCOVERY_VISIBILITY.HIDDEN:
        return false;
      case DISCOVERY_VISIBILITY.SAME_DESTINATION:
        return Boolean(candidate.destinationId) && candidate.destinationId === seeker.destinationId;
      case DISCOVERY_VISIBILITY.SAME_AREA:
        return Boolean(candidate.approximateArea)
          && normalizeString(candidate.approximateArea) === normalizeString(seeker.approximateArea);
      case DISCOVERY_VISIBILITY.EVERYONE:
      default:
        return true;
    }
  }

  function isBlockedEitherWay(seeker, candidate) {
    return seeker.blockedTravellerIds.includes(candidate.travellerIdentityId)
      || candidate.blockedTravellerIds.includes(seeker.travellerIdentityId);
  }

  /**
   * Discover compatible travellers for a seeker. Enforces opt-in, visibility,
   * and bidirectional blocking before any scoring. Returns only privacy-safe
   * fields — never an exact location.
   */
  async function discoverCompanions(input = {}) {
    const seeker = await loadProfile(assertNonEmptyString(input.seekerProfileId, 'seekerProfileId'));
    if (!seeker.optedIn) {
      throw forbiddenError('seeker must be opted in to discover companions', { profileId: seeker.profileId });
    }

    const limit = Number.isInteger(input.limit) && input.limit > 0 ? input.limit : DEFAULT_DISCOVERY_LIMIT;
    const requireStatus = input.requireStatus ? normalizeString(input.requireStatus) : null;
    const onlySharedDestination = input.onlySharedDestination === true;

    const all = await repository.listProfiles();
    const results = [];

    for (const candidate of all) {
      if (candidate.travellerIdentityId === seeker.travellerIdentityId) continue;
      if (!candidate.optedIn) continue; // opt-out is absolute
      if (isBlockedEitherWay(seeker, candidate)) continue; // blocked never appear
      if (!passesVisibility(seeker, candidate)) continue;
      if (requireStatus && !candidate.statuses.includes(requireStatus)) continue;
      if (onlySharedDestination && (!candidate.destinationId || candidate.destinationId !== seeker.destinationId)) continue;

      const scored = scoreCandidate(seeker, candidate);
      if (scored.raw <= 0) continue;

      results.push({
        profileId: candidate.profileId,
        travellerIdentityId: candidate.travellerIdentityId,
        approximateArea: candidate.approximateArea, // broad label only
        destinationId: candidate.destinationId,
        country: candidate.country,
        region: candidate.region,
        statuses: clone(candidate.statuses),
        score: scored.raw,
        compatibility: scored.compatibility,
        confidence: scored.confidence,
        sharedDestination: scored.sharedDestination,
        sharedArea: scored.sharedArea,
        sharedActivities: scored.sharedActivities,
        sharedDates: scored.overlapDays > 0 ? { overlapDays: scored.overlapDays } : null,
        sharedStatuses: scored.sharedStatuses,
        explanation: buildExplanation(candidate, scored),
        sourceFactors: scored.factors,
      });
    }

    results.sort((a, b) => b.score - a.score
      || b.compatibility - a.compatibility
      || String(a.travellerIdentityId).localeCompare(String(b.travellerIdentityId)));

    const limited = results.slice(0, limit);
    await audit(DISCOVERY_AUDIT_ACTIONS.DISCOVERY_RUN, seeker, {
      candidatesConsidered: all.length - 1,
      matches: limited.length,
    });
    return limited;
  }

  async function getAuditEvents(filter = {}) {
    return repository.listAuditEvents(filter);
  }

  return {
    repository,
    deriveProfileFieldsFromSnapshots,
    createProfile,
    updateProfile,
    optIn,
    optOut,
    setStatuses,
    setVisibility,
    blockTraveller,
    unblockTraveller,
    getProfile,
    getProfileByTraveller,
    discoverCompanions,
    getAuditEvents,
  };
}
