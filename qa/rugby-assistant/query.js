/**
 * Rugby Knowledge Retrieval Engine
 *
 * Keyword-based relevance scoring against the JSONL knowledge base.
 * No external dependencies, no API calls — pure scoring.
 *
 * Scoring weights:
 *   title match     → +3 per query token
 *   keyword match   → +2 per query token
 *   summary match   → +1.5 per query token
 *   takeaway match  → +1 per query token
 *   category match  → +4 if query implies a category
 *   age group match → +3 if query specifies age grade
 * Final score is multiplied by (0.5 + confidence * 0.5) to surface higher-quality items.
 */

import { loadAll } from '../rugby-intel/knowledge-db.js';

const STOP = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'are', 'was', 'how',
  'what', 'when', 'where', 'who', 'why', 'can', 'should', 'would',
  'does', 'will', 'have', 'has', 'had', 'not', 'but', 'from', 'into',
  'over', 'under', 'about', 'out', 'use', 'used', 'using', 'some',
]);

const CATEGORY_ALIASES = {
  ruck: 'breakdown', ruck: 'breakdown', rucking: 'breakdown',
  jackal: 'breakdown', jackalling: 'breakdown', jackaling: 'breakdown',
  cleanout: 'breakdown', breakdown: 'breakdown',
  scrum: 'set-piece', scrummage: 'set-piece', lineout: 'set-piece',
  maul: 'set-piece', 'set-piece': 'set-piece', lifting: 'set-piece',
  tackle: 'contact-skills', tackling: 'contact-skills', contact: 'contact-skills',
  carrying: 'contact-skills', collisions: 'contact-skills',
  kick: 'kicking', kicking: 'kicking', grubber: 'kicking', chip: 'kicking',
  attack: 'attack', attacking: 'attack', backline: 'attack', overlap: 'attack',
  offload: 'attack', offloads: 'attack',
  defence: 'defence', defense: 'defence', defensive: 'defence',
  blitz: 'defence', drift: 'defence', 'line-speed': 'defence',
  law: 'law-update', laws: 'law-update', rule: 'law-update',
  regulation: 'law-update', directive: 'law-update',
  safety: 'safety', concussion: 'safety', welfare: 'safety', injury: 'safety',
  drill: 'drill', drills: 'drill', exercise: 'drill', session: 'drill',
  fitness: 'sc', strength: 'sc', conditioning: 'sc', gym: 'sc',
  culture: 'team-culture', leadership: 'team-culture',
  youth: 'youth', junior: 'youth', mini: 'youth', minis: 'youth',
  philosophy: 'philosophy', principles: 'philosophy',
};

const AGE_PATTERNS = [
  { re: /\bu(\d+)\b/i,       map: m => `u${m[1]}` },
  { re: /under[\s-]*(\d+)/i, map: m => `u${m[1]}` },
  { re: /\b(minis?)\b/i,     map: () => 'mini' },
  { re: /\bseniors?\b/i,     map: () => 'senior' },
];

export function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(t => t.length > 2 && !STOP.has(t));
}

export function detectAgeGroup(query) {
  for (const { re, map } of AGE_PATTERNS) {
    const m = query.match(re);
    if (m) return map(m);
  }
  return null;
}

function ageMatches(item, agQuery) {
  if (!agQuery) return 0;
  const groups = item.ageGroup || [];
  if (groups.includes('all')) return 1;
  const num = parseInt(agQuery.replace('u', ''));
  if (agQuery === 'mini' && groups.includes('mini')) return 3;
  if (agQuery === 'senior' && groups.includes('senior')) return 3;
  if (!isNaN(num)) {
    if (num <= 10 && groups.includes('mini')) return 3;
    if (num >= 12 && num <= 18 && groups.includes('youth')) return 3;
    if (num >= 20 && groups.includes('senior')) return 3;
  }
  return 0;
}

function scoreItem(item, tokens, impliedCats, ageGroup) {
  const title    = (item.title    || '').toLowerCase();
  const summary  = (item.summary  || '').toLowerCase();
  const takeaway = (item.takeaway || '').toLowerCase();
  const kwds     = (item.keywords || []).map(k => k.toLowerCase());
  const cats     = item.categories || [];

  let s = 0;
  for (const t of tokens) {
    if (title.includes(t))            s += 3;
    if (kwds.some(k => k.includes(t))) s += 2;
    if (summary.includes(t))           s += 1.5;
    if (takeaway.includes(t))          s += 1;
    if (cats.some(c => c.includes(t))) s += 1;
  }

  for (const c of impliedCats) {
    if (cats.includes(c)) s += 4;
  }

  s += ageMatches(item, ageGroup) * 1.5;
  s *= (0.5 + (item.confidence || 0.5) * 0.5);
  return s;
}

/**
 * Retrieve knowledge base items relevant to a query.
 *
 * @param {string} query
 * @param {{ limit?: number, filterPractical?: boolean, filterLaw?: boolean, ageGroup?: string }} opts
 * @returns {{ items, detectedCategories, detectedAgeGroup, totalMatches, knowledgeBaseSize }}
 */
export function retrieveRelevant(query, opts = {}) {
  const { limit = 5, filterPractical, filterLaw, ageGroup: forceAge } = opts;
  const tokens       = tokenize(query);
  const impliedCats  = [...new Set(tokens.map(t => CATEGORY_ALIASES[t]).filter(Boolean))];
  const detectedAge  = forceAge || detectAgeGroup(query);

  let items = loadAll();
  if (filterPractical) items = items.filter(i => i.isPractical);
  if (filterLaw)       items = items.filter(i => i.isLawUpdate);

  const scored = items
    .map(item => ({ item, s: scoreItem(item, tokens, impliedCats, detectedAge) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s);

  return {
    items: scored.slice(0, limit).map(x => x.item),
    allScored: scored,
    detectedCategories: impliedCats,
    detectedAgeGroup: detectedAge,
    totalMatches: scored.length,
    knowledgeBaseSize: items.length,
  };
}
