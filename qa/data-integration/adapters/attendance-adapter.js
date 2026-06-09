import { registerDataSource } from '../data-registry.js';
import { createDataSource, field, fetchResult, SENSITIVITY, ADAPTER_STATUS } from '../data-source.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE    = join(__dirname, '../sample-data/attendance.json');

registerDataSource(createDataSource({
  name: 'attendance', type: 'attendance',
  description: 'Session attendance records — who attended, who was absent, rates by session',
  sensitivity: SENSITIVITY.INTERNAL, requiredRole: 'coach',
  adapterStatus: ADAPTER_STATUS.MOCK, sampleDataPath: SAMPLE,
  availableActions: ['read', 'aggregate'],
  tags: ['core', 'performance'],
  fields: [
    field('sessionId', 'string', 'Session reference'), field('date', 'date', 'Session date'),
    field('ageGroup', 'string', 'Age group'), field('attendees', 'array', 'Player IDs who attended'),
    field('absentees', 'array', 'Player IDs who were absent'), field('attendanceCount', 'number', 'Headcount'),
    field('attendanceRate', 'number', 'Attendance rate %'),
  ],
  fetch: async () => {
    const raw  = JSON.parse(readFileSync(SAMPLE, 'utf8'));
    const rows = raw.sessions.map(s => ({ ...s, _source: 'attendance', _isMock: true }));
    return fetchResult(rows, 'attendance', true);
  },
}));
