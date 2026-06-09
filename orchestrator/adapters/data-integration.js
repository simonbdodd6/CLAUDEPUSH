// Orchestrator adapter — pre-populates the context bus with data integration metadata
// so all engines know what club data is available before they execute.
import { registerEngine } from '../engine-registry.js';

let _di = null;
async function di() {
  if (!_di) {
    try { _di = await import('../../qa/data-integration/index.js'); } catch { _di = null; }
  }
  return _di;
}

registerEngine({
  name: 'data-integration',
  version: '1.0.0',
  description: 'Pre-populates the context bus with available club data sources and health status',
  capabilities: ['data_inventory', 'data_health', 'data_permissions'],
  outputs: ['availableDataSources', 'missingDataSources', 'dataQualityWarnings', 'dataIntegrationMeta'],
  optionalInputs: [],
  requiredInputs: [],
  priority: 95,
  alwaysRun: false,

  async execute(context) {
    const m = await di();
    if (!m) {
      return {
        success: false,
        error: 'Data integration layer unavailable',
        contextWrites: {
          availableDataSources: [],
          missingDataSources: [],
          dataQualityWarnings: ['Data integration layer could not be loaded'],
          dataIntegrationMeta: { loaded: false },
        },
      };
    }

    const role = context.role ?? 'coach';

    const [availableObj, missingObj, health] = await Promise.all([
      Promise.resolve(m.getAvailableData(role)),
      Promise.resolve(m.getMissingData()),
      m.getDataHealth(),
    ]);

    const available = availableObj.sources ?? [];
    const missing = missingObj.sources ?? missingObj;

    const warnings = [];
    if (health.mock > 0) warnings.push(`${health.mock} data source(s) using mock data`);
    if (health.unavailable > 0) warnings.push(`${health.unavailable} data source(s) unavailable`);
    if (health.planned > 0) warnings.push(`${health.planned} data source(s) planned but not yet connected`);

    return {
      success: true,
      contextWrites: {
        availableDataSources: available.map(s => ({ name: s.name, type: s.type, sensitivity: s.sensitivity, adapterStatus: s.adapterStatus })),
        missingDataSources: missing.map(s => s.name ?? s),
        dataQualityWarnings: warnings,
        dataIntegrationMeta: {
          loaded: true,
          role,
          totalSources: health.totalSources,
          healthySources: health.healthy,
          mockSources: health.mock,
          plannedSources: health.planned,
          overallHealth: health.overall,
          checkedAt: new Date().toISOString(),
        },
      },
    };
  },
});
