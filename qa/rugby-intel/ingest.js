/**
 * Rugby Intelligence Ingestion Engine
 *
 * Orchestrates: providers → classify → summarize → knowledge-db
 *
 * Each item goes through:
 *   1. Provider yields RawContent { text, filePath, source, provider }
 *   2. classify.js tags categories, flags, age group (pure heuristics, zero cost)
 *   3. summarize.js enriches with summary + takeaway (Claude or heuristic)
 *   4. knowledge-db.appendItem() writes the KnowledgeItem to JSONL
 *
 * Idempotent: already-ingested files are skipped (checked by filePath).
 */

import { makeId, appendItem, alreadyIngested, stats } from './knowledge-db.js';
import { classify } from './classify.js';
import { extractKnowledge } from './summarize.js';
import { extractDate, truncate } from './normalize.js';
import { getProvider, listProviders, DEFAULT_PROVIDERS } from './providers/index.js';

/**
 * Ingest content from one or more providers.
 *
 * @param {object} options
 * @param {string[]} options.providers   — provider keys to run (default: all)
 * @param {boolean} options.dryRun       — log what would happen without writing
 * @param {boolean} options.forceReingest— re-ingest already-seen files
 * @returns {object} session stats
 */
export async function ingest({
  providers = DEFAULT_PROVIDERS,
  dryRun = false,
  forceReingest = false,
} = {}) {
  const session = {
    startedAt: new Date().toISOString(),
    providers,
    stats: { seen: 0, ingested: 0, skipped: 0, errors: 0 },
    newItems: [],
  };

  for (const providerKey of providers) {
    let providerCount = 0;
    let provider;
    try {
      provider = getProvider(providerKey);
    } catch (err) {
      console.warn(`  ⚠️  ${err.message}`);
      session.stats.errors++;
      continue;
    }

    console.log(`── ${provider.meta.displayName} ─────────────────────────────`);

    for await (const raw of provider.provide()) {
      session.stats.seen++;

      if (!forceReingest && alreadyIngested(raw.filePath)) {
        session.stats.skipped++;
        continue;
      }

      try {
        // Step 1: Classify (pure heuristics)
        const preClass = classify(raw.text, raw.provider);

        // Respect provider-forced categories (e.g., law-update-provider forces law-update)
        if (raw._forceCategory && !preClass.categories.includes(raw._forceCategory)) {
          preClass.categories.unshift(raw._forceCategory);
          if (raw._forceCategory === 'law-update') preClass.isLawUpdate = true;
          if (raw._forceCategory === 'drill') preClass.isPractical = true;
        }

        // Step 2: Extract knowledge (Claude or heuristic)
        const extraction = await extractKnowledge(raw.text, raw.filePath, preClass);

        // Step 3: Build final KnowledgeItem
        const item = {
          id: makeId(),
          title: extraction.title,
          source: raw.source,
          date: extractDate(raw.text) || raw.mtime?.slice(0, 10) || null,
          ingestedAt: new Date().toISOString(),

          summary: extraction.summary,
          takeaway: extraction.takeaway,

          categories: extraction.categories,
          ageGroup: extraction.ageGroup,
          coachingLevel: extraction.coachingLevel,

          isLawUpdate: extraction.isLawUpdate,
          isSafetyAlert: extraction.isSafetyAlert,
          isTactical: extraction.isTactical,
          isPractical: extraction.isPractical,

          country: extraction.country,
          competition: extraction.competition,
          keywords: extraction.keywords,

          confidence: extraction.confidence,
          analysisMode: extraction.analysisMode,
          provider: raw.provider,
          filePath: raw.filePath,
        };

        if (!dryRun) {
          appendItem(item);
        }

        session.stats.ingested++;
        session.newItems.push(item);
        providerCount++;

        const modeIcon = extraction.analysisMode.startsWith('claude') ? '🤖' : '⚙️';
        const flags = [
          item.isLawUpdate && '📜 LAW',
          item.isSafetyAlert && '🛡️ SAFETY',
        ].filter(Boolean).join(' ');
        console.log(`  ${modeIcon} ${item.title.slice(0, 60)}${flags ? `  ${flags}` : ''}`);
      } catch (err) {
        session.stats.errors++;
        console.warn(`  ⚠️  Error processing ${raw.filePath}: ${err.message}`);
      }
    }

    if (providerCount === 0) {
      console.log(`  (no new files in ${provider.meta.inputDir})`);
    }
  }

  session.completedAt = new Date().toISOString();
  return session;
}
