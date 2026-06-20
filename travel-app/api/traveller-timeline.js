// Travel App — Traveller Timeline Engine (M43).
//
// Assembles every known travel event into ONE complete chronological life
// timeline — a single ordered stream. It computes no new intelligence; it
// composes existing outputs (lifetime timeline moments, journey transport legs,
// story chapters, yearly milestones). NO AI, NO generated prose, NO randomness,
// NO Date.now, NO networking. Pure; deterministic; offline-first; presentation
// DTOs only; references only; no platform change; no backend leak.

import { buildLifetimeTimeline } from './lifetime-timeline.js';
import { buildJourney } from './journey.js';
import { buildNavigation } from './navigation.js';

export const TRAVELLER_TIMELINE_VERSION = '1.0.0';
export const TIMELINE_ENTRY_TYPES = Object.freeze([
  'trip', 'flight', 'ferry', 'transport', 'border-crossing', 'country', 'island', 'city',
  'dive', 'surf', 'memory', 'achievement', 'milestone', 'relationship', 'return', 'story-anchor', 'year',
]);
const TYPE_RANK = new Map(TIMELINE_ENTRY_TYPES.map((t, i) => [t, i]));

const CATEGORY_TO_TYPE = { Countries: 'country', Islands: 'island', Cities: 'city', Diving: 'dive', Surfing: 'surf', Flights: 'flight', Ferries: 'ferry' };
const TYPE_TO_EXPERIENCE = {
  flight: 'cinematic', ferry: 'cinematic', transport: 'cinematic', 'border-crossing': 'cinematic',
  year: 'wrapped', 'story-anchor': 'story', achievement: 'wrapped',
  trip: 'story', country: 'story', island: 'story', city: 'story', dive: 'story', surf: 'story',
  memory: 'story', milestone: 'story', relationship: 'story', return: 'story',
};

const mediaOf = (entries) => (entries ?? []).map(e => e.photoRef).filter(Boolean);

function momentType(m) {
  if (m.type === 'achievement') return 'achievement';
  if (m.type === 'first-visit') return CATEGORY_TO_TYPE[m.category] ?? 'milestone';
  if (m.type === 'milestone') return CATEGORY_TO_TYPE[m.category] ?? 'milestone';
  if (m.type === 'return') return 'return';
  if (m.type === 'relationship') return 'relationship';
  return 'memory';
}

export function buildTravellerTimeline(events, trips = []) {
  const lifetime = buildLifetimeTimeline(events, trips);
  const journey = buildJourney(events, trips);
  const nav = buildNavigation(events, trips, {});
  const navNodeById = new Map(nav.graph.nodes.map(n => [n.id, n]));
  const targetFor = (type) => {
    const ex = TYPE_TO_EXPERIENCE[type] ?? 'story';
    const node = navNodeById.get(ex);
    return { experience: ex, deepLink: node?.deepLink ?? `travelapp://experience/${ex}` };
  };

  if (!lifetime.moments.length) {
    return {
      version: TRAVELLER_TIMELINE_VERSION, entries: [], span: null,
      statistics: { total: 0, byType: {} }, byYear: [],
      emptyState: { title: 'Your timeline is empty', subtitle: 'Capture a memory to begin your timeline', icon: 'compass', cta: { id: 'capture', label: 'Add a memory', deepLink: 'travelapp://capture' } },
      basedOn: lifetime.basedOn,
    };
  }

  const raw = [];

  // 1) lifetime moments
  for (const m of lifetime.moments) {
    const type = momentType(m);
    raw.push({
      type, title: m.title, subtitle: m.subtitle ?? null, date: m.date,
      locationRefs: m.relatedPlaces ?? [], companionRefs: m.relatedCompanions ?? [],
      mediaRefs: mediaOf(m.supportingMemories), achievementRefs: m.relatedAchievements ?? [],
      ref: { type: 'moment', id: m.id },
    });
  }

  // 2) journey transport legs (flights / ferries / border crossings)
  for (const seg of journey.segments) {
    if (seg.inferred) continue; // skip structural home bookends
    const date = seg.endDate ?? seg.startDate;
    if (!date) continue;
    const fam = /flight|fly|plane|air/i.test(seg.transport) ? 'flight' : /boat|ferry|sail/i.test(seg.transport) ? 'ferry' : 'transport';
    const type = seg.crossedCountry ? 'border-crossing' : fam;
    raw.push({
      type, title: seg.from && seg.to ? `${seg.from} → ${seg.to}` : 'Travel', subtitle: seg.transport, date,
      locationRefs: [seg.from, seg.to].filter(Boolean), companionRefs: [],
      mediaRefs: mediaOf(seg.supportingMemories), achievementRefs: [], ref: { type: 'segment', id: seg.id },
    });
  }

  // 3) story anchors (chapter starts)
  for (const ch of lifetime.chapters) {
    raw.push({
      type: 'story-anchor', title: ch.title, subtitle: ch.summary ? `${ch.summary.memories} memories` : null,
      date: `${String(ch.from).slice(0, 10)}T00:00:00Z`, locationRefs: [], companionRefs: [], mediaRefs: [], achievementRefs: [], ref: { type: 'story-chapter', id: ch.id },
    });
  }

  // 4) yearly milestones (wrapped-style markers)
  for (const y of lifetime.years) {
    raw.push({
      type: 'year', title: `${y.year}`, subtitle: `${y.summary.memories} memories · ${y.summary.countries} countries`,
      date: `${y.year}-01-01T00:00:00Z`, locationRefs: [], companionRefs: [], mediaRefs: [], achievementRefs: [], ref: { type: 'year', id: String(y.year) },
    });
  }

  // chronological order (deterministic tiebreak: type rank, then ref id)
  raw.sort((a, b) => a.date.localeCompare(b.date) || (TYPE_RANK.get(a.type) - TYPE_RANK.get(b.type)) || String(a.ref.id).localeCompare(String(b.ref.id)));

  const entries = raw.map((e, i) => ({
    id: `tl-${i}`, orderingIndex: i, type: e.type, title: e.title, subtitle: e.subtitle, date: e.date,
    locationRefs: e.locationRefs, companionRefs: e.companionRefs, mediaRefs: e.mediaRefs, achievementRefs: e.achievementRefs,
    ref: e.ref, navigationTarget: targetFor(e.type),
  }));

  const byTypeCount = {};
  for (const e of entries) byTypeCount[e.type] = (byTypeCount[e.type] ?? 0) + 1;
  const yearMap = new Map();
  for (const e of entries) { const y = Number(e.date.slice(0, 4)); if (!yearMap.has(y)) yearMap.set(y, []); yearMap.get(y).push(e.id); }
  const byYear = [...yearMap.entries()].sort((a, b) => a[0] - b[0]).map(([year, ids]) => ({ year, count: ids.length, entryIds: ids }));

  return {
    version: TRAVELLER_TIMELINE_VERSION,
    entries, span: { from: entries[0].date, to: entries[entries.length - 1].date },
    statistics: { total: entries.length, byType: byTypeCount },
    byYear, emptyState: null, basedOn: lifetime.basedOn,
  };
}
