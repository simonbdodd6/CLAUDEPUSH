import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';
import { normalizeSession } from '../data-normalizer.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE    = join(__dirname, '../sample-data/sessions.json');

registerDataSource(createDataSource({
  name: 'sessions', type: 'coaching',
  description: 'Training session records — dates, focus, attendance, coach notes',
  sensitivity: SENSITIVITY.INTERNAL, requiredRole: 'coach',
  adapterStatus: ADAPTER_STATUS.MOCK, sampleDataPath: SAMPLE,
  availableActions: ['read', 'aggregate'],
  tags: ['training', 'coaching'],
  fields: [
    field('id', 'string', 'Session ID'), field('date', 'date', 'Session date'),
    field('ageGroup', 'string', 'Age group'), field('focus', 'string', 'Session focus/theme'),
    field('durationMinutes', 'number', 'Duration in minutes'), field('attendanceCount', 'number', 'Headcount'),
    field('attendanceRate', 'number', 'Attendance rate %'), field('coachId', 'string', 'Lead coach ID'),
    field('notes', 'string', 'Coach notes'),
  ],
  fetch: async () => {
    const raw = JSON.parse(readFileSync(SAMPLE, 'utf8'));
    return fetchResult(raw.sessions.map(s => normalizeSession(s, 'sessions')), 'sessions', true);
  },
}));
