// Travel App — Traveller Passport Engine (M44).
//
// A compact, shareable traveller passport composed from the canonical profile
// (M42) and the complete traveller timeline (M43). It computes no new
// intelligence; it reshapes existing outputs into a presentation DTO: cover,
// stamps, pages, credentials and references. NO AI, NO generated prose, NO
// randomness, NO Date.now, NO networking. Pure; deterministic; offline-first;
// references only; no platform change; no backend leak.

import { buildProfile } from './profile.js';
import { buildTravellerTimeline } from './traveller-timeline.js';

export const PASSPORT_VERSION = '1.0.0';
export const PASSPORT_STAMP_TYPES = Object.freeze([
  'trip', 'country', 'island', 'city', 'flight', 'ferry', 'transport',
  'border-crossing', 'dive', 'surf', 'achievement', 'return',
]);

const STAMP_TYPE_RANK = new Map(PASSPORT_STAMP_TYPES.map((t, i) => [t, i]));

const typeIcon = {
  trip: 'suitcase',
  country: 'flag',
  island: 'island',
  city: 'city',
  flight: 'airplane',
  ferry: 'ferry',
  transport: 'route',
  'border-crossing': 'passport',
  dive: 'dive',
  surf: 'wave',
  achievement: 'trophy',
  return: 'repeat',
};

const typeAccent = {
  trip: 'sand',
  country: 'sky',
  island: 'ocean',
  city: 'slate',
  flight: 'sky',
  ferry: 'ocean',
  transport: 'slate',
  'border-crossing': 'dusk',
  dive: 'ocean',
  surf: 'sunset',
  achievement: 'gold',
  return: 'forest',
};

const labelForType = (type) => type.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join(' ');

