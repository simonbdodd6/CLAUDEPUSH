/**
 * Engine Registry Bootstrap
 * Imports all engine adapters so they self-register with the tool registry.
 * Import this once before using the Copilot.
 */

// Each adapter self-registers via registerTool() at import time.
// Import order determines priority tie-breaking (earlier = higher priority in ties).

import './memory-engine-adapter.js';
import './club-intelligence-adapter.js';   // highest-level — runs before player-dev for squad queries
import './coaching-engine-adapter.js';
import './player-development-adapter.js';
import './workflow-engine-adapter.js';          // execution layer — chains actions into workflows
import './communications-engine-adapter.js';   // club communications — newsletters, match reports, sponsors, social media
import './rugby-knowledge-adapter.js';
import './discovery-adapter.js';
import './market-intel-adapter.js';
import './lead-personalisation-adapter.js';

export { listTools, registryStats, getTool, getCapable } from '../tool-registry.js';
