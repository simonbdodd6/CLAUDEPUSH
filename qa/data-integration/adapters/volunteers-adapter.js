import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';
import { normalizeGeneric } from '../data-normalizer.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE    = join(__dirname, '../sample-data/volunteers.json');

registerDataSource(createDataSource({
  name: 'volunteers', type: 'operational',
  description: 'Volunteer database — roles, hours contributed, active status',
  sensitivity: SENSITIVITY.INTERNAL, requiredRole: 'manager',
  adapterStatus: ADAPTER_STATUS.MOCK, sampleDataPath: SAMPLE,
  availableActions: ['read', 'aggregate'],
  tags: ['operations', 'people'],
  fields: [
    field('id', 'string', 'Volunteer ID'), field('name', 'string', 'Full name'),
    field('role', 'string', 'Volunteer role'), field('activeYears', 'number', 'Years active at club'),
    field('monthlyHours', 'number', 'Average monthly hours contributed'), field('status', 'string', 'active | inactive'),
    field('email', 'string', 'Email address', { sensitive: true }),
    field('phone', 'string', 'Phone number', { sensitive: true }),
  ],
  fetch: async () => {
    const raw = JSON.parse(readFileSync(SAMPLE, 'utf8'));
    return fetchResult(raw.volunteers.map(v => normalizeGeneric(v, 'volunteers')), 'volunteers', true);
  },
}));
