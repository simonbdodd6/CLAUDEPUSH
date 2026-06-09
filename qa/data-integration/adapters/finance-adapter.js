import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';

// Finance is planned — no mock data yet (beyond membership + bar + sponsors)
registerDataSource(createDataSource({
  name: 'finance', type: 'financial',
  description: 'General club financial ledger — income, expenditure, bank balance (planned)',
  sensitivity: SENSITIVITY.CONFIDENTIAL, requiredRole: 'admin',
  adapterStatus: ADAPTER_STATUS.PLANNED,
  availableActions: ['read', 'aggregate', 'export'],
  tags: ['finance', 'admin'],
  realConnection: { type: 'banking', note: 'Connect to Revolut Business API or Google Sheets ledger export' },
  fields: [
    field('id', 'string', 'Transaction ID'), field('date', 'date', 'Transaction date'),
    field('category', 'string', 'Income | Expenditure category'), field('description', 'string', 'Description'),
    field('amount', 'number', 'Amount EUR', { sensitive: true }), field('transactionType', 'string', 'income | expense'),
    field('source', 'string', 'Source system (Stripe, Revolut, etc.)'),
  ],
  fetch: async () => fetchResult([], 'finance', true, ['Finance adapter planned — connect Revolut Business or CSV export to activate']),
}));
