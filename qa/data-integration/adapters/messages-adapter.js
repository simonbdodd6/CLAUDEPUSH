import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';

// Messages adapter reads from the Memory Engine's conversation store
let _mem = null;
async function mem() {
  if (!_mem) { try { _mem = await import('../../../memory-engine/index.js'); } catch { _mem = null; } }
  return _mem;
}

registerDataSource(createDataSource({
  name: 'messages', type: 'communication',
  description: 'Coach-player message history from the app chat system',
  sensitivity: SENSITIVITY.CONFIDENTIAL, requiredRole: 'manager',
  adapterStatus: ADAPTER_STATUS.STUB,
  availableActions: ['read', 'aggregate'],
  tags: ['communication', 'engagement'],
  realConnection: { type: 'app', note: 'Connect to Coach\'s Eye chat API (conversations table)' },
  fields: [
    field('id', 'string', 'Message ID'), field('senderId', 'string', 'Sender ID'),
    field('recipientId', 'string', 'Recipient ID'), field('timestamp', 'datetime', 'Sent timestamp'),
    field('type', 'string', 'Message type'), field('hasResponse', 'boolean', 'Was it responded to?'),
  ],
  fetch: async () => fetchResult([], 'messages', true, ['Messages adapter stub — connect to app chat API to activate']),
}));
