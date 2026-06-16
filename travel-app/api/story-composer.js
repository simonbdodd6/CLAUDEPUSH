// Travel App — Story Composer Engine (M34).
//
// Composes an immersive, chronological travel STORY from existing intelligence —
// it generates no stories and no text. It weaves the lifetime timeline (typed
// moments) together with the journey engine (transport transitions + location /
// border changes), groups everything into chapters → days, and flags heroes and
// milestones. NO AI, NO generated prose, NO randomness, NO networking.
//
// Pure function of (events, trips); deterministic, offline-first; reuses engines
// (zero duplicated enrichment); presentation DTOs only; references only (media is
// never loaded); no platform change; no backend leak.

import { buildLifetimeTimeline } from './lifetime-timeline.js';
import { buildJourney } from './journey.js';
import { humanDay, humanTime, dayKey } from './presenters.js';

const HERO_BASE = { achievement: 90, 'first-visit': 80, milestone: 70, relationship: 60, return: 55, journey: 50, memory: 40 };
const TIER_BONUS = { Legend: 25, Platinum: 20, Gold: 10, Silver: 5, Bronze: 0 };
const MILESTONE_TYPES = new Set(['first-visit', 'milestone', 'achievement']);

function heroScore(m) { return (HERO_BASE[m.type] ?? 40) + (m.tier ? (TIER_BONUS[m.tier] ?? 0) : 0) + (m.favourite ? 8 : 0); }
function mediaOf(memories) { return (memories ?? []).map(e => e.photoRef).filter(Boolean); }
function yearOf(iso) { return Number(dayKey(iso).slice(0, 4)); }

