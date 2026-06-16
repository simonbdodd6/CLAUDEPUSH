// Travel App — Experience Design Tokens (M37).
//
// Maps the shared Experience Presentation contract (M36) into DETERMINISTIC,
// platform-neutral visual guidance for future SwiftUI screens. This is NOT UI,
// NOT CSS, NOT animation code and NOT AI design generation — it is a static,
// serialisable token system + per-experience identity, built purely from fixed
// enums and deterministic mappings.
//
// NO AI, NO randomness, NO networking, NO platform-specific code. Pure functions;
// deterministic; offline-first; reuses the contract's enums (single source of
// truth); no platform change; no backend leak.

import { SECTION_LAYOUTS, CARD_KINDS, EMPHASIS, EXPERIENCES } from './experience-presentation.js';

export const TOKENS_VERSION = '1.0.0';
export const MOODS = Object.freeze(['celebratory', 'nostalgic', 'curated', 'intimate', 'cinematic']);

// --- palette (semantic accents → fixed swatches) ---------------------------
// hex values are data (design tokens), not styling code; deterministic & fixed.
export const PALETTE = Object.freeze({
  sky: { token: 'sky', hex: '#4FA3D1', on: '#FFFFFF', role: 'accent' },
  ocean: { token: 'ocean', hex: '#1C7C8C', on: '#FFFFFF', role: 'accent' },
  sand: { token: 'sand', hex: '#E2C290', on: '#1C2126', role: 'accent' },
  sunset: { token: 'sunset', hex: '#E8835A', on: '#FFFFFF', role: 'accent' },
  dusk: { token: 'dusk', hex: '#6C5B7B', on: '#FFFFFF', role: 'accent' },
  slate: { token: 'slate', hex: '#5A6B7B', on: '#FFFFFF', role: 'accent' },
  forest: { token: 'forest', hex: '#3E7C59', on: '#FFFFFF', role: 'accent' },
  gold: { token: 'gold', hex: '#D4AF37', on: '#1C2126', role: 'accent' },
  ink: { token: 'ink', hex: '#1C2126', on: '#FFFFFF', role: 'neutral' },
  surface: { token: 'surface', hex: '#FFFFFF', on: '#1C2126', role: 'neutral' },
  surfaceAlt: { token: 'surfaceAlt', hex: '#F4F6F8', on: '#1C2126', role: 'neutral' },
  muted: { token: 'muted', hex: '#8A98A6', on: '#FFFFFF', role: 'neutral' },
  line: { token: 'line', hex: '#E1E6EB', on: '#1C2126', role: 'neutral' },
});

const TYPOGRAPHY = Object.freeze({
  display: { token: 'display', size: 34, weight: 'bold', tracking: 0.2, lineHeight: 40 },
  title: { token: 'title', size: 22, weight: 'semibold', tracking: 0, lineHeight: 28 },
  headline: { token: 'headline', size: 17, weight: 'semibold', tracking: 0, lineHeight: 22 },
  body: { token: 'body', size: 15, weight: 'regular', tracking: 0, lineHeight: 20 },
  caption: { token: 'caption', size: 13, weight: 'medium', tracking: 0.2, lineHeight: 16 },
  overline: { token: 'overline', size: 11, weight: 'semibold', tracking: 1.0, lineHeight: 14 },
});
const SPACING = Object.freeze({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 });
const RADII = Object.freeze({ sm: 6, md: 10, lg: 16, card: 20, pill: 999 });
const ELEVATION = Object.freeze({ flat: { level: 0, shadow: 0 }, raised: { level: 1, shadow: 0.08 }, floating: { level: 2, shadow: 0.16 } });

// --- section layout guidance (per SECTION_LAYOUTS) -------------------------
const LAYOUTS = Object.freeze({
  hero: { columns: 1, scroll: 'vertical', cardStyle: 'full', snap: false, spacing: 'lg', connector: false },
  deck: { columns: 1, scroll: 'paged', cardStyle: 'page', snap: true, spacing: 'none', connector: false },
  grid: { columns: 2, scroll: 'vertical', cardStyle: 'tile', snap: false, spacing: 'md', connector: false },
  list: { columns: 1, scroll: 'vertical', cardStyle: 'row', snap: false, spacing: 'sm', connector: false },
  carousel: { columns: 1, scroll: 'horizontal', cardStyle: 'tile', snap: true, spacing: 'md', connector: false },
  'stat-grid': { columns: 2, scroll: 'vertical', cardStyle: 'stat', snap: false, spacing: 'md', connector: false },
  timeline: { columns: 1, scroll: 'vertical', cardStyle: 'row', snap: false, spacing: 'md', connector: true },
});

