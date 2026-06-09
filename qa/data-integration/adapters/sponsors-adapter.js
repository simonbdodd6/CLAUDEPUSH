import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';
import { normalizeGeneric } from '../data-normalizer.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE    = join(__dirname, '../sample-data/sponsors.json');

registerDataSource(createDataSource({
  name: 'sponsors', type: 'commercial',
  description: 'Club sponsors — tiers, contributions, renewal dates, benefits',
  sensitivity: SENSITIVITY.CONFIDENTIAL, requiredRole: 'manager',
  adapterStatus: ADAPTER_STATUS.MOCK, sampleDataPath: SAMPLE,
  availableActions: ['read', 'aggregate'],
  tags: ['commercial', 'revenue'],
  fields: [
    field('id', 'string', 'Sponsor ID'), field('name', 'string', 'Sponsor name'),
    field('tier', 'string', 'title | gold | silver | bronze'), field('contribution', 'number', 'Annual contribution EUR', { sensitive: true }),
    field('category', 'string', 'Industry category'), field('renewalDate', 'date', 'Renewal date'),
    field('status', 'string', 'active | expired | prospect'),
    field('contactEmail', 'string', 'Primary contact email', { sensitive: true }),
  ],
  fetch: async () => {
    const raw = JSON.parse(readFileSync(SAMPLE, 'utf8'));
    return fetchResult(raw.sponsors.map(s => normalizeGeneric(s, 'sponsors')), 'sponsors', true);
  },
}));
