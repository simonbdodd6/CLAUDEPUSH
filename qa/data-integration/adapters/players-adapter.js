import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';
import { normalizePlayer } from '../data-normalizer.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const SAMPLE     = join(__dirname, '../sample-data/players.json');

const descriptor = createDataSource({
  name:        'players',
  type:        'player',
  description: 'All registered playing members — name, position, age group, attendance, development score',
  sensitivity: SENSITIVITY.RESTRICTED,
  requiredRole: 'coach',
  adapterStatus: ADAPTER_STATUS.MOCK,
  sampleDataPath: SAMPLE,
  availableActions: ['read', 'aggregate', 'export'],
  tags: ['core', 'squad'],
  fields: [
    field('id',              'string',  'Player ID', { required: true }),
    field('name',            'string',  'Full name'),
    field('position',        'string',  'Playing position'),
    field('ageGroup',        'string',  'Age group (Senior, U18, U16, U14, Minis)'),
    field('age',             'number',  'Age in years'),
    field('active',          'boolean', 'Currently active member'),
    field('attendanceRate',  'number',  'Session attendance rate (%)'),
    field('developmentScore','number',  'AI development score (0-100)', { nullable: true }),
    field('phone',           'string',  'Mobile number', { sensitive: true }),
    field('email',           'string',  'Email address', { sensitive: true }),
  ],
  fetch: async (params = {}) => {
    const raw  = JSON.parse(readFileSync(SAMPLE, 'utf8'));
    const data = raw.players.map(p => normalizePlayer(p, 'players'));
    return fetchResult(data, 'players', true);
  },
});

registerDataSource(descriptor);
export default descriptor;
