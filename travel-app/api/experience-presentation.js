// Travel App — Experience Presentation Engine (M36).
//
// The single composition layer for ALL premium experiences (Travel Wrapped, On
// This Day, Memory Collections, Story Composer, Journey Cinematic). It creates NO
// new intelligence — it only ADAPTS existing engine outputs into one consistent,
// serialisable presentation contract built from shared models (hero, section,
// card, timeline, statistics, map ref, media ref, achievement ref), so future
// SwiftUI screens never rebuild presentation logic.
//
// NO AI, NO prose, NO randomness, NO Date.now, NO argless new Date, NO
// networking. Pure functions; deterministic; offline-first; references only; no
// platform change; no backend leak.

import { buildTravelWrapped } from './travel-wrapped.js';
import { buildOnThisDay } from './on-this-day.js';
import { buildCollections } from './collections.js';
import { buildStoryComposer } from './story-composer.js';
import { buildCinematic } from './cinematic.js';
import { buildWorld } from './world.js';

// --- fixed enums ------------------------------------------------------------
export const SECTION_LAYOUTS = Object.freeze(['hero', 'deck', 'grid', 'list', 'carousel', 'stat-grid', 'timeline']);
export const CARD_KINDS = Object.freeze(['stat', 'highlight', 'moment', 'memory', 'collection', 'scene', 'story', 'achievement', 'transition', 'year']);
export const EMPHASIS = Object.freeze(['low', 'normal', 'high', 'hero']);
export const EXPERIENCES = Object.freeze([
  { id: 'wrapped', title: 'Travel Wrapped', subtitle: 'Your year in travel', icon: 'sparkles' },
  { id: 'on-this-day', title: 'On This Day', subtitle: 'Memories from years past', icon: 'calendar' },
  { id: 'collections', title: 'Collections', subtitle: 'Your travels, themed', icon: 'grid' },
  { id: 'story', title: 'Your Story', subtitle: 'A life of travel', icon: 'book' },
  { id: 'cinematic', title: 'Cinematic', subtitle: 'A journey, scene by scene', icon: 'film' },
]);
const EXPERIENCE_IDS = new Set(EXPERIENCES.map(e => e.id));

const TONE_ACCENT = { joyful: 'sunset', proud: 'gold', nostalgic: 'dusk', warm: 'sand', reflective: 'slate', adventurous: 'forest', serene: 'ocean', awe: 'ocean', anticipation: 'sky' };

// --- shared model builders --------------------------------------------------
const mediaRef = (photoRef) => ({ photoRef });
const mapRef = (place, isIsland = false) => ({ place, isIsland, latitude: null, longitude: null });
const achievementRef = (id) => ({ id });
const statItem = (id, label, value, icon = null, unit = null) => ({ id, label, value, unit, icon });

function card(o) {
  return {
    id: o.id, kind: o.kind, title: o.title, subtitle: o.subtitle ?? null,
    value: o.value ?? null, date: o.date ?? null,
    accent: o.accent ?? 'slate', icon: o.icon ?? 'sparkles', emphasis: o.emphasis ?? 'normal',
    mediaRefs: o.mediaRefs ?? [], mapRefs: o.mapRefs ?? [], achievementRefs: o.achievementRefs ?? [], companionRefs: o.companionRefs ?? [],
    sourceRef: o.sourceRef ?? null,
  };
}
function section(id, kind, title, layout, cards, extra = {}) {
  return { id, kind, title: title ?? null, layout, cards, ...extra };
}
function hero(o) {
  return o ? { id: o.id, kind: o.kind ?? 'highlight', title: o.title, subtitle: o.subtitle ?? null, mediaRef: o.mediaRef ?? null, mapRef: o.mapRef ?? null, accent: o.accent ?? 'sunset', icon: o.icon ?? 'sparkles' } : null;
}
const present = (o) => ({
  id: o.id, experience: o.experience, title: o.title, subtitle: o.subtitle ?? null,
  hero: o.hero ?? null, sections: o.sections ?? [], timeline: o.timeline ?? null,
  statistics: o.statistics ?? { items: [] }, generatedFrom: o.generatedFrom ?? [], basedOn: o.basedOn,
});

