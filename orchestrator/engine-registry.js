/**
 * Orchestrator Engine Registry
 *
 * Engines self-register on import. No engine knows another engine exists.
 * The Orchestrator reads the registry to discover what's available.
 *
 * Engine descriptor:
 * {
 *   name:           string        — unique slug (e.g. 'coaching-engine')
 *   version:        string
 *   description:    string
 *   capabilities:   string[]      — what this engine can do (used by request analyser)
 *   optionalInputs: string[]      — context-bus keys this engine reads if present
 *   requiredInputs: string[]      — context-bus keys this engine MUST have to run
 *   outputs:        string[]      — context-bus keys this engine writes
 *   priority:       number        — higher = runs earlier within same phase
 *   alwaysRun:      boolean       — include in every orchestration (e.g. memory-engine)
 *   execute:        async (contextSnapshot, options) → EngineResult
 * }
 *
 * EngineResult:
 * {
 *   success:       boolean
 *   data:          any            — raw engine output
 *   contextWrites: object         — { key: value } to write to the context bus
 *   summary:       string         — one-line result description
 *   evidence:      string[]       — bullet points for the report
 *   warnings:      string[]
 * }
 */

const _registry = new Map();

// ── Registration ──────────────────────────────────────────────────────────────

export function registerEngine(descriptor) {
  const required = ['name', 'execute'];
  for (const k of required) {
    if (!descriptor[k]) throw new Error(`Engine registration missing required field: ${k}`);
  }
  if (typeof descriptor.execute !== 'function') {
    throw new Error(`Engine '${descriptor.name}' execute must be a function`);
  }

  const entry = {
    name:           descriptor.name,
    version:        descriptor.version        ?? '1.0.0',
    description:    descriptor.description    ?? '',
    capabilities:   descriptor.capabilities   ?? [],
    optionalInputs: descriptor.optionalInputs ?? [],
    requiredInputs: descriptor.requiredInputs ?? [],
    outputs:        descriptor.outputs        ?? [],
    priority:       descriptor.priority       ?? 50,
    alwaysRun:      descriptor.alwaysRun      ?? false,
    execute:        descriptor.execute,
  };

  _registry.set(descriptor.name, entry);
}

// ── Lookup ────────────────────────────────────────────────────────────────────

export function getEngine(name) {
  return _registry.get(name) ?? null;
}

export function getAllEngines() {
  return [..._registry.values()];
}

export function hasEngine(name) {
  return _registry.has(name);
}

/**
 * All engines that declare a given capability.
 */
export function getCapable(capability) {
  return [..._registry.values()].filter(e => e.capabilities.includes(capability));
}

/**
 * All engines that produce a specific context-bus key.
 */
export function getProducers(busKey) {
  return [..._registry.values()].filter(e => e.outputs.includes(busKey));
}

/**
 * All engines that consume a specific context-bus key (required or optional).
 */
export function getConsumers(busKey) {
  return [..._registry.values()].filter(
    e => e.requiredInputs.includes(busKey) || e.optionalInputs.includes(busKey)
  );
}

/**
 * Engines flagged alwaysRun: true.
 */
export function getAlwaysRunEngines() {
  return [..._registry.values()].filter(e => e.alwaysRun);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function registryStats() {
  const engines = [..._registry.values()];
  const allCapabilities = [...new Set(engines.flatMap(e => e.capabilities))];
  const allOutputs      = [...new Set(engines.flatMap(e => e.outputs))];

  return {
    totalEngines:    engines.length,
    engineNames:     engines.map(e => e.name),
    capabilities:    allCapabilities,
    contextBusKeys:  allOutputs,
    alwaysRunCount:  engines.filter(e => e.alwaysRun).length,
  };
}

export function listEngines() {
  return [..._registry.values()].map(e => ({
    name:         e.name,
    version:      e.version,
    description:  e.description,
    capabilities: e.capabilities,
    outputs:      e.outputs,
    priority:     e.priority,
    alwaysRun:    e.alwaysRun,
  }));
}
