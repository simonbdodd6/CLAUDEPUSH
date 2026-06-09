import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';
import { normalizeMembership } from '../data-normalizer.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE    = join(__dirname, '../sample-data/memberships.json');

registerDataSource(createDataSource({
  name: 'membership', type: 'financial',
  description: 'Membership registrations — types, status, amounts paid, outstanding fees',
  sensitivity: SENSITIVITY.CONFIDENTIAL, requiredRole: 'manager',
  adapterStatus: ADAPTER_STATUS.MOCK, sampleDataPath: SAMPLE,
  availableActions: ['read', 'aggregate'],
  tags: ['membership', 'finance'],
  realConnection: { type: 'payment', note: 'Connect to Stripe (online) or manual entry CSV upload' },
  fields: [
    field('id', 'string', 'Membership ID'), field('playerId', 'string', 'Player reference'),
    field('playerName', 'string', 'Player name'), field('membershipType', 'string', 'Senior Playing, Youth Playing, etc.'),
    field('status', 'string', 'active | pending | lapsed'), field('validFrom', 'date', 'Start date'),
    field('validUntil', 'date', 'Expiry date'), field('paidAmount', 'number', 'Amount paid (EUR)', { sensitive: true }),
  ],
  fetch: async () => {
    const raw = JSON.parse(readFileSync(SAMPLE, 'utf8'));
    return fetchResult(raw.memberships.map(m => normalizeMembership(m, 'membership')), 'membership', true);
  },
}));
