import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE    = join(__dirname, '../sample-data/availability.json');

registerDataSource(createDataSource({
  name: 'availability', type: 'operational',
  description: 'Player availability for upcoming fixtures — available, unavailable, injured, unknown',
  sensitivity: SENSITIVITY.RESTRICTED, requiredRole: 'coach',
  adapterStatus: ADAPTER_STATUS.MOCK, sampleDataPath: SAMPLE,
  availableActions: ['read', 'aggregate'],
  tags: ['fixtures', 'squad'],
  fields: [
    field('fixtureId', 'string', 'Fixture reference'), field('date', 'date', 'Match date'),
    field('ageGroup', 'string', 'Age group'), field('available', 'array', 'Available player IDs'),
    field('unavailable', 'array', 'Unavailable player IDs'), field('injured', 'array', 'Injured player IDs'),
    field('unknown', 'array', 'Unknown availability player IDs'),
  ],
  fetch: async () => {
    const raw = JSON.parse(readFileSync(SAMPLE, 'utf8'));
    return fetchResult(raw.availability.map(a => ({ ...a, _source: 'availability', _isMock: true })), 'availability', true);
  },
}));
