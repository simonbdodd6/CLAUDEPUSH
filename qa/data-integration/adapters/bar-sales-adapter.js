import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE    = join(__dirname, '../sample-data/bar-sales.json');

registerDataSource(createDataSource({
  name: 'bar-sales', type: 'financial',
  description: 'Bar/café revenue — monthly totals, match-day vs regular sales, top products',
  sensitivity: SENSITIVITY.CONFIDENTIAL, requiredRole: 'manager',
  adapterStatus: ADAPTER_STATUS.MOCK, sampleDataPath: SAMPLE,
  availableActions: ['read', 'aggregate'],
  tags: ['finance', 'bar', 'revenue'],
  realConnection: { type: 'pos', note: 'Connect to SumUp, Square, or Zettle POS API for live data' },
  fields: [
    field('month', 'string', 'YYYY-MM'), field('totalRevenue', 'number', 'Total revenue EUR', { sensitive: true }),
    field('matchDaySales', 'number', 'Match-day sales EUR', { sensitive: true }),
    field('regularSales', 'number', 'Regular sales EUR', { sensitive: true }),
    field('transactions', 'number', 'Transaction count'),
  ],
  fetch: async () => {
    const raw  = JSON.parse(readFileSync(SAMPLE, 'utf8'));
    const rows = raw.monthlySummary.map(m => ({ ...m, _source: 'bar-sales', _isMock: true }));
    return fetchResult(rows, 'bar-sales', true, ['⚠ bar-sales is using mock data — connect SumUp/Square/Zettle POS for real data']);
  },
}));
