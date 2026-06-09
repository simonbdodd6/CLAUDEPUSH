import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';

registerDataSource(createDataSource({
  name: 'media', type: 'media',
  description: 'Match photos, videos, and highlights — planned integration',
  sensitivity: SENSITIVITY.PUBLIC, requiredRole: 'public',
  adapterStatus: ADAPTER_STATUS.PLANNED,
  availableActions: ['read'],
  tags: ['media', 'social'],
  realConnection: { type: 'storage', note: 'Connect to club website media gallery or cloud storage (S3/GCS)' },
  fields: [
    field('id', 'string', 'Media ID'), field('type', 'string', 'photo | video | highlight'),
    field('date', 'date', 'Date captured'), field('fixtureId', 'string', 'Related fixture (optional)'),
    field('url', 'string', 'Media URL'), field('tags', 'array', 'Tags (team, player, event)'),
  ],
  fetch: async () => fetchResult([], 'media', true, ['Media adapter planned — connect to club website or cloud storage']),
}));
