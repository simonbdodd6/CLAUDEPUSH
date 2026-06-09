/**
 * Rugby Knowledge Database
 *
 * Storage format: JSONL (JSON Lines) — one KnowledgeItem per line.
 * Chosen for: append-only writes, zero external deps, streamable at 100k+ items.
 *
 * KnowledgeItem schema:
 * {
 *   id: string,
 *   title: string,
 *   source: string,          // filename or URL
 *   date: ISO string | null, // publication date if known
 *   ingestedAt: ISO string,
 *
 *   summary: string,         // 2–3 sentence summary
 *   takeaway: string,        // one actionable coaching point
 *
 *   categories: string[],    // from CATEGORIES constant below
 *   ageGroup: string[],      // 'all' | 'youth' | 'senior' | 'mini'
 *   coachingLevel: string[], // 'all' | 'beginner' | 'intermediate' | 'advanced' | 'elite'
 *
 *   isLawUpdate: boolean,
 *   isSafetyAlert: boolean,
 *   isTactical: boolean,
 *   isPractical: boolean,    // contains drills or exercises
 *
 *   country: string | null,
 *   competition: string | null,
 *   keywords: string[],
 *
 *   confidence: number,      // 0.0–1.0 extraction quality
 *   analysisMode: string,    // 'claude' | 'heuristic'
 *   provider: string,
 *   filePath: string,
 * }
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../');
const KB_DIR = join(ROOT, 'qa/rugby-knowledge');
const KB_FILE = join(KB_DIR, 'knowledge.jsonl');

export const CATEGORIES = [
  'law-update', 'safety', 'attack', 'defence', 'kicking',
  'set-piece', 'breakdown', 'contact-skills', 'youth', 'sc',
  'team-culture', 'match-analysis', 'drill', 'philosophy',
];

function ensure(dir) { mkdirSync(dir, { recursive: true }); }

export function makeId() {
  return `ki_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

export function appendItem(item) {
  ensure(KB_DIR);
  appendFileSync(KB_FILE, JSON.stringify(item) + '\n', 'utf8');
}

export function loadAll() {
  if (!existsSync(KB_FILE)) return [];
  return readFileSync(KB_FILE, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

export function findById(id) {
  return loadAll().find(item => item.id === id) ?? null;
}

export function alreadyIngested(filePath) {
  if (!existsSync(KB_FILE)) return false;
  const lines = readFileSync(KB_FILE, 'utf8').split('\n').filter(l => l.trim());
  return lines.some(l => {
    try { return JSON.parse(l).filePath === filePath; } catch { return false; }
  });
}

export function search({ categories, isLawUpdate, isSafetyAlert, isPractical, since, ageGroup } = {}) {
  let items = loadAll();

  if (since) {
    const cutoff = new Date(since).getTime();
    items = items.filter(i => new Date(i.ingestedAt).getTime() >= cutoff);
  }
  if (categories?.length) {
    items = items.filter(i => categories.some(c => (i.categories || []).includes(c)));
  }
  if (isLawUpdate != null) items = items.filter(i => i.isLawUpdate === isLawUpdate);
  if (isSafetyAlert != null) items = items.filter(i => i.isSafetyAlert === isSafetyAlert);
  if (isPractical != null) items = items.filter(i => i.isPractical === isPractical);
  if (ageGroup) items = items.filter(i => (i.ageGroup || []).includes(ageGroup) || (i.ageGroup || []).includes('all'));

  return items.sort((a, b) => new Date(b.ingestedAt) - new Date(a.ingestedAt));
}

export function stats() {
  const items = loadAll();
  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const oneMonth = 30 * 24 * 60 * 60 * 1000;

  const categoryCounts = {};
  CATEGORIES.forEach(c => { categoryCounts[c] = 0; });
  items.forEach(i => (i.categories || []).forEach(c => {
    categoryCounts[c] = (categoryCounts[c] || 0) + 1;
  }));

  return {
    total: items.length,
    thisWeek: items.filter(i => now - new Date(i.ingestedAt).getTime() < oneWeek).length,
    thisMonth: items.filter(i => now - new Date(i.ingestedAt).getTime() < oneMonth).length,
    lawUpdates: items.filter(i => i.isLawUpdate).length,
    safetyAlerts: items.filter(i => i.isSafetyAlert).length,
    drills: items.filter(i => i.isPractical).length,
    categoryCounts,
    byMode: {
      claude: items.filter(i => i.analysisMode === 'claude').length,
      heuristic: items.filter(i => i.analysisMode === 'heuristic').length,
    },
  };
}

export function rebuildSummaryJSON() {
  const items = loadAll();
  const s = stats();
  const recent = items.slice(-20).reverse();

  const topByCategory = CATEGORIES.map(c => ({
    category: c, count: s.categoryCounts[c] || 0,
  })).sort((a, b) => b.count - a.count).slice(0, 8);

  const topCoachingIdeas = items
    .filter(i => i.isTactical || i.isPractical)
    .sort((a, b) => new Date(b.ingestedAt) - new Date(a.ingestedAt))
    .slice(0, 5)
    .map(i => ({ title: i.title, takeaway: i.takeaway, categories: i.categories }));

  const lawUpdates = items.filter(i => i.isLawUpdate)
    .sort((a, b) => new Date(b.ingestedAt) - new Date(a.ingestedAt))
    .slice(0, 3)
    .map(i => ({ title: i.title, summary: i.summary, ingestedAt: i.ingestedAt }));

  const safetyAlerts = items.filter(i => i.isSafetyAlert)
    .sort((a, b) => new Date(b.ingestedAt) - new Date(a.ingestedAt))
    .slice(0, 3)
    .map(i => ({ title: i.title, takeaway: i.takeaway, ingestedAt: i.ingestedAt }));

  // Recommended training focus = top category from last 30 days
  const recentItems = items.filter(i => Date.now() - new Date(i.ingestedAt).getTime() < 30 * 86400000);
  const recentCatCounts = {};
  recentItems.forEach(i => (i.categories || []).forEach(c => {
    recentCatCounts[c] = (recentCatCounts[c] || 0) + 1;
  }));
  const recommendedFocus = Object.entries(recentCatCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const summary = {
    generatedAt: new Date().toISOString(),
    totalItems: s.total,
    itemsThisWeek: s.thisWeek,
    itemsThisMonth: s.thisMonth,
    lawUpdates: s.lawUpdates,
    safetyAlerts: s.safetyAlerts,
    drills: s.drills,
    topCategories: topByCategory,
    topCoachingIdeas,
    recentLawUpdates: lawUpdates,
    recentSafetyAlerts: safetyAlerts,
    recommendedFocus,
    recentItems: recent.slice(0, 10).map(i => ({
      title: i.title, categories: i.categories, ingestedAt: i.ingestedAt,
    })),
    analysisMode: s.byMode.claude > 0 ? `Claude + heuristic` : 'heuristic',
  };

  ensure(KB_DIR);
  writeFileSync(join(KB_DIR, 'rugby-intel-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  return summary;
}
