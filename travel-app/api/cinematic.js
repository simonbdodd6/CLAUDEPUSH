// Travel App — Journey Cinematic Engine (M35).
//
// Prepares a deterministic, STORYBOARD-style playback model for a future premium
// SwiftUI experience. This is NOT a video renderer, NOT an AI story generator and
// creates NO media — it composes existing travel intelligence into an ordered set
// of scenes with fixed-enum transition / pacing / emotional hints and
// references only.
//
// Reuses the Story Composer (scene scaffold: order, anchors, heroes), the journey
// (home bookends / transport), the lifetime timeline + shared enrichment (scene
// typing) and the shared detectors. NO AI, NO prose, NO randomness, NO Date.now,
// NO argless new Date, NO networking, NO media loading. Pure, deterministic,
// presentation-only; no platform change; no backend leak.

import { buildStoryComposer } from './story-composer.js';
import { buildLifetimeTimeline } from './lifetime-timeline.js';
import { buildWorld } from './world.js';
import { enrichMemories } from './travel-dna.js';
import { MEMORY_PATTERNS } from './achievements.js';
import { dayKey } from './presenters.js';

// --- fixed deterministic enums ---------------------------------------------
export const SCENE_TYPES = Object.freeze(['departure', 'arrival', 'transport', 'first-moment', 'location-change', 'border-crossing', 'beach', 'island', 'dive', 'surf', 'hike', 'food', 'city', 'sunset', 'milestone', 'achievement', 'final-evening', 'journey-home', 'memory', 'photo', 'other']);
export const EMOTIONS = Object.freeze(['anticipation', 'joyful', 'adventurous', 'awe', 'serene', 'warm', 'reflective', 'proud', 'nostalgic']);
export const TRANSITION_HINTS = Object.freeze(['cut', 'dissolve', 'fade', 'pan', 'zoom', 'fly-over', 'sail-over']);
export const PACING_HINTS = Object.freeze(['fast', 'medium', 'slow', 'lingering']);

const SCENE_EMOTION = {
  departure: 'anticipation', 'journey-home': 'nostalgic', arrival: 'joyful', transport: 'adventurous',
  'location-change': 'adventurous', 'border-crossing': 'adventurous', beach: 'serene', island: 'serene',
  dive: 'awe', surf: 'adventurous', hike: 'adventurous', food: 'warm', city: 'reflective', sunset: 'serene',
  milestone: 'proud', achievement: 'proud', 'first-moment': 'joyful', 'final-evening': 'nostalgic',
  memory: 'reflective', photo: 'reflective', other: 'reflective',
};
const SCENE_TRANSITION = {
  departure: 'zoom', 'journey-home': 'zoom', arrival: 'zoom', transport: 'pan', 'location-change': 'pan',
  'border-crossing': 'fly-over', sunset: 'fade', beach: 'dissolve', island: 'sail-over', dive: 'dissolve',
  surf: 'cut', hike: 'pan', food: 'dissolve', city: 'pan', milestone: 'fade', achievement: 'fade',
  'first-moment': 'zoom', 'final-evening': 'fade', memory: 'dissolve', photo: 'cut', other: 'dissolve',
};
const SCENE_PACING = {
  departure: 'medium', 'journey-home': 'slow', arrival: 'medium', transport: 'fast', 'location-change': 'medium',
  'border-crossing': 'fast', beach: 'lingering', island: 'lingering', dive: 'slow', surf: 'fast', hike: 'slow',
  food: 'medium', city: 'medium', sunset: 'lingering', milestone: 'medium', achievement: 'medium',
  'first-moment': 'medium', 'final-evening': 'lingering', memory: 'medium', photo: 'medium', other: 'medium',
};

function slugDate(iso) { return dayKey(iso); }
function hourOf(iso) { return Number(String(iso).slice(11, 13)); }

function emptyCinematic(scope, basedOn) {
  return {
    cinematicId: `cinematic-${scope}-empty`, scope, sourceJourneyId: null,
    scenes: [], sceneOrder: [], openingScene: null, closingScene: null, heroScene: null,
    dateRange: null, statistics: { scenes: 0, byType: {}, locations: 0, companions: 0, mediaCount: 0, hasHero: false },
    basedOn,
  };
}

