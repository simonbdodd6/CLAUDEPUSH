import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';
import { normalizeGeneric } from '../data-normalizer.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE    = join(__dirname, '../sample-data/coaches.json');

registerDataSource(createDataSource({
  name: 'coaches', type: 'coaching',
  description: 'Coaching staff — roles, qualifications, age groups, contact details',
  sensitivity: SENSITIVITY.RESTRICTED, requiredRole: 'manager',
  adapterStatus: ADAPTER_STATUS.MOCK, sampleDataPath: SAMPLE,
  availableActions: ['read', 'aggregate'],
  tags: ['staff'],
  fields: [
    field('id', 'string', 'Coach ID'), field('name', 'string', 'Full name'),
    field('role', 'string', 'Coaching role'), field('ageGroups', 'array', 'Teams coached'),
    field('qualifications', 'array', 'Coaching qualifications'), field('yearsExperience', 'number', 'Years of coaching experience'),
    field('email', 'string', 'Email address', { sensitive: true }), field('phone', 'string', 'Phone number', { sensitive: true }),
  ],
  fetch: async () => {
    const raw = JSON.parse(readFileSync(SAMPLE, 'utf8'));
    return fetchResult(raw.coaches.map(c => normalizeGeneric(c, 'coaches')), 'coaches', true);
  },
}));