function statistic(profile, id) {
  return profile.statistics.items.find(item => item.id === id)?.value ?? 0;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function toStamp(entry, index) {
  return {
    id: `passport-stamp-${index}`,
    orderingIndex: index,
    type: entry.type,
    label: entry.title,
    subtitle: entry.subtitle,
    date: entry.date,
    icon: typeIcon[entry.type] ?? 'stamp',
    accent: typeAccent[entry.type] ?? 'slate',
    locationRefs: entry.locationRefs,
    companionRefs: entry.companionRefs,
    mediaRefs: entry.mediaRefs,
    achievementRefs: entry.achievementRefs,
    ref: entry.ref,
    deepLink: entry.navigationTarget.deepLink,
  };
}

export function buildPassport(events, trips = [], options = {}) {
  const referenceDate = options.referenceDate ?? '1970-01-01';
  const profile = buildProfile(events, trips, { referenceDate });
  const travellerTimeline = buildTravellerTimeline(events, trips);

  if (!profile.hasProfile || !travellerTimeline.entries.length) {
    return {
      version: PASSPORT_VERSION,
      referenceDate,
      hasPassport: false,
      cover: null,
      identity: null,
      credentials: {
        countries: 0, islands: 0, cities: 0, travelDays: 0,
        memories: 0, achievements: 0, timelineEntries: 0, years: 0,
      },
      stamps: [],
      pages: [],
      highlights: { first: null, latest: null, recent: [], transport: [] },
      references: { media: [], map: [], achievements: [] },
      actions: [{ id: 'capture', label: 'Add a memory', deepLink: 'travelapp://capture', icon: 'plus' }],
      emptyState: {
        title: 'Your travel passport',
        subtitle: 'Capture memories to start collecting stamps',
        icon: 'passport',
        cta: { id: 'capture', label: 'Add a memory', deepLink: 'travelapp://capture' },
      },
      meta: { generatedFrom: ['profile', 'traveller-timeline'] },
      basedOn: travellerTimeline.basedOn,
    };
  }

  const stampEntries = travellerTimeline.entries
    .filter(entry => PASSPORT_STAMP_TYPES.includes(entry.type))
    .sort((a, b) => a.date.localeCompare(b.date)
      || (STAMP_TYPE_RANK.get(a.type) - STAMP_TYPE_RANK.get(b.type))
      || String(a.ref.id).localeCompare(String(b.ref.id)));
  const stamps = stampEntries.map(toStamp);

  const stampByEntryRef = new Map(stamps.map(stamp => [`${stamp.ref.type}:${stamp.ref.id}`, stamp]));
  const pageMap = new Map();
  for (const stamp of stamps) {
    const year = Number(stamp.date.slice(0, 4));
    if (!pageMap.has(year)) pageMap.set(year, []);
    pageMap.get(year).push(stamp);
  }
  const pages = [...pageMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, yearStamps]) => ({
      year,
      count: yearStamps.length,
      stampIds: yearStamps.map(stamp => stamp.id),
      types: unique(yearStamps.map(stamp => stamp.type)).map(type => ({ type, label: labelForType(type) })),
    }));

  const firstEntry = travellerTimeline.entries[0];
  const latestEntry = travellerTimeline.entries[travellerTimeline.entries.length - 1];
  const recent = [...stamps].slice(-5).reverse().map(stamp => stamp.id);
  const transport = stamps.filter(stamp => ['flight', 'ferry', 'transport', 'border-crossing'].includes(stamp.type)).map(stamp => stamp.id);
  const matchingStamp = entry => stampByEntryRef.get(`${entry.ref.type}:${entry.ref.id}`)?.id ?? null;

  const cover = {
    title: profile.hero?.title ?? profile.identity?.favouritePlace ?? 'Travel Passport',
    subtitle: profile.identity?.signature ?? null,
    heroPlace: profile.identity?.favouritePlace ?? null,
    country: profile.identity?.mostVisitedCountry ?? null,
    mediaRef: profile.hero?.mediaRef ?? null,
    accent: profile.hero?.accent ?? 'sky',
    deepLink: 'travelapp://passport',
  };

  const credentials = {
    countries: statistic(profile, 'countries'),
    islands: statistic(profile, 'islands'),
    cities: statistic(profile, 'cities'),
    travelDays: statistic(profile, 'days'),
    memories: statistic(profile, 'memories'),
    achievements: profile.achievementSummary?.totalEarned ?? 0,
    timelineEntries: travellerTimeline.statistics.total,
    years: travellerTimeline.byYear.length,
  };

  const references = {
    media: unique([
      cover.mediaRef,
      ...profile.mediaReferences,
      ...stamps.flatMap(stamp => stamp.mediaRefs),
    ]),
    map: profile.mapReferences,
    achievements: unique([
      ...profile.achievementReferences.map(ref => ref.id),
      ...stamps.flatMap(stamp => stamp.achievementRefs),
    ]).map(id => ({ id })),
  };

  return {
    version: PASSPORT_VERSION,
    referenceDate,
    hasPassport: true,
    cover,
    identity: {
      since: profile.identity?.since ?? travellerTimeline.span.from,
      latest: profile.identity?.latest ?? travellerTimeline.span.to,
      favouritePlace: profile.identity?.favouritePlace ?? null,
      mostVisitedCountry: profile.identity?.mostVisitedCountry ?? null,
      signature: profile.identity?.signature ?? null,
    },
    credentials,
    stamps,
    pages,
    highlights: {
      first: firstEntry ? { entryId: firstEntry.id, stampId: matchingStamp(firstEntry), title: firstEntry.title, date: firstEntry.date } : null,
      latest: latestEntry ? { entryId: latestEntry.id, stampId: matchingStamp(latestEntry), title: latestEntry.title, date: latestEntry.date } : null,
      recent,
      transport,
    },
    references,
    actions: [
      { id: 'open-timeline', label: 'Open timeline', deepLink: 'travelapp://traveller-timeline', icon: 'timeline' },
      { id: 'open-profile', label: 'Open profile', deepLink: 'travelapp://profile', icon: 'person' },
    ],
    emptyState: null,
    meta: { generatedFrom: ['profile', 'traveller-timeline'] },
    basedOn: travellerTimeline.basedOn,
  };
}