export function buildCinematic(events, trips = [], options = {}) {
  const scope = options.scope ?? 'lifetime';
  const story = buildStoryComposer(events, trips);
  const lifetime = buildLifetimeTimeline(events, trips);
  const world = buildWorld(events, trips);
  const enriched = enrichMemories(events, trips);

  if (!story.chapters.length) return emptyCinematic(scope, story.basedOn);

  // lookups (composition, no re-derivation)
  const momentById = new Map(lifetime.moments.map(m => [m.id, m]));
  const catsById = new Map(enriched.map(i => [i.entry.id, i.cats]));
  const textById = new Map(enriched.map(i => [i.entry.id, i.text]));
  const islandPlaces = new Set();
  for (const isl of world.islands) for (const p of isl.places) islandPlaces.add(p);

  // story lookups
  const storyMoment = new Map();
  const storyTransition = new Map();
  for (const c of story.chapters) for (const d of c.days) {
    for (const m of d.moments) storyMoment.set(m.id, m);
    for (const t of d.transitions) storyTransition.set(t.id, t);
  }

  // scene type for a moment (from its supporting memories' cats/text)
  const sceneTypeForMoment = (sm) => {
    if (sm.type === 'achievement') return 'achievement';
    if (sm.type === 'milestone') return 'milestone';
    if (sm.type === 'return') return 'arrival';
    if (sm.type === 'relationship') return 'memory';
    if (sm.type === 'journey') return 'photo';
    const lid = sm.sourceId; // lifetime moment id
    const lm = momentById.get(lid);
    const memIds = (lm?.supportingMemories ?? []).map(e => e.id);
    const cats = new Set(memIds.flatMap(id => catsById.get(id) ?? []));
    const text = memIds.map(id => textById.get(id) ?? '').join(' ');
    const place = sm.place;
    if (cats.has('dive')) return 'dive';
    if (MEMORY_PATTERNS.surf.test(text)) return 'surf';
    if (cats.has('mountain')) return 'hike';
    if (cats.has('sunset')) return 'sunset';
    if (place && islandPlaces.has(place) && cats.has('beach')) return 'island';
    if (cats.has('beach')) return 'beach';
    if (cats.has('food')) return 'food';
    if (cats.has('city')) return 'city';
    if (sm.type === 'first-visit') return 'first-moment';
    return sm.mediaRefs.length ? 'photo' : 'memory';
  };

  const sceneTypeForTransition = (st) => (st.crossedCountry ? 'border-crossing' : 'transport');

  const mapRefsFor = (locations) => locations.map(name => ({ place: name, isIsland: islandPlaces.has(name) }));

  // --- content scenes (in the story's chronological flow) -------------------
  const content = [];
  for (const c of story.chapters) for (const d of c.days) for (const f of d.flow) {
    if (f.kind === 'moment') {
      const sm = storyMoment.get(f.refId); if (!sm) continue;
      const type = sceneTypeForMoment(sm);
      const locationRefs = sm.place ? [sm.place] : [];
      content.push({
        type, title: sm.title, subtitle: sm.subtitle ?? null,
        timelineAnchor: sm.date, dateRange: { from: sm.date, to: sm.date },
        locationRefs, mapRefs: mapRefsFor(locationRefs), companionRefs: sm.companionRefs ?? [],
        mediaRefs: sm.mediaRefs ?? [], achievementRefs: sm.achievementRefs ?? [],
        sourceKind: 'moment', sourceRef: sm.id, chapterId: c.id, dayId: d.id, isMilestone: sm.isMilestone,
      });
    } else {
      const st = storyTransition.get(f.refId); if (!st) continue;
      if (st.inferred) continue; // home bookends are replaced by synthetic departure / journey-home
      const type = sceneTypeForTransition(st);
      const locationRefs = [st.from, st.to].filter(Boolean);
      content.push({
        type, title: st.from && st.to ? `${st.from} → ${st.to}` : 'Travel', subtitle: st.transport,
        timelineAnchor: st.date, dateRange: { from: st.date, to: st.date },
        locationRefs, mapRefs: mapRefsFor(locationRefs), companionRefs: [],
        mediaRefs: st.mediaRefs ?? [], achievementRefs: [],
        sourceKind: 'transition', sourceRef: st.id, chapterId: c.id, dayId: d.id, isMilestone: false, transport: st.transport,
      });
    }
  }

  content.sort((a, b) => a.timelineAnchor.localeCompare(b.timelineAnchor) || a.sourceRef.localeCompare(b.sourceRef));

  // final-evening: last content scene on the last day, if it falls in the evening
  if (content.length) {
    const last = content[content.length - 1];
    if (last.sourceKind === 'moment' && hourOf(last.timelineAnchor) >= 17) last.type = 'final-evening';
  }

  // --- opening / closing scenes (home bookends, when there are trips) --------
  const hasHome = trips.length > 0 && content.length > 0;
  const firstPlace = content.find(s => s.locationRefs.length)?.locationRefs.slice(-1)[0] ?? null;
  const span = story.story.span;
  const opening = hasHome ? {
    type: 'departure', title: 'Departure', subtitle: firstPlace ? `Setting off for ${firstPlace}` : 'Setting off',
    timelineAnchor: span.from, dateRange: { from: span.from, to: span.from },
    locationRefs: ['Home', firstPlace].filter(Boolean), mapRefs: mapRefsFor([firstPlace].filter(Boolean)),
    companionRefs: [], mediaRefs: [], achievementRefs: [], sourceKind: 'synthetic', sourceRef: 'opening', chapterId: story.chapters[0].id, dayId: null, isMilestone: false,
  } : null;
  const closing = hasHome ? {
    type: 'journey-home', title: 'Journey home', subtitle: 'The road back',
    timelineAnchor: span.to, dateRange: { from: span.to, to: span.to },
    locationRefs: ['Home'], mapRefs: [], companionRefs: [], mediaRefs: [], achievementRefs: [],
    sourceKind: 'synthetic', sourceRef: 'closing', chapterId: story.chapters[story.chapters.length - 1].id, dayId: null, isMilestone: false,
  } : null;

  // --- finalise scenes with order + fixed-enum hints ------------------------
  const ordered = [...(opening ? [opening] : []), ...content, ...(closing ? [closing] : [])];
  const heroSourceRef = story.story.hero; // story hero moment id (sm-...)
  const scenes = ordered.map((s, i) => {
    const heroCandidate = s.sourceRef === heroSourceRef;
    return {
      id: `scene-${i}`, order: i, type: s.type,
      title: s.title, subtitle: s.subtitle,
      timelineAnchor: s.timelineAnchor, dateRange: s.dateRange,
      locationRefs: s.locationRefs, mapRefs: s.mapRefs, companionRefs: s.companionRefs,
      mediaRefs: s.mediaRefs, achievementRefs: s.achievementRefs,
      transitionHint: SCENE_TRANSITION[s.type] ?? 'dissolve',
      pacingHint: SCENE_PACING[s.type] ?? 'medium',
      emotionalCategory: SCENE_EMOTION[s.type] ?? 'reflective',
      heroCandidate, isMilestone: s.isMilestone,
      sourceKind: s.sourceKind, sourceRef: s.sourceRef, chapterId: s.chapterId, dayId: s.dayId,
      ...(s.transport ? { transport: s.transport } : {}),
    };
  });

  const heroScene = scenes.find(s => s.heroCandidate)?.id
    ?? scenes.filter(s => s.sourceKind !== 'synthetic').sort((a, b) => (b.isMilestone - a.isMilestone))[0]?.id
    ?? null;

  // --- statistics -----------------------------------------------------------
  const byType = {};
  for (const s of scenes) byType[s.type] = (byType[s.type] ?? 0) + 1;
  const statistics = {
    scenes: scenes.length, byType,
    locations: new Set(scenes.flatMap(s => s.locationRefs)).size,
    companions: new Set(scenes.flatMap(s => s.companionRefs)).size,
    mediaCount: scenes.reduce((n, s) => n + s.mediaRefs.length, 0),
    milestones: scenes.filter(s => s.isMilestone).length,
    hasHero: heroScene !== null,
  };

  return {
    cinematicId: `cinematic-${scope}-${slugDate(span.from)}_${slugDate(span.to)}`,
    scope, sourceJourneyId: trips.length === 1 ? (trips[0].tripId ?? null) : null,
    dateRange: span,
    scenes, sceneOrder: scenes.map(s => s.id),
    openingScene: scenes[0]?.id ?? null,
    closingScene: scenes[scenes.length - 1]?.id ?? null,
    heroScene,
    statistics, basedOn: story.basedOn,
  };
}
