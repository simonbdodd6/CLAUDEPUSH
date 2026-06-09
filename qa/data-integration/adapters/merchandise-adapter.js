import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE    = join(__dirname, '../sample-data/merchandise.json');

registerDataSource(createDataSource({
  name: 'merchandise', type: 'commercial',
  description: 'Kit and merchandise inventory — stock levels, sales, revenue',
  sensitivity: SENSITIVITY.CONFIDENTIAL, requiredRole: 'manager',
  adapterStatus: ADAPTER_STATUS.MOCK, sampleDataPath: SAMPLE,
  availableActions: ['read', 'aggregate'],
  tags: ['finance', 'merchandise', 'kit'],
  realConnection: { type: 'pos', note: 'Connect to Square or club website shop for live inventory' },
  fields: [
    field('id', 'string', 'Item ID'), field('name', 'string', 'Product name'),
    field('sku', 'string', 'Stock keeping unit'), field('price', 'number', 'Unit price EUR'),
    field('stock', 'number', 'Current stock'), field('sold', 'number', 'Units sold this season'),
  ],
  fetch: async () => {
    const raw  = JSON.parse(readFileSync(SAMPLE, 'utf8'));
    return fetchResult(raw.inventory.map(i => ({ ...i, _source: 'merchandise', _isMock: true })), 'merchandise', true);
  },
}));
