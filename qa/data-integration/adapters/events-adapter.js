import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';
import { normalizeGeneric } from '../data-normalizer.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE    = join(__dirname, '../sample-data/events.json');

registerDataSource(createDataSource({
  name: 'events', type: 'operational',
  description: 'Club events calendar — social, fundraising, coaching, competition events',
  sensitivity: SENSITIVITY.PUBLIC, requiredRole: 'public',
  adapterStatus: ADAPTER_STATUS.MOCK, sampleDataPath: SAMPLE,
  availableActions: ['read', 'aggregate'],
  tags: ['events', 'social'],
  fields: [
    field('id', 'string', 'Event ID'), field('name', 'string', 'Event name'),
    field('date', 'date', 'Event date'), field('type', 'string', 'social | fundraiser | coaching | competition | awards'),
    field('venue', 'string', 'Venue'), field('expectedAttendance', 'number', 'Expected attendees'),
    field('ticketPrice', 'number', 'Ticket price EUR (0 = free)'), field('status', 'string', 'upcoming | completed | planned'),
  ],
  fetch: async () => {
    const raw = JSON.parse(readFileSync(SAMPLE, 'utf8'));
    return fetchResult(raw.events.map(e => normalizeGeneric(e, 'events')), 'events', true);
  },
}));
