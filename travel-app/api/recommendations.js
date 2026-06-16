// Travel App — Experience Recommendations Engine (M39).
//
// A deterministic, RULE-BASED layer that suggests which premium experience to
// view next. This is NOT AI, NOT ML and NOT generated reasoning — every
// recommendation comes from fixed rules over existing engine outputs, with fixed
// reason codes, categories, priorities and expiry conditions.
//
// NO generated text, NO networking, NO randomness, NO Date.now. The reference
// date is an explicit argument (the caller passes "today") so the function is
// fully reproducible. Pure; deterministic; offline-first; reuses engines (no
// duplicated intelligence); presentation DTOs only; no platform change; no leak.

import { buildNavigation } from './navigation.js';
import { buildOnThisDay } from './on-this-day.js';
import { buildWorld } from './world.js';
import { buildAchievements } from './achievements.js';
import { buildCollections } from './collections.js';
import { buildStoryComposer } from './story-composer.js';
import { buildCinematic } from './cinematic.js';

export const REASON_CODES = Object.freeze(['ON_THIS_DAY_MATCH', 'NEW_ACHIEVEMENTS', 'STORY_READY', 'RICH_COLLECTIONS', 'WRAPPED_READY', 'CINEMATIC_READY', 'START_HERE']);
export const CATEGORIES = Object.freeze(['timely', 'milestone', 'discovery', 'narrative', 'onboarding']);
export const PRIORITIES = Object.freeze(['high', 'medium', 'low']);
export const EXPIRY_CONDITIONS = Object.freeze(['none', 'daily', 'until-viewed', 'until-new-memory']);
export const REC_VERSION = '1.0.0';

const ref = (type, id) => ({ type, id });

/**
 * Build deterministic experience recommendations.
 * @param {Array} events
 * @param {Array} trips
 * @param {{ referenceDate?: string, current?: string }} [options]
 */
