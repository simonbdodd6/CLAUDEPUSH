// Coach's Eye Action Library — Public API
//
// Usage:
//   import { run, runFromNL, preview, listActions } from './actions/index.js';
//
//   // Natural language → action
//   const result = await runFromNL("Prepare Thursday's U14 training.", { role: 'coach' });
//
//   // Direct action execution
//   const result = await run('coaching.training_session', { ageGroup: 'U14', focus: 'lineout' }, { role: 'coach' });
//
//   // Preview what an action will do
//   const p = await preview('committee.agm_pack', {}, { role: 'chairperson' });
//
//   // Discover available actions
//   const myActions = listActions('COACHING');

// Core runner
export { run, runFromNL, preview, runBatch, listAvailableActions, listByCategory, historyStats } from './action-runner.js';

// Registry
export { getAction, listActions, searchActions, getActionCount, resolveFromNL, ALL_ACTIONS } from './action-registry.js';

// Categories
export { CATEGORIES, CATEGORY_IDS, getCategory, listCategories } from './action-categories.js';

// Permissions
export { ROLES, hasPermission, expandRole, buildPermissionMatrix, formatPermissionMatrix } from './action-permissions.js';

// History
export { logAction, getHistory, getHistoryByAction, getHistoryByCategory, getHistoryByRole, historyStats as getHistoryStats } from './action-history.js';

// Preview
export { previewAction, formatPreview } from './action-preview.js';

// ── Convenience namespace ─────────────────────────────────────────────────────

export const actions = {
  run:        async (id, params, ctx)   => { const { run } = await import('./action-runner.js'); return run(id, params, ctx); },
  ask:        async (text, ctx)         => { const { runFromNL } = await import('./action-runner.js'); return runFromNL(text, ctx); },
  preview:    async (id, params, ctx)   => { const { preview } = await import('./action-runner.js'); return preview(id, params, ctx); },
  list:       async (category)         => { const { listActions } = await import('./action-registry.js'); return listActions(category); },
  search:     async (text)             => { const { searchActions } = await import('./action-registry.js'); return searchActions(text); },
};
