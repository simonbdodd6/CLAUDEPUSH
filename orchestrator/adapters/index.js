/**
 * Adapter Bootstrap
 *
 * Import this once to self-register all 10 engine adapters.
 * Each adapter calls registerEngine() at import time.
 * No adapter knows about any other adapter.
 */

import './memory-engine.js';
import './coaching-engine.js';
import './player-development.js';
import './rugby-knowledge.js';
import './discovery-agent.js';
import './market-intel.js';
import './lead-personalisation.js';
import './ai-copilot.js';
import './workflow-engine.js';
import './club-intelligence.js';

export { registryStats, listEngines } from '../engine-registry.js';