export function buildRecommendations(events, trips = [], options = {}) {
  const referenceDate = options.referenceDate ?? '1970-01-01';
  const current = options.current ?? null;

  const nav = buildNavigation(events, trips, { current });
  const world = buildWorld(events, trips);
  const memories = world.basedOn?.memories ?? 0;

  const nodeById = new Map(nav.graph.nodes.map(n => [n.id, n]));
  const availableById = new Map(nav.graph.nodes.map(n => [n.id, n.available]));

  if (memories === 0) {
    return {
      version: REC_VERSION, referenceDate,
      recommendations: [], top: null, continuation: null,
      emptyState: { title: 'Nothing to recommend yet', subtitle: 'Capture your first memory to unlock recommendations', icon: 'compass', cta: { id: 'capture', label: 'Add a memory', deepLink: 'travelapp://capture' } },
      meta: { count: 0, hasMemories: false }, basedOn: world.basedOn,
    };
  }

  // existing engine outputs (composition only)
  const otd = buildOnThisDay(events, trips, referenceDate);
  const ach = buildAchievements(events, trips);
  const collections = buildCollections(events, trips);
  const story = buildStoryComposer(events, trips);
  const cinematic = buildCinematic(events, trips);

  // "fresh" achievements = earned on/after the most recent trip's start (deterministic)
  const latestTripStart = trips.filter(t => t?.startDate).map(t => String(t.startDate).slice(0, 10)).sort().slice(-1)[0] ?? null;
  const freshAchievements = ach.achievements.filter(a => a.earned && a.earnedDate && (!latestTripStart || a.earnedDate.slice(0, 10) >= latestTripStart));
  const topAchievements = [...ach.achievements].filter(a => a.earned).sort((a, b) => b.rarityScore - a.rarityScore || a.id.localeCompare(b.id));

  // --- candidate rules (fixed) ---------------------------------------------
  const candidates = [];
  const propose = (reasonCode, target, category, priority, score, supportingRefs, expiryCondition) => {
    if (!availableById.get(target)) return;
    candidates.push({ reasonCode, target, category, priority, score, supportingRefs, expiryCondition });
  };

  // 1) On This Day has matches for the reference date → timely, highest
  if (otd.hasMemories && otd.items.length) {
    propose('ON_THIS_DAY_MATCH', 'on-this-day', 'timely', 'high', 100,
      [...(otd.hero ? [ref('moment', otd.hero.id)] : []), ...otd.items.slice(0, 3).map(i => ref('moment', i.id))], 'daily');
  }
  // 2) Fresh achievements → celebrate via Wrapped
  if (freshAchievements.length) {
    propose('NEW_ACHIEVEMENTS', 'wrapped', 'milestone', 'medium', 75,
      freshAchievements.slice(0, 3).map(a => ref('achievement', a.id)), 'until-viewed');
  }
  // 3) Story has enough substance
  if (story.story.momentCount >= 5) {
    propose('STORY_READY', 'story', 'narrative', 'medium', 65,
      [ref('experience', 'story'), ...(story.hero ? [ref('moment', story.hero.id)] : [])], 'until-new-memory');
  }
  // 4) Rich collection set
  if (collections.summary.total >= 3) {
    propose('RICH_COLLECTIONS', 'collections', 'discovery', 'medium', 55,
      collections.collections.slice(0, 3).map(c => ref('collection', c.id)), 'until-new-memory');
  }
  // 5) Enough to warrant a Wrapped
  if (memories >= 5 && trips.length >= 1) {
    propose('WRAPPED_READY', 'wrapped', 'milestone', 'medium', 60,
      [ref('experience', 'wrapped'), ...topAchievements.slice(0, 1).map(a => ref('achievement', a.id))], 'until-new-memory');
  }
  // 6) Cinematic has enough scenes
  if (cinematic.statistics.scenes >= 6) {
    propose('CINEMATIC_READY', 'cinematic', 'narrative', 'low', 40,
      [...(cinematic.heroScene ? [ref('scene', cinematic.heroScene)] : [ref('experience', 'cinematic')])], 'until-new-memory');
  }
  // Continuation is expressed as a top-level pointer (see `continuation` below),
  // not a competing list entry — content-readiness rules own each target.
  // Onboarding for early travellers
  if (memories < 3 && nav.defaultEntry) {
    propose('START_HERE', nav.defaultEntry, 'onboarding', 'high', 90, [ref('experience', nav.defaultEntry)], 'none');
  }

  // --- dedupe by target (keep highest score), then order deterministically --
  const bestByTarget = new Map();
  for (const c of candidates) {
    const cur = bestByTarget.get(c.target);
    if (!cur || c.score > cur.score || (c.score === cur.score && REASON_CODES.indexOf(c.reasonCode) < REASON_CODES.indexOf(cur.reasonCode))) {
      bestByTarget.set(c.target, c);
    }
  }
  const ordered = [...bestByTarget.values()].sort((a, b) => b.score - a.score || REASON_CODES.indexOf(a.reasonCode) - REASON_CODES.indexOf(b.reasonCode) || a.target.localeCompare(b.target));

  const recommendations = ordered.map((c, i) => {
    const node = nodeById.get(c.target);
    return {
      id: `rec-${c.target}`, rank: i,
      reasonCode: c.reasonCode, category: c.category, priority: c.priority, score: c.score,
      sourceExperience: current, targetExperience: c.target,
      title: node?.title ?? c.target, accent: node?.accent ?? 'slate', icon: node?.icon ?? 'sparkles',
      supportingRefs: c.supportingRefs,
      timelineAnchors: node?.timelineAnchor ? [node.timelineAnchor] : [],
      quickActions: node?.quickActions ?? [],
      expiry: { condition: c.expiryCondition, ...(c.expiryCondition === 'daily' ? { date: otd.date } : {}) },
      deepLink: node?.deepLink ?? `travelapp://experience/${c.target}`,
    };
  });

  return {
    version: REC_VERSION, referenceDate,
    recommendations, top: recommendations[0]?.id ?? null,
    continuation: nav.cursor, // { current, next, previous } when ?current= is given, else null
    emptyState: recommendations.length ? null : { title: 'No recommendations right now', subtitle: 'Keep travelling — more will appear', icon: 'compass', cta: null },
    meta: { count: recommendations.length, hasMemories: true },
    basedOn: world.basedOn,
  };
}