// --- adapters ---------------------------------------------------------------
function adaptWrapped(events, trips) {
  const w = buildTravelWrapped(events, trips);
  const deck = section('deck', 'deck', null, 'deck', w.sections.map(s => card({
    id: `wrapped-${s.id}`, kind: s.kind === 'stat' ? 'stat' : s.kind === 'achievement' ? 'achievement' : 'highlight',
    title: s.title, subtitle: s.subtitle, value: s.value, accent: s.accent, icon: s.icon,
    emphasis: s.id === 'intro' || s.id === 'outro' ? 'hero' : 'normal',
  })));
  const statKeys = [
    ['countries', 'Countries', 'globe'], ['cities', 'Cities', 'city'], ['islands', 'Islands', 'island'],
    ['travelDays', 'Days travelling', 'calendar'], ['trips', 'Journeys', 'suitcase'], ['flights', 'Flights', 'airplane'],
    ['dives', 'Dives', 'dive'], ['photos', 'Photos', 'camera'], ['returnVisits', 'Return visits', 'repeat'], ['memories', 'Memories', 'sparkles'],
  ];
  const statistics = { items: statKeys.map(([k, label, icon]) => statItem(k, label, w.stats[k], icon)) };
  const years = section('years', 'year', 'Your years', 'list', w.years.map(y => card({
    id: `year-${y.year}`, kind: 'year', title: `${y.year}`, subtitle: `${y.summary.memories} memories · ${y.summary.countries} countries`,
    value: y.summary.memories, accent: 'sky', icon: 'calendar',
  })));
  return present({
    id: 'experience-wrapped', experience: 'wrapped', title: 'Travel Wrapped', subtitle: w.headline.statement,
    hero: hero({ id: 'wrapped-hero', title: w.highlights.favouriteDestination ?? 'Your travels', subtitle: w.headline.statement, mapRef: w.highlights.favouriteDestination ? mapRef(w.highlights.favouriteDestination) : null, accent: 'sunset', icon: 'sparkles' }),
    sections: [deck, years], statistics, generatedFrom: ['travel-wrapped'], basedOn: w.basedOn,
  });
}

function adaptOnThisDay(events, trips, referenceDate) {
  const otd = buildOnThisDay(events, trips, referenceDate);
  const itemCard = (it) => card({
    id: `otd-${it.id}`, kind: it.type === 'memory' ? 'memory' : 'moment', title: it.title, subtitle: it.subtitle,
    date: it.date, accent: TONE_ACCENT[it.emotionalTone] ?? 'slate', icon: it.iconId, emphasis: it.isMilestone ? 'high' : 'normal',
    mediaRefs: it.mediaRefs.map(mediaRef), mapRefs: it.place ? [mapRef(it.place)] : [], achievementRefs: it.relatedAchievements.map(achievementRef), companionRefs: it.companions, sourceRef: it.sourceId,
  });
  const sections = [];
  if (otd.items.length) sections.push(section('moments', 'moment', otd.label ?? 'On this day', 'list', otd.items.map(itemCard)));
  if (otd.comparisons.length) sections.push(section('comparisons', 'highlight', 'Across the years', 'list', otd.comparisons.map(c => card({ id: `cmp-${c.year}`, kind: 'highlight', title: c.headline, subtitle: `${c.count} ${c.count === 1 ? 'memory' : 'memories'}`, value: c.year, accent: 'dusk', icon: 'calendar' }))));
  return present({
    id: 'experience-on-this-day', experience: 'on-this-day', title: 'On This Day', subtitle: otd.label ?? null,
    hero: otd.hero ? hero({ id: 'otd-hero', title: otd.hero.title, subtitle: `${otd.hero.yearsAgo} ${otd.hero.yearsAgo === 1 ? 'year' : 'years'} ago`, mediaRef: otd.hero.mediaRefs[0] ? mediaRef(otd.hero.mediaRefs[0]) : null, mapRef: otd.hero.place ? mapRef(otd.hero.place) : null, accent: TONE_ACCENT[otd.hero.emotionalTone] ?? 'sunset', icon: otd.hero.iconId }) : null,
    sections,
    timeline: { anchors: otd.byYear.map(y => ({ id: `y-${y.year}`, date: `${y.year}-01-01`, label: `${y.yearsAgo} ${y.yearsAgo === 1 ? 'yr' : 'yrs'} ago`, kind: 'year' })), entries: [] },
    statistics: { items: otd.categories.map(c => statItem(`cat-${c.category}`, c.category, c.count)) },
    generatedFrom: ['on-this-day'], basedOn: otd.basedOn,
  });
}

