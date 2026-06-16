// Travel App — Experience Search Engine (M41).
//
// One deterministic search across every premium experience. It computes NO new
// intelligence — it INDEXES existing engine outputs (world, collections,
// achievements, lifetime timeline, story, cinematic, navigation) and matches
// them with simple, deterministic token matching. NO AI, NO embeddings, NO ML,
// NO LLM, NO fuzzy scoring, NO networking, NO Date.now.
//
// Pure function of (events, trips, options); deterministic; offline-first;
// presentation DTOs only; references only; no platform change; no backend leak.

import { buildWorld } from './world.js';
import { buildCollections } from './collections.js';
import { buildAchievements } from './achievements.js';
import { buildLifetimeTimeline } from './lifetime-timeline.js';
import { buildStoryComposer } from './story-composer.js';
import { buildCinematic } from './cinematic.js';
import { buildNavigation } from './navigation.js';

export const SEARCH_VERSION = '1.0.0';
export const SEARCH_KINDS = Object.freeze(['experience', 'country', 'island', 'city', 'companion', 'collection', 'achievement', 'activity', 'transport', 'story-chapter', 'cinematic-scene', 'memory', 'timeline-event']);
const KIND_RANK = new Map(SEARCH_KINDS.map((k, i) => [k, i]));
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const ACTIVITY_SCENE_TYPES = new Set(['dive', 'surf', 'hike', 'beach', 'food', 'city', 'sunset', 'island']);

