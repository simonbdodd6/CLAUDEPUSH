/**
 * Tool Registry — Plugin system for the AI Copilot
 *
 * Each engine registers itself. The Copilot never knows engine implementation details.
 * All it knows is: name, description, capabilities[], execute().
 *
 * Registration contract:
 * {
 *   name:         string         — unique identifier
 *   version:      string         — semver
 *   description:  string         — one sentence
 *   capabilities: string[]       — intent types this engine handles
 *   requiredContext: string[]    — context keys this engine expects (optional)
 *   priority:     number         — higher = preferred (default: 50)
 *   execute:      async (intent, context, options) => ToolResult
 * }
 *
 * ToolResult shape:
 * {
 *   success:  boolean
 *   data:     any                — engine-specific output
 *   summary:  string             — one-line summary
 *   evidence: string[]           — facts used (for citation engine)
 *   error?:   string
 * }
 */

const _registry = new Map();

// ── Registration ──────────────────────────────────────────────────────────────

export function registerTool(descriptor) {
  const required = ['name', 'description', 'capabilities', 'execute'];
  for (const field of required) {
    if (!descriptor[field]) throw new Error(`Tool registration missing required field: '${field}'`);
  }
  if (typeof descriptor.execute !== 'function') {
    throw new Error(`Tool '${descriptor.name}': execute must be a function`);
  }
  _registry.set(descriptor.name, {
    version:         '1.0.0',
    requiredContext: [],
    priority:        50,
    ...descriptor,
    registeredAt: Date.now(),
  });
}

// ── Lookup ────────────────────────────────────────────────────────────────────

export function getTool(name) {
  return _registry.get(name) ?? null;
}

export function getCapable(intentType) {
  return [..._registry.values()]
    .filter(tool => tool.capabilities.includes(intentType) || tool.capabilities.includes('*'))
    .sort((a, b) => b.priority - a.priority);
}

export function getAllTools() {
  return [..._registry.values()];
}

export function listTools() {
  return getAllTools().map(t => ({
    name:         t.name,
    version:      t.version,
    description:  t.description,
    capabilities: t.capabilities,
    priority:     t.priority,
  }));
}

export function hasTool(name) {
  return _registry.has(name);
}

// ── Execution ─────────────────────────────────────────────────────────────────

export async function executeTool(name, intent, context = {}, options = {}) {
  const tool = getTool(name);
  if (!tool) return { success: false, error: `Tool '${name}' not registered`, data: null, summary: '', evidence: [] };

  const start = Date.now();
  try {
    const result = await tool.execute(intent, context, options);
    return {
      success:   true,
      toolName:  name,
      duration:  Date.now() - start,
      ...result,
    };
  } catch (err) {
    return {
      success:  false,
      toolName: name,
      duration: Date.now() - start,
      error:    err.message,
      data:     null,
      summary:  '',
      evidence: [],
    };
  }
}

export async function executeCapable(intentType, context = {}, options = {}) {
  const capable = getCapable(intentType);
  if (!capable.length) return [];

  const results = await Promise.all(
    capable.map(tool => executeTool(tool.name, intentType, context, options))
  );
  return results;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function registryStats() {
  const tools = getAllTools();
  const capabilityIndex = {};
  for (const t of tools) {
    for (const cap of t.capabilities) {
      if (!capabilityIndex[cap]) capabilityIndex[cap] = [];
      capabilityIndex[cap].push(t.name);
    }
  }
  return {
    totalTools:       tools.length,
    capabilityIndex,
    toolNames:        tools.map(t => t.name),
  };
}