// --- card treatment (per CARD_KINDS, modulated by EMPHASIS) ----------------
const CARD_BASE = Object.freeze({
  stat: { surface: 'tinted', accentUsage: 'text', density: 'compact', showMedia: false, titleType: 'caption', valueType: 'title' },
  highlight: { surface: 'tinted', accentUsage: 'chip', density: 'comfortable', showMedia: true, titleType: 'headline', valueType: null },
  moment: { surface: 'solid', accentUsage: 'border', density: 'comfortable', showMedia: true, titleType: 'headline', valueType: null },
  memory: { surface: 'solid', accentUsage: 'text', density: 'comfortable', showMedia: true, titleType: 'headline', valueType: null },
  collection: { surface: 'glass', accentUsage: 'background', density: 'comfortable', showMedia: true, titleType: 'title', valueType: null },
  scene: { surface: 'glass', accentUsage: 'overlay', density: 'spacious', showMedia: true, titleType: 'title', valueType: null },
  story: { surface: 'solid', accentUsage: 'border', density: 'comfortable', showMedia: true, titleType: 'headline', valueType: null },
  achievement: { surface: 'tinted', accentUsage: 'chip', density: 'comfortable', showMedia: false, titleType: 'headline', valueType: null },
  transition: { surface: 'tinted', accentUsage: 'text', density: 'compact', showMedia: false, titleType: 'body', valueType: null },
  year: { surface: 'tinted', accentUsage: 'text', density: 'compact', showMedia: false, titleType: 'title', valueType: 'title' },
});
const CARD_DEFAULTS = Object.freeze({ radius: 'card', elevation: 'raised', mediaShape: 'rounded', scale: 1.0 });
const EMPHASIS_MODS = Object.freeze({
  low: { elevation: 'flat', density: 'compact', scale: 0.96 },
  normal: {},
  high: { elevation: 'raised', scale: 1.0 },
  hero: { surface: 'glass', elevation: 'floating', density: 'spacious', mediaShape: 'fill', scale: 1.06 },
});

/** Deterministically resolve the visual treatment for a card. */
export function cardTreatment(kind, emphasis = 'normal') {
  const base = CARD_BASE[kind] ?? CARD_BASE.memory;
  const mod = EMPHASIS_MODS[emphasis] ?? {};
  return { kind, emphasis, ...CARD_DEFAULTS, ...base, ...mod };
}

// --- element treatments ----------------------------------------------------
const HERO = Object.freeze({ height: 'tall', overlay: 'gradient-bottom', titleType: 'display', subtitleType: 'headline', mediaShape: 'fill', accentUsage: 'overlay-tint', showMap: true });
const TIMELINE = Object.freeze({ connector: true, anchorStyle: 'dot', dateFormat: 'relative', groupBy: 'year', density: 'comfortable', accentUsage: 'connector' });
const STATISTIC = Object.freeze({ layout: 'stat-grid', columns: 2, valueType: 'title', labelType: 'caption', iconPlacement: 'top', accentUsage: 'text' });
const MEDIA = Object.freeze({ defaultShape: 'rounded', aspect: '4:3', placeholder: 'gradient', loading: 'reference-only', maxPerCard: 6 });
const MAP = Object.freeze({ style: 'muted', markerStyle: 'pin', islandMarker: 'ring', granularity: 'region', showRoutes: true, accentUsage: 'marker' });
const ACHIEVEMENT = Object.freeze({
  Bronze: { tier: 'Bronze', swatch: 'sand', glow: false, badgeShape: 'shield', emphasis: 'normal' },
  Silver: { tier: 'Silver', swatch: 'slate', glow: false, badgeShape: 'shield', emphasis: 'normal' },
  Gold: { tier: 'Gold', swatch: 'gold', glow: true, badgeShape: 'shield', emphasis: 'high' },
  Platinum: { tier: 'Platinum', swatch: 'sky', glow: true, badgeShape: 'shield', emphasis: 'high' },
  Legend: { tier: 'Legend', swatch: 'sunset', glow: true, badgeShape: 'crest', emphasis: 'hero' },
});
const EMPTY_STATE = Object.freeze({ illustration: 'compass', titleType: 'headline', bodyType: 'body', accentUsage: 'muted', cta: 'encourage' });

