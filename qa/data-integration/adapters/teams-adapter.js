import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';
import { normalizeTeam } from '../data-normalizer.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE    = join(__dirname, '../sample-data/teams.json');

registerDataSource(createDataSource({
  name: 'teams', type: 'team',
  description: 'Club teams — age groups, coaches, player counts, performance stats',
  sensitivity: SENSITIVITY.INTERNAL, requiredRole: 'player',
  adapterStatus: ADAPTER_STATUS.MOCK, sampleDataPath: SAMPLE,
  availableActions: ['read', 'aggregate'],
  tags: ['core', 'squad'],
  fields: [
    field('id', 'string', 'Team ID'), field('name', 'string', 'Team name'),
    field('ageGroup', 'string', 'Age group'), field('headCoachId', 'string', 'Head coach ID'),
    field('playerCount', 'number', 'Number of players'), field('avgAttendance', 'number', 'Average attendance %'),
    field('winRate', 'number', 'Win rate % for the season'),
  ],
  fetch: async () => {
    const raw = JSON.parse(readFileSync(SAMPLE, 'utf8'));
    return fetchResult(raw.teams.map(t => normalizeTeam(t, 'teams')), 'teams', true);
  },
}));