function tokenize(str) { return String(str ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }
function tokenSet(...parts) {
  const set = new Set();
  for (const p of parts) {
    if (p == null) continue;
    if (Array.isArray(p)) { for (const x of p) for (const t of tokenize(x)) set.add(t); }
    else for (const t of tokenize(p)) set.add(t);
  }
  return set;
}
const slug = (s) => String(s).toLowerCase().replace(/\s+/g, '-');

export function buildSearch(events, trips = [], options = {}) {
  const rawQuery = typeof options.query === 'string' ? options.query.trim() : '';
  const qTokens = tokenize(rawQuery);

  const world = buildWorld(events, trips);
  const hasMemories = (world.basedOn?.memories ?? 0) > 0;
  const nav = buildNavigation(events, trips, {});
  const navNodeById = new Map(nav.graph.nodes.map(n => [n.id, n]));
  const islandNames = new Set(world.islands.map(i => i.name));

  // --- build the deterministic index ----------------------------------------
  const index = [];
  const add = (entry) => index.push(entry);

  // experiences
  for (const n of nav.graph.nodes) {
    add({ id: `experience:${n.id}`, kind: 'experience', title: n.title, subtitle: n.subtitle, tokens: tokenSet(n.id, n.title, n.subtitle, n.mood), target: { experience: n.id, deepLink: n.deepLink }, ref: { type: 'experience', id: n.id } });
  }

  if (hasMemories) {
    const collections = buildCollections(events, trips);
    const ach = buildAchievements(events, trips);
    const lifetime = buildLifetimeTimeline(events, trips);
    const story = buildStoryComposer(events, trips);
    const cinematic = buildCinematic(events, trips);

    // countries / islands / cities
    for (const c of world.countries) add({ id: `country:${slug(c.name)}`, kind: 'country', title: c.name, subtitle: `${c.visitCount} ${c.visitCount === 1 ? 'visit' : 'visits'}`, tokens: tokenSet(c.name), place: c.name, target: { experience: 'collections', deepLink: `travelapp://collection/country-${slug(c.name)}` }, ref: { type: 'country', id: c.name } });
    for (const i of world.islands) add({ id: `island:${slug(i.name)}`, kind: 'island', title: i.name, subtitle: i.country, tokens: tokenSet(i.name, i.country), place: i.name, target: { experience: 'collections', deepLink: 'travelapp://experience/collections' }, ref: { type: 'island', id: i.name } });
    for (const c of world.cities) add({ id: `city:${slug(c.name)}`, kind: 'city', title: c.name, subtitle: c.country, tokens: tokenSet(c.name, c.country), place: c.name, target: { experience: 'collections', deepLink: 'travelapp://experience/collections' }, ref: { type: 'city', id: c.name } });

    // companions (from the lifetime world locations)
    const companions = new Set();
    for (const loc of [...world.countries, ...world.islands, ...world.cities]) for (const co of loc.companions) companions.add(co.name);
    for (const name of companions) add({ id: `companion:${slug(name)}`, kind: 'companion', title: name, subtitle: 'Travel companion', tokens: tokenSet(name), target: { experience: 'collections', deepLink: `travelapp://collection/with-${slug(name)}` }, ref: { type: 'companion', id: name } });

    // collections
    for (const col of collections.collections) add({ id: `collection:${col.id}`, kind: 'collection', title: col.title, subtitle: col.subtitle, tokens: tokenSet(col.title, col.subtitle, col.locations, col.companions), mediaRefs: col.coverCandidate?.photoRef ? [col.coverCandidate.photoRef] : [], target: { experience: 'collections', deepLink: `travelapp://collection/${col.id}` }, ref: { type: 'collection', id: col.id } });

    // achievements
    for (const a of ach.achievements) add({ id: `achievement:${a.id}`, kind: 'achievement', title: a.title, subtitle: `${a.category} · ${a.tier}${a.earned ? ' · earned' : ''}`, tokens: tokenSet(a.title, a.category, a.tier), target: { experience: 'wrapped', deepLink: 'travelapp://achievements' }, ref: { type: 'achievement', id: a.id }, earned: a.earned });

    // memories + timeline events (from the lifetime timeline)
    for (const m of lifetime.moments) {
      const monthName = MONTHS[m.month - 1];
      const mediaRefs = (m.supportingMemories ?? []).map(e => e.photoRef).filter(Boolean);
      add({
        id: `moment:${m.id}`, kind: m.type === 'memory' ? 'memory' : 'timeline-event',
        title: m.title, subtitle: m.subtitle, date: m.date, place: m.relatedPlaces?.[0] ?? null,
        tokens: tokenSet(m.title, m.subtitle, m.type, m.relatedPlaces, m.relatedCompanions, String(m.year), monthName),
        mediaRefs, target: { experience: 'story', deepLink: 'travelapp://experience/story' }, ref: { type: 'moment', id: m.id },
      });
    }

    // story chapters
    for (const ch of story.chapters) add({ id: `story-chapter:${ch.id}`, kind: 'story-chapter', title: ch.title, subtitle: ch.subtitle, tokens: tokenSet(ch.title, ch.subtitle, ch.years.map(String)), target: { experience: 'story', deepLink: 'travelapp://experience/story' }, ref: { type: 'story-chapter', id: ch.id } });

    // cinematic scenes + derived activities + transport
    const activities = new Set(); const transports = new Set();
    for (const sc of cinematic.scenes) {
      add({ id: `scene:${sc.id}`, kind: 'cinematic-scene', title: sc.title, subtitle: sc.type, date: sc.timelineAnchor, tokens: tokenSet(sc.title, sc.type, sc.transport), mediaRefs: sc.mediaRefs ?? [], target: { experience: 'cinematic', deepLink: 'travelapp://experience/cinematic' }, ref: { type: 'scene', id: sc.id } });
      if (ACTIVITY_SCENE_TYPES.has(sc.type)) activities.add(sc.type);
      if (sc.transport) transports.add(sc.transport);
    }
    for (const a of activities) add({ id: `activity:${a}`, kind: 'activity', title: a.charAt(0).toUpperCase() + a.slice(1), subtitle: 'Activity', tokens: tokenSet(a), target: { experience: 'collections', deepLink: 'travelapp://experience/collections' }, ref: { type: 'activity', id: a } });
    for (const t of transports) add({ id: `transport:${slug(t)}`, kind: 'transport', title: t.charAt(0).toUpperCase() + t.slice(1), subtitle: 'Transport', tokens: tokenSet(t), target: { experience: 'cinematic', deepLink: 'travelapp://experience/cinematic' }, ref: { type: 'transport', id: t } });
  }

  // --- empty query → browse empty-state -------------------------------------
  if (!rawQuery) {
    return {
      version: SEARCH_VERSION, query: '', hasQuery: false,
      matchedSections: [], grouped: [], results: [],
      navigationTargets: [], experienceTargets: [], timelineAnchors: [], mapReferences: [], mediaReferences: [],
      statistics: { total: 0, byKind: {} },
      emptyState: { kind: 'browse', title: 'Search your travels', subtitle: 'Try a country, a companion, an activity or a year', suggestions: nav.availableSequence.map(id => ({ experience: id, deepLink: navNodeById.get(id)?.deepLink })) },
      basedOn: world.basedOn,
    };
  }

  // --- deterministic token matching -----------------------------------------
  const scored = [];
  for (const entry of index) {
    let matched = 0;
    for (const q of qTokens) {
      let hit = false;
      for (const it of entry.tokens) { if (it.includes(q)) { hit = true; break; } }
      if (hit) matched += 1;
    }
    if (matched === 0) continue;
    const allMatched = matched === qTokens.length;
    const exactTitle = qTokens.some(q => entry.tokens.has(q));
    const score = matched * 10 + (allMatched ? 5 : 0) + (exactTitle ? 2 : 0);
    scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score || (KIND_RANK.get(a.entry.kind) - KIND_RANK.get(b.entry.kind)) || a.entry.title.localeCompare(b.entry.title) || a.entry.id.localeCompare(b.entry.id));

  const results = scored.slice(0, 50).map(({ entry, score }) => ({
    id: entry.id, kind: entry.kind, title: entry.title, subtitle: entry.subtitle ?? null, score,
    target: entry.target, ref: entry.ref, date: entry.date ?? null, place: entry.place ?? null,
    mediaRefs: entry.mediaRefs ?? [], ...(entry.earned !== undefined ? { earned: entry.earned } : {}),
  }));

  // --- grouping + derived reference sets ------------------------------------
  const groupMap = new Map();
  for (const r of results) { if (!groupMap.has(r.kind)) groupMap.set(r.kind, []); groupMap.get(r.kind).push(r); }
  const grouped = [...groupMap.entries()].sort((a, b) => KIND_RANK.get(a[0]) - KIND_RANK.get(b[0])).map(([kind, items]) => ({ kind, count: items.length, results: items }));
  const matchedSections = grouped.map(g => g.kind);

  const navTargetSet = new Map();
  for (const r of results) { const ex = r.target?.experience; if (ex && navNodeById.get(ex) && !navTargetSet.has(ex)) navTargetSet.set(ex, { experience: ex, deepLink: navNodeById.get(ex).deepLink }); }
  const navigationTargets = [...navTargetSet.values()];
  const experienceTargets = results.filter(r => r.kind === 'experience').map(r => ({ experience: r.ref.id, deepLink: r.target.deepLink }));
  const timelineAnchors = results.filter(r => r.date).map(r => ({ id: r.id, date: r.date, experience: r.target?.experience ?? null, deepLink: r.target?.deepLink ?? null }));
  const mapSeen = new Map();
  for (const r of results) if (r.place && !mapSeen.has(r.place)) mapSeen.set(r.place, { place: r.place, isIsland: islandNames.has(r.place) });
  const mapReferences = [...mapSeen.values()];
  const mediaReferences = [...new Set(results.flatMap(r => r.mediaRefs))];
  const byKind = {}; for (const r of results) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;

  return {
    version: SEARCH_VERSION, query: rawQuery, hasQuery: true,
    matchedSections, grouped, results,
    navigationTargets, experienceTargets, timelineAnchors, mapReferences, mediaReferences,
    statistics: { total: results.length, byKind },
    emptyState: results.length ? null : { kind: 'no-results', title: `No results for “${rawQuery}”`, subtitle: 'Try a country, companion, activity or year', suggestions: [] },
    basedOn: world.basedOn,
  };
}