// --- per-experience identity ----------------------------------------------
const IDENTITY = Object.freeze({
  wrapped: { id: 'wrapped', accent: 'sunset', secondaryAccent: 'gold', icon: 'sparkles', mood: 'celebratory', gradient: ['sunset', 'dusk'], heroLayout: 'hero' },
  'on-this-day': { id: 'on-this-day', accent: 'dusk', secondaryAccent: 'sky', icon: 'calendar', mood: 'nostalgic', gradient: ['dusk', 'slate'], heroLayout: 'hero' },
  collections: { id: 'collections', accent: 'ocean', secondaryAccent: 'sand', icon: 'grid', mood: 'curated', gradient: ['ocean', 'sky'], heroLayout: 'hero' },
  story: { id: 'story', accent: 'dusk', secondaryAccent: 'sunset', icon: 'book', mood: 'intimate', gradient: ['dusk', 'ink'], heroLayout: 'hero' },
  cinematic: { id: 'cinematic', accent: 'slate', secondaryAccent: 'sunset', icon: 'film', mood: 'cinematic', gradient: ['ink', 'slate'], heroLayout: 'hero' },
});
const EXPERIENCE_IDS = new Set(EXPERIENCES.map(e => e.id));

/** The full, static design-token system (deterministic, serialisable). */
export function getDesignTokens() {
  return {
    version: TOKENS_VERSION,
    palette: PALETTE,
    typography: TYPOGRAPHY,
    spacing: SPACING,
    radii: RADII,
    elevation: ELEVATION,
    layouts: LAYOUTS,
    cards: { byKind: CARD_BASE, defaults: CARD_DEFAULTS, emphasisModifiers: EMPHASIS_MODS },
    hero: HERO,
    timeline: TIMELINE,
    statistic: STATISTIC,
    media: MEDIA,
    map: MAP,
    achievement: ACHIEVEMENT,
    emptyState: EMPTY_STATE,
    moods: MOODS,
    enums: { sectionLayouts: SECTION_LAYOUTS, cardKinds: CARD_KINDS, emphasis: EMPHASIS },
  };
}

const swatch = (token) => PALETTE[token] ?? null;

/** Per-experience design tokens: identity (with resolved swatches) + system. */
export function buildExperienceTokens(name) {
  if (!EXPERIENCE_IDS.has(name)) {
    const err = new Error(`Unknown experience "${name}"`); err.code = 'UNKNOWN_EXPERIENCE'; throw err;
  }
  const ident = IDENTITY[name];
  const meta = EXPERIENCES.find(e => e.id === name);
  return {
    experience: name,
    identity: {
      ...ident,
      title: meta.title, subtitle: meta.subtitle,
      accentSwatch: swatch(ident.accent),
      secondarySwatch: swatch(ident.secondaryAccent),
      gradientSwatches: ident.gradient.map(swatch),
    },
    hero: HERO, timeline: TIMELINE, statistic: STATISTIC, media: MEDIA, map: MAP,
    achievement: ACHIEVEMENT, emptyState: EMPTY_STATE,
    system: { version: TOKENS_VERSION, layouts: LAYOUTS, cards: { byKind: CARD_BASE, defaults: CARD_DEFAULTS, emphasisModifiers: EMPHASIS_MODS }, palette: PALETTE },
  };
}

/** List the experience identities (lightweight index). */
export function listExperienceIdentities() {
  return EXPERIENCES.map(e => ({ ...e, ...IDENTITY[e.id], accentSwatch: swatch(IDENTITY[e.id].accent) }));
}
