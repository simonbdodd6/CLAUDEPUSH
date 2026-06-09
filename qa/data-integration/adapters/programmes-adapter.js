import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';
import { ROLE_RANK } from '../data-registry.js';

let _memEngine = null;
async function mem() {
  if (!_memEngine) {
    try { _memEngine = await import('../../../memory-engine/index.js'); } catch { _memEngine = null; }
  }
  return _memEngine;
}

registerDataSource(createDataSource({
  name: 'programmes', type: 'coaching',
  description: 'Player training programmes — status, phase, AI-generated plans',
  sensitivity: SENSITIVITY.RESTRICTED, requiredRole: 'coach',
  adapterStatus: ADAPTER_STATUS.MOCK,
  availableActions: ['read', 'aggregate'],
  tags: ['coaching', 'programmes'],
  fields: [
    field('id', 'string', 'Programme ID'), field('playerId', 'string', 'Player reference'),
    field('playerName', 'string', 'Player name'), field('status', 'string', 'active | completed | archived'),
    field('phase', 'string', 'Programme phase'), field('startDate', 'date', 'Start date'),
  ],
  fetch: async () => {
    const m = await mem();
    if (m) {
      try {
        const players = m.getAllPlayers?.() ?? [];
        const programmes = players
          .flatMap(p => (p.programmes ?? []).map(pr => ({
            ...pr,
            playerId: p.id, playerName: p.core?.name,
            _source: 'programmes', _isMock: false,
          })));
        if (programmes.length > 0) {
          return fetchResult(programmes, 'programmes', false);
        }
      } catch { /* fall through to stub */ }
    }
    return fetchResult([], 'programmes', true, ['No programme data in Memory Engine']);
  },
}));