export function buildStoryComposer(events, trips = []) {
  const lifetime = buildLifetimeTimeline(events, trips);
  const journey = buildJourney(events, trips);

  if (!lifetime.moments.length) {
    return { story: { span: null, chapterCount: 0, momentCount: 0 }, chapters: [], hero: null, anchors: [], basedOn: lifetime.basedOn };
  }

  // place -> country (from the journey stops) for location/border changes
  const placeCountry = new Map();
  for (const s of journey.stops) if (s.place && s.country) placeCountry.set(s.place, s.country);

  // --- story moments (from the lifetime timeline) ---------------------------
  const moments = lifetime.moments.map(m => ({
    id: `sm-${m.id}`, sourceId: m.id, type: m.type, kind: m.category ?? m.type,
    title: m.title, subtitle: m.subtitle ?? null,
    date: m.date, time: humanTime(m.date), year: m.year,
    isHero: false, isMilestone: MILESTONE_TYPES.has(m.type),
    emotionalTone: m.emotionalTone, iconId: m.iconId,
    mediaRefs: mediaOf(m.supportingMemories), achievementRefs: m.relatedAchievements ?? [], companionRefs: m.relatedCompanions ?? [],
    place: m.relatedPlaces?.[0] ?? null, confidence: m.confidence, evidence: m.evidence, tier: m.tier ?? null, favourite: !!m.favourite,
  }));

  // --- transitions (from the journey segments) ------------------------------
  const transitions = journey.segments
    .map(seg => {
      const date = seg.endDate ?? seg.startDate ?? null;
      if (!date) return null;
      const fromCountry = placeCountry.get(seg.origin) ?? null;
      const toCountry = placeCountry.get(seg.destination) ?? null;
      return {
        id: `tr-${seg.id}`, kind: 'transport', transport: seg.transport, icon: seg.icon ?? 'route',
        from: seg.origin, to: seg.destination, date, time: humanTime(date), year: yearOf(date),
        crossedCountry: !!(fromCountry && toCountry && fromCountry !== toCountry),
        locationChange: seg.origin !== seg.destination,
        mediaRefs: mediaOf(seg.supportingMemories), inferred: !!seg.inferred,
      };
    })
    .filter(Boolean);

  // --- group into chapters (lifetime eras) → days ---------------------------
  const chapterDefs = lifetime.chapters.length
    ? lifetime.chapters
    : [{ id: 'chapter-1', title: 'Your travels', years: [...new Set(moments.map(m => m.year))], from: moments[0].date, to: moments[moments.length - 1].date }];

  const chapterOf = (year) => chapterDefs.find(c => c.years.includes(year)) ?? chapterDefs[0];

  const chapters = chapterDefs.map((def, ci) => {
    const chMoments = moments.filter(m => chapterOf(m.year)?.id === def.id);
    const chTransitions = transitions.filter(t => chapterOf(t.year)?.id === def.id);

    // group by day
    const dayKeys = [...new Set([...chMoments, ...chTransitions].map(x => dayKey(x.date)))].sort();
    const days = dayKeys.map((dk, di) => {
      const dayMoments = chMoments.filter(m => dayKey(m.date) === dk).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      const dayTransitions = chTransitions.filter(t => dayKey(t.date) === dk).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      // combined render order: transitions set the scene, then moments, by time
      const flow = [...dayTransitions.map(t => ({ kind: 'transition', refId: t.id, date: t.date })), ...dayMoments.map(m => ({ kind: 'moment', refId: m.id, date: m.date }))]
        .sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? a.refId.localeCompare(b.refId) : a.kind === 'transition' ? -1 : 1));
      const dayHero = [...dayMoments].sort((a, b) => heroScore(b) - heroScore(a) || a.id.localeCompare(b.id))[0] ?? null;
      if (dayHero) dayHero.isHero = true;
      return {
        id: `${def.id}-day-${di + 1}`, date: `${dk}T00:00:00Z`, label: humanDay(`${dk}T00:00:00Z`),
        moments: dayMoments, transitions: dayTransitions, flow,
        hero: dayHero ? dayHero.id : null,
        milestones: dayMoments.filter(m => m.isMilestone).map(m => m.id),
        locationChanges: dayTransitions.filter(t => t.locationChange).map(t => ({ id: t.id, from: t.from, to: t.to, crossedCountry: t.crossedCountry })),
      };
    });

    const chapterHero = [...chMoments].sort((a, b) => heroScore(b) - heroScore(a) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0] ?? null;
    const companions = [...new Set(chMoments.flatMap(m => m.companionRefs))].sort();
    const locations = [...new Set(chMoments.map(m => m.place).filter(Boolean))];
    return {
      id: def.id, title: def.title, subtitle: (def.summary ? `${def.summary.countries?.length ?? 0} ${(def.summary.countries?.length ?? 0) === 1 ? 'country' : 'countries'} · ${def.summary.memories ?? chMoments.length} memories` : null),
      span: { from: def.from, to: def.to }, years: def.years,
      hero: chapterHero ? chapterHero.id : null,
      days,
      highlights: chMoments.filter(m => m.favourite || m.isMilestone).map(m => m.id).slice(0, 12),
      milestones: chMoments.filter(m => m.isMilestone).map(m => m.id),
      transitions: chTransitions.map(t => t.id),
      statistics: { days: days.length, moments: chMoments.length, milestones: chMoments.filter(m => m.isMilestone).length, transitions: chTransitions.length, locations: locations.length, companions: companions.length },
      sortOrder: ci,
    };
  });

  // --- overall hero ---------------------------------------------------------
  const allMoments = chapters.flatMap(c => c.days.flatMap(d => d.moments));
  const storyHero = [...allMoments].sort((a, b) => heroScore(b) - heroScore(a) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0] ?? null;

  // --- timeline anchors (for scroll / scrub) --------------------------------
  const anchors = [];
  for (const c of chapters) {
    anchors.push({ id: c.id, type: 'chapter', date: c.span.from, title: c.title, chapterId: c.id });
    for (const d of c.days) anchors.push({ id: d.id, type: 'day', date: d.date, label: d.label, chapterId: c.id });
  }

  return {
    story: {
      span: lifetime.summary.span,
      chapterCount: chapters.length,
      momentCount: allMoments.length,
      transitionCount: transitions.length,
      hero: storyHero ? storyHero.id : null,
    },
    chapters,
    hero: storyHero ? { id: storyHero.id, title: storyHero.title, date: storyHero.date, iconId: storyHero.iconId } : null,
    anchors,
    basedOn: lifetime.basedOn,
  };
}
