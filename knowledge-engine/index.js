// Coach's Eye Club Knowledge Engine — Public API
//
// The searchable knowledge layer for the entire club.
// Gives every AI feature structured, evidence-backed answers about any club domain.
//
// Usage:
//   import { ask, search, buildIndex } from './knowledge-engine/index.js';
//
//   const result = await ask("Show all injured props.");
//   console.log(result.answer);
//   console.log(result.data);
//   console.log(result.citations);

// Core ask interface
export { ask, formatAnswer } from './knowledge-answer.js';

// Index management
export {
  buildIndex, getIndex, refreshDomain, indexStats, getLastBuilt, DOMAINS,
} from './knowledge-index.js';

// Search
export { search, keywordSearch } from './knowledge-search.js';

// Query parsing
export { parseQuery, describeQuery, INTENTS } from './knowledge-query.js';

// Citations
export {
  cite, citeMany, dedupeCitations, formatCitations, citationSummary,
} from './knowledge-citations.js';

// Cache
export {
  get as cacheGet, set as cacheSet, has as cacheHas,
  invalidate as cacheInvalidate, clear as cacheClear, stats as cacheStats,
} from './knowledge-cache.js';

// History
export {
  logQuery, getRecentQueries, getQueryByIntent, getQueryStats, clearHistory,
} from './knowledge-history.js';

// Ranking
export {
  scoreResult, rankResults, topResult,
  sortByAttendanceMissed, sortByExpiryDate, sortByLastActive,
} from './knowledge-ranking.js';

// Health
export { checkHealth, formatHealth } from './knowledge-health.js';
