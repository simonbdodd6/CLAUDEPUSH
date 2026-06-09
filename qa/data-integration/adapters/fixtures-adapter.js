import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';
import { normalizeFixture } from '../data-normalizer.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE    = join(__dirname, '../sample-data/fixtures.json');

registerDataSource(createDataSource({
  name: 'fixtures', type: 'operational',
  description: 'Season fixtures — dates, opponents, venues, results for all age groups',
  sensitivity: SENSITIVITY.PUBLIC, requiredRole: 'public',
  adapterStatus: ADAPTER_STATUS.MOCK, sampleDataPath: SAMPLE,
  availableActions: ['read', 'aggregate'],
  tags: ['fixtures', 'competition'],
  realConnection: { type: 'web', note: 'Connect to Leinster Rugby fixture portal or club website' },
  fields: [
    field('id', 'string', 'Fixture ID'), field('date', 'date', 'Match date'),
    field('homeTeam', 'string', 'Home team'), field('awayTeam', 'string', 'Away team'),
    field('venue', 'string', 'Venue'), field('competition', 'string', 'Competition name'),
    field('ageGroup', 'string', 'Age group'), field('result', 'string', 'won | lost | draw | null'),
    field('homeScore', 'number', 'Home team score'), field('awayScore', 'number', 'Away team score'),
  ],
  fetch: async () => {
    const raw = JSON.parse(readFileSync(SAMPLE, 'utf8'));
    return fetchResult(raw.fixtures.map(f => normalizeFixture(f, 'fixtures')), 'fixtures', true);
  },
}));
