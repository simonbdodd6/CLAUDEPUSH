import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';
import { normalizeInjury } from '../data-normalizer.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE    = join(__dirname, '../sample-data/injuries.json');

registerDataSource(createDataSource({
  name: 'injuries', type: 'player',
  description: 'Injury records — type, severity, status, expected return dates',
  sensitivity: SENSITIVITY.CONFIDENTIAL,   // medical data — manager+ only
  requiredRole: 'manager',
  adapterStatus: ADAPTER_STATUS.MOCK, sampleDataPath: SAMPLE,
  availableActions: ['read', 'aggregate'],
  tags: ['medical', 'player-welfare'],
  fields: [
    field('id', 'string', 'Injury ID'), field('playerId', 'string', 'Player reference'),
    field('playerName', 'string', 'Player name'), field('type', 'string', 'Injury type'),
    field('severity', 'string', 'mild | moderate | severe'), field('status', 'string', 'active | cleared'),
    field('dateReported', 'date', 'Date reported'), field('expectedReturn', 'date', 'Expected return date'),
    field('clearedDate', 'date', 'Medical clearance date'),
    field('notes', 'string', 'Medical notes', { sensitive: true }),
  ],
  fetch: async () => {
    const raw = JSON.parse(readFileSync(SAMPLE, 'utf8'));
    return fetchResult(raw.injuries.map(i => normalizeInjury(i, 'injuries')), 'injuries', true);
  },
}));