function adaptCollections(events, trips) {
  const c = buildCollections(events, trips);
  const cards = c.collections.map(col => card({
    id: `col-${col.id}`, kind: 'collection', title: col.title, subtitle: col.subtitle, value: col.statistics.memories,
    accent: 'ocean', icon: col.icon, emphasis: col.sortOrder === 0 ? 'high' : 'normal',
    mediaRefs: col.coverCandidate?.photoRef ? [mediaRef(col.coverCandidate.photoRef)] : [],
    mapRefs: col.locations.slice(0, 3).map(p => mapRef(p)), achievementRefs: col.achievementRefs.map(achievementRef), companionRefs: col.companions, sourceRef: col.id,
  }));
  const top = c.collections[0] ?? null;
  return present({
    id: 'experience-collections', experience: 'collections', title: 'Collections', subtitle: `${c.summary.total} collections`,
    hero: top ? hero({ id: 'col-hero', title: top.title, subtitle: top.subtitle, mediaRef: top.coverCandidate?.photoRef ? mediaRef(top.coverCandidate.photoRef) : null, accent: 'ocean', icon: top.icon }) : null,
    sections: [section('collections', 'collection', null, 'grid', cards)],
    statistics: { items: Object.entries(c.summary.byType).map(([t, n]) => statItem(`type-${t}`, t, n)) },
    generatedFrom: ['collections'], basedOn: c.basedOn,
  });
}

function adaptStory(events, trips) {
  const s = buildStoryComposer(events, trips);
  const momentById = new Map();
  for (const ch of s.chapters) for (const d of ch.days) for (const m of d.moments) momentById.set(m.id, m);
  const heroMoment = s.hero ? momentById.get(s.hero.id) : null;
  const sections = s.chapters.map(ch => section(`chapter-${ch.id}`, 'story', ch.title, 'timeline', ch.days.map(d => {
    const dayHero = momentById.get(d.hero);
    return card({
      id: `day-${d.id}`, kind: 'story', title: d.label, subtitle: dayHero ? dayHero.title : `${d.moments.length} moments`,
      date: d.date, accent: 'dusk', icon: 'book', emphasis: d.milestones.length ? 'high' : 'normal',
      mediaRefs: (dayHero?.mediaRefs ?? []).map(mediaRef), sourceRef: d.id,
    });
  }), { subtitle: ch.subtitle }));
  return present({
    id: 'experience-story', experience: 'story', title: 'Your Story', subtitle: s.story.span ? `${s.story.span.from.slice(0, 4)}–${s.story.span.to.slice(0, 4)}` : null,
    hero: heroMoment ? hero({ id: 'story-hero', title: heroMoment.title, subtitle: heroMoment.subtitle, mediaRef: heroMoment.mediaRefs[0] ? mediaRef(heroMoment.mediaRefs[0]) : null, mapRef: heroMoment.place ? mapRef(heroMoment.place) : null, accent: TONE_ACCENT[heroMoment.emotionalTone] ?? 'dusk', icon: heroMoment.iconId }) : null,
    sections,
    timeline: { anchors: s.anchors.map(a => ({ id: a.id, date: a.date, label: a.title ?? a.label ?? null, kind: a.type })), entries: [] },
    statistics: { items: [statItem('chapters', 'Chapters', s.story.chapterCount, 'book'), statItem('moments', 'Moments', s.story.momentCount, 'sparkles'), statItem('transitions', 'Transitions', s.story.transitionCount, 'route')] },
    generatedFrom: ['story-composer'], basedOn: s.basedOn,
  });
}

