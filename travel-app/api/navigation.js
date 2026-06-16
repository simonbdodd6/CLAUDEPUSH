// Travel App — Experience Navigation Engine (M38).
//
// One deterministic NAVIGATION MODEL describing how the premium experiences
// connect — a graph (nodes + edges), recommended next/previous, entry points,
// deep-link ids, quick actions and anchors. This is NOT UI, NOT SwiftUI
// navigation and NOT routing — it is a serialisable description a future client
// can navigate by.
//
// NO AI, NO prose, NO randomness, NO Date.now, NO networking. Pure function of
// (events, trips, options); deterministic; offline-first; reuses the experience
// index + design-token identities (no duplicated presentation logic); no
// platform change; no backend leak.

import { listExperiences } from './experience-presentation.js';
import { listExperienceIdentities } from './design-tokens.js';

export const NAV_VERSION = '1.0.0';

// Fixed, curated navigation structure (deterministic — no random ordering).
const RECOMMENDED_SEQUENCE = ['on-this-day', 'wrapped', 'story', 'collections', 'cinematic'];
const ENTRY_PRIORITY = ['on-this-day', 'wrapped', 'story', 'collections', 'cinematic'];
const ENTRY_POINTS = new Set(['on-this-day', 'wrapped', 'story']);
const RELATED = {
  wrapped: ['story', 'collections', 'cinematic'],
  'on-this-day': ['story', 'collections', 'wrapped'],
  collections: ['story', 'cinematic', 'wrapped'],
  story: ['cinematic', 'collections', 'wrapped'],
  cinematic: ['story', 'collections', 'wrapped'],
};
const QUICK_ACTIONS = {
  wrapped: [{ id: 'share', label: 'Share', icon: 'share' }, { id: 'replay', label: 'Replay', icon: 'repeat' }],
  'on-this-day': [{ id: 'view', label: 'View', icon: 'eye' }, { id: 'share', label: 'Share', icon: 'share' }],
  collections: [{ id: 'browse', label: 'Browse', icon: 'grid' }],
  story: [{ id: 'play', label: 'Play', icon: 'play' }, { id: 'scrub', label: 'Scrub', icon: 'timeline' }],
  cinematic: [{ id: 'play', label: 'Play', icon: 'play' }, { id: 'share', label: 'Share', icon: 'share' }],
};
const deepLinkFor = (id) => `travelapp://experience/${id}`;

/**
 * Build the deterministic Experience Navigation model.
 * @param {Array} events
 * @param {Array} trips
 * @param {{ current?: string }} [options]
 */
export function buildNavigation(events, trips = [], options = {}) {
  const index = listExperiences(events, trips);
  const identities = listExperienceIdentities();
  const identityById = new Map(identities.map(i => [i.id, i]));
  const availableById = new Map(index.experiences.map(e => [e.id, e.available]));
  const hasMemories = (index.basedOn?.memories ?? 0) > 0;

  // available experiences in the fixed recommended order
  const availableSeq = RECOMMENDED_SEQUENCE.filter(id => availableById.get(id));
  const seqIndex = new Map(availableSeq.map((id, i) => [id, i]));

  const nodes = identities.map(ident => {
    const id = ident.id;
    const available = !!availableById.get(id);
    const i = seqIndex.has(id) ? seqIndex.get(id) : -1;
    const recommendedNext = i >= 0 ? (availableSeq[i + 1] ?? null) : null;
    const previous = i >= 0 ? (availableSeq[i - 1] ?? null) : null;
    return {
      id, title: ident.title, subtitle: ident.subtitle, icon: ident.icon,
      mood: ident.mood, accent: ident.accent, accentSwatch: ident.accentSwatch,
      deepLink: deepLinkFor(id), available,
      entryPoint: ENTRY_POINTS.has(id),
      related: RELATED[id] ?? [],
      recommendedNext, previous,
      quickActions: QUICK_ACTIONS[id] ?? [],
      timelineAnchor: { experience: id, deepLink: deepLinkFor(id) },
      meta: { sequenceIndex: i, recommendedOrder: RECOMMENDED_SEQUENCE.indexOf(id) },
    };
  });

  // edges from the related adjacency (deterministic, validated)
  const ids = new Set(identities.map(i => i.id));
  const edges = [];
  for (const [from, tos] of Object.entries(RELATED)) {
    if (!ids.has(from)) continue;
    for (const to of tos) if (ids.has(to)) edges.push({ from, to, relation: 'related' });
  }

  // entry points + default entry (first available by entry priority)
  const entryPoints = ENTRY_PRIORITY.filter(id => ENTRY_POINTS.has(id) && availableById.get(id));
  const defaultEntry = ENTRY_PRIORITY.find(id => availableById.get(id)) ?? null;

  // cursor for an optional "current" experience
  let cursor = null;
  if (options.current && ids.has(options.current)) {
    const cur = options.current;
    const i = seqIndex.has(cur) ? seqIndex.get(cur) : -1;
    cursor = {
      current: cur,
      next: i >= 0 ? (availableSeq[i + 1] ?? null) : (availableSeq[0] ?? null),
      previous: i >= 0 ? (availableSeq[i - 1] ?? null) : null,
    };
  }

  // top-level recommended path as ordered anchors
  const timelineAnchors = availableSeq.map((id, order) => ({ order, experience: id, deepLink: deepLinkFor(id) }));

  const emptyState = hasMemories ? null : {
    title: 'Start your journey', subtitle: 'Capture your first memory to unlock your experiences',
    icon: 'compass', cta: { id: 'capture', label: 'Add a memory', deepLink: 'travelapp://capture' },
  };

  return {
    graph: { nodes, edges },
    entryPoints, defaultEntry,
    recommendedSequence: RECOMMENDED_SEQUENCE,
    availableSequence: availableSeq,
    cursor,
    timelineAnchors,
    emptyState,
    meta: { version: NAV_VERSION, experienceCount: nodes.length, availableCount: availableSeq.length, hasMemories },
    basedOn: index.basedOn,
  };
}
