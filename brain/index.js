// brain/index.js
//
// Coach's Eye Intelligence — Brain public API.
//
// This is the ONLY file Core (or tests) should import from within the Brain.
// All Brain internals are accessed through their feature-specific index files,
// not directly. This file re-exports the stable public surface.
//
// Architecture constraints (AI_BRAIN_ARCHITECTURE.md):
//   • Brain never imports Core modules
//   • Brain reads exclusively from the Coach Experience API
//   • Every feature is gated by config (P7) before compute runs
//   • Errors always degrade gracefully — never surface to the coach (P1)

export {
  BRAIN_VERSION,
  TIER,
  defaultConfig,
  demoConfig,
  isFeatureEnabled,
  isIntelligenceEnabled,
  getTier,
  degradedEnvelope,
} from './config.js';

export {
  WEEKLY_BRIEF_VERSION,
  generateWeeklyBrief,
} from '../season-intelligence/weekly-brief.js';