function adaptCinematic(events, trips) {
  const cin = buildCinematic(events, trips);
  const cards = cin.scenes.map(sc => card({
    id: `scene-${sc.id}`, kind: sc.sourceKind === 'transition' ? 'transition' : 'scene', title: sc.title, subtitle: sc.type,
    date: sc.timelineAnchor, accent: TONE_ACCENT[sc.emotionalCategory] ?? 'slate', icon: 'film',
    emphasis: sc.heroCandidate ? 'hero' : sc.isMilestone ? 'high' : 'normal',
    mediaRefs: sc.mediaRefs.map(mediaRef), mapRefs: sc.mapRefs.map(m => mapRef(m.place, m.isIsland)), achievementRefs: sc.achievementRefs.map(achievementRef), companionRefs: sc.companionRefs, sourceRef: sc.sourceRef,
  }));
  const heroScene = cin.scenes.find(s => s.id === cin.heroScene) ?? null;
  return present({
    id: 'experience-cinematic', experience: 'cinematic', title: 'Cinematic', subtitle: cin.dateRange ? `${cin.dateRange.from.slice(0, 10)} → ${cin.dateRange.to.slice(0, 10)}` : null,
    hero: heroScene ? hero({ id: 'cin-hero', title: heroScene.title, subtitle: heroScene.type, mediaRef: heroScene.mediaRefs[0] ? mediaRef(heroScene.mediaRefs[0]) : null, mapRef: heroScene.mapRefs[0] ? mapRef(heroScene.mapRefs[0].place, heroScene.mapRefs[0].isIsland) : null, accent: TONE_ACCENT[heroScene.emotionalCategory] ?? 'sunset', icon: 'film' }) : null,
    sections: [section('scenes', 'scene', null, 'carousel', cards)],
    timeline: { anchors: cin.scenes.map(sc => ({ id: sc.id, date: sc.timelineAnchor, label: sc.title, kind: sc.type })), entries: [] },
    statistics: { items: [statItem('scenes', 'Scenes', cin.statistics.scenes, 'film'), statItem('locations', 'Locations', cin.statistics.locations, 'globe'), statItem('companions', 'Companions', cin.statistics.companions, 'people')] },
    generatedFrom: ['cinematic'], basedOn: cin.basedOn,
  });
}

const ADAPTERS = { wrapped: adaptWrapped, 'on-this-day': adaptOnThisDay, collections: adaptCollections, story: adaptStory, cinematic: adaptCinematic };

/**
 * Compose a single premium experience into the shared presentation contract.
 * @param {Array} events
 * @param {Array} trips
 * @param {{ name: string, referenceDate?: string }} options
 */
export function buildExperience(events, trips = [], options = {}) {
  const name = options.name;
  if (!EXPERIENCE_IDS.has(name)) {
    const err = new Error(`Unknown experience "${name}"`); err.code = 'UNKNOWN_EXPERIENCE'; throw err;
  }
  if (name === 'on-this-day') return adaptOnThisDay(events, trips, options.referenceDate);
  return ADAPTERS[name](events, trips);
}

/** List the available premium experiences (lightweight index). */
export function listExperiences(events, trips = []) {
  const world = buildWorld(events, trips);
  const available = (world.basedOn?.memories ?? 0) > 0;
  return { experiences: EXPERIENCES.map(e => ({ ...e, available })), basedOn: world.basedOn };
}
