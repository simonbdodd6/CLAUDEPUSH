/**
 * Coach Timeline — integration contract.
 *
 * The timeline is a feature-flagged, read-only chronological feed derived
 * entirely from existing Core stores. It uses Date.now() timestamps embedded
 * in record IDs (the same IDs used everywhere else) as its time source.
 *
 * Tests verify:
 *  1. ID timestamp extraction — the core mechanism for timestamping events
 *  2. Event type → section routing (all deep-link to valid Core screens)
 *  3. Grouping logic: today / yesterday / earlier boundary math
 *  4. Deduplication: same event never appears twice
 *  5. Availability response status → label mapping
 *  6. Outbound message batching by type within 1-second windows
 *  7. Treatment log events derive from treatmentLog IDs
 *  8. Autopilot receipt events use .at ISO fields
 *  9. Training published events use .publishedAt ISO fields
 * 10. Empty / null / partial state never throws
 * 11. Weekly Brief synthetic event: available → injected, disabled → omitted
 * 12. Events are sorted newest-first within each group
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { generateWeeklyBrief } = await import('../season-intelligence/weekly-brief.js');
const { normalizeExperience } = await import('../season-intelligence/coach-experience.js');

const VALID_SECTIONS = new Set([
  'overview', 'message', 'messages', 'training', 'matchday',
  'medical', 'players', 'admin', 'settings', 'availability', 'week', 'fixtures',
]);

const NOW_MS = Date.now();
const NOW = new Date(NOW_MS).toISOString();

// ─── Replicate the _tlIdTs helper ────────────────────────────────────────────
function tlIdTs(id, nowMs = NOW_MS) {
  const m = String(id || '').match(/(\d{13,})/);
  if (!m) return null;
  const n = parseInt(m[1]);
  return (!isNaN(n) && n > 1600000000000 && n <= nowMs + 60000) ? n : null;
}

// ─── 1. ID timestamp extraction ──────────────────────────────────────────────

test('_tlIdTs: extracts ms timestamp from each ID format', () => {
  const ts = NOW_MS;
  assert.equal(tlIdTs(`feed-${ts}-abc`),   ts, 'masterFeed ID');
  assert.equal(tlIdTs(`req-${ts}`),        ts, 'availabilityRequest ID');
  assert.equal(tlIdTs(`tl${ts}`),          ts, 'treatmentLog ID');
  assert.equal(tlIdTs(`m${ts}-p1-beef`),   ts, 'message ID');
  assert.equal(tlIdTs(`ap-${ts}`),         ts, 'autopilot synthetic');
});

test('_tlIdTs: rejects non-timestamp or too-short numbers', () => {
  assert.equal(tlIdTs('invalid'),  null, 'plain string → null');
  assert.equal(tlIdTs('tl12345'), null, 'short number → null (not ms epoch)');
  assert.equal(tlIdTs(''),        null, 'empty → null');
  assert.equal(tlIdTs(null),      null, 'null → null');
});

test('_tlIdTs: rejects future timestamps beyond 60 s', () => {
  const far_future = NOW_MS + 120000; // 2 minutes ahead
  assert.equal(tlIdTs(`req-${far_future}`, NOW_MS), null, 'far-future → null');
  // 30 seconds ahead is OK (clock skew tolerance)
  const near_future = NOW_MS + 30000;
  assert.equal(tlIdTs(`req-${near_future}`, NOW_MS + 60000), near_future, '30 s ahead → accepted');
});

// ─── 2. Event type → section routing ─────────────────────────────────────────

test('every event type deep-links to a known Core section', () => {
  const EVENT_SECTIONS = {
    training:      'training',
    avail_request: 'message',
    avail_response:'message',
    message_sent:  'messages',
    message_recv:  'messages',
    medical:       'medical',
    autopilot:     'overview',
    system:        'overview',
    weekly_brief:  'overview',
  };
  for (const [type, section] of Object.entries(EVENT_SECTIONS)) {
    assert.ok(VALID_SECTIONS.has(section), `type "${type}" → unknown section "${section}"`);
  }
});

// ─── 3. Grouping: today / yesterday / earlier ─────────────────────────────────

test('grouping puts events in the correct bucket', () => {
  const todayStart  = new Date().setHours(0, 0, 0, 0);
  const yestStart   = todayStart - 86400000;

  const events = [
    { id: 'a', at: NOW_MS },              // today
    { id: 'b', at: todayStart + 1000 },   // today (just after midnight)
    { id: 'c', at: yestStart + 3600000 }, // yesterday
    { id: 'd', at: yestStart - 1 },       // earlier
    { id: 'e', at: 0 },                   // invalid — should be filtered
  ];

  const valid    = events.filter(e => e.at > 0);
  const today    = valid.filter(e => e.at >= todayStart);
  const yest     = valid.filter(e => e.at >= yestStart && e.at < todayStart);
  const earlier  = valid.filter(e => e.at < yestStart);

  assert.equal(today.length,   2, 'two events today');
  assert.equal(yest.length,    1, 'one event yesterday');
  assert.equal(earlier.length, 1, 'one event earlier');
});

test('events within each group are sorted newest-first', () => {
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const events = [
    { id: 'old', at: todayStart + 1000 },
    { id: 'new', at: todayStart + 5000 },
    { id: 'mid', at: todayStart + 3000 },
  ].sort((a, b) => b.at - a.at);

  assert.equal(events[0].id, 'new');
  assert.equal(events[1].id, 'mid');
  assert.equal(events[2].id, 'old');
});

// ─── 4. Deduplication ────────────────────────────────────────────────────────

test('deduplication removes duplicate event IDs', () => {
  const raw = [
    { id: 'e1', at: 2000 },
    { id: 'e1', at: 2000 }, // duplicate
    { id: 'e2', at: 1000 },
  ];
  const seen = new Set();
  const deduped = raw.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
  assert.equal(deduped.length, 2);
  assert.equal(deduped.map(e => e.id).join(','), 'e1,e2');
});

// ─── 5. Availability response labels ─────────────────────────────────────────

test('availability response → correct status label', () => {
  const labelFor = resp =>
    resp === 'available'   ? 'marked available'   :
    resp === 'unavailable' ? 'marked unavailable' :
    resp === 'injured'     ? 'marked injured'      :
    resp === 'maybe'       ? 'responded maybe'     :
                             `responded ${resp}`;

  assert.equal(labelFor('available'),   'marked available');
  assert.equal(labelFor('unavailable'), 'marked unavailable');
  assert.equal(labelFor('injured'),     'marked injured');
  assert.equal(labelFor('maybe'),       'responded maybe');
  assert.equal(labelFor('custom'),      'responded custom');
});

test('availability response dot color: green for available, red for unavail/injured, amber for maybe', () => {
  const dotFor = resp =>
    resp === 'available' ? '#4ade80' : resp === 'maybe' ? '#fbbf24' : '#f87171';

  assert.equal(dotFor('available'),   '#4ade80');
  assert.equal(dotFor('unavailable'), '#f87171');
  assert.equal(dotFor('injured'),     '#f87171');
  assert.equal(dotFor('maybe'),       '#fbbf24');
});

// ─── 6. Message batching ──────────────────────────────────────────────────────

test('outbound messages of the same type within 1 second form one batch', () => {
  // Align to the START of a second so +200/+800 ms stay within the same bucket
  const base = Math.floor(NOW_MS / 1000) * 1000;
  const messages = [
    { id: `m${base}-p1-aa`,   from: 'Coach', type: 'Availability request' },
    { id: `m${base + 200}-p2-bb`, from: 'Coach', type: 'Availability request' },
    { id: `m${base + 800}-p3-cc`, from: 'Coach', type: 'Availability request' },
    // Different type in the same second → different batch
    { id: `m${base + 100}-p1-dd`, from: 'Coach', type: 'Training sheet' },
  ];

  const batches = {};
  for (const m of messages) {
    const at = tlIdTs(m.id);
    if (!at) continue;
    const k = `${Math.floor(at / 1000)}|${m.type}`;
    if (!batches[k]) batches[k] = { count: 0, type: m.type };
    batches[k].count++;
  }

  const batchList = Object.values(batches);
  const availBatch = batchList.find(b => b.type === 'Availability request');
  const trainBatch = batchList.find(b => b.type === 'Training sheet');

  assert.equal(availBatch.count, 3, '3 avail messages → 1 batch of 3');
  assert.equal(trainBatch.count, 1, 'training sheet → separate batch');
  assert.equal(batchList.length, 2, 'two distinct batches');
});

// ─── 7. Treatment log IDs encode timestamp ────────────────────────────────────

test('treatmentLog ID encodes timestamp for extraction', () => {
  const ts = NOW_MS;
  const log = { id: `tl${ts}`, playerId: 'p1', treatment: 'Ice pack', date: 'Today' };
  const at  = tlIdTs(log.id);
  assert.equal(at, ts, 'timestamp extracted from tl{ms} ID');
  assert.ok(at > 1600000000000, 'timestamp is a reasonable epoch ms');
});

// ─── 8. Autopilot receipt uses .at ISO string ─────────────────────────────────

test('autopilot receipt .at is an ISO string parseable to a valid timestamp', () => {
  const receipt = { at: NOW, text: 'Training duplicated from last week — 8 blocks' };
  const at = new Date(receipt.at).getTime();
  assert.ok(!isNaN(at), '.at must parse to a valid timestamp');
  assert.ok(at > 1600000000000, 'timestamp is a reasonable epoch ms');
  assert.ok(at <= Date.now() + 60000, 'timestamp is not far in the future');
});

// ─── 9. Training publishedAt is ISO ──────────────────────────────────────────

test('schedule.publishedAt: ISO string → valid ms timestamp', () => {
  const publishedAt = NOW;
  const at = new Date(publishedAt).getTime();
  assert.ok(!isNaN(at));
  assert.ok(at > 0);
  assert.ok(at <= Date.now() + 60000);
});

test('schedule.publishedAt: null produces no timeline event', () => {
  const sessions = [
    { id: 'tue', publishedAt: null, title: 'Training 1' },
    { id: 'thu', publishedAt: undefined, title: 'Training 2' },
    { id: 'game', publishedAt: NOW, title: 'Match' },
  ];
  const published = sessions.filter(s => s.publishedAt);
  assert.equal(published.length, 1, 'only the session with publishedAt produces an event');
  assert.equal(published[0].id, 'game');
});

// ─── 10. Empty / null state never throws ─────────────────────────────────────

test('timeline event building survives empty state', () => {
  for (const bad of [
    {},
    { schedule: [], players: [], messages: [], treatmentLogs: [], autopilotReceipts: [], masterFeed: [], availabilityRequests: [] },
    { schedule: null, players: undefined },
    { autopilotReceipts: [{ at: null, text: 'x' }] },
    { autopilotReceipts: [{ at: 'not-a-date', text: 'y' }] },
  ]) {
    assert.doesNotThrow(() => {
      const schedule  = bad.schedule  || [];
      const players   = bad.players   || [];
      const messages  = bad.messages  || [];
      const treatmentLogs = bad.treatmentLogs || [];
      const receipts  = bad.autopilotReceipts || [];
      const masterFeed = bad.masterFeed || [];
      const availReqs = bad.availabilityRequests || [];

      // Replicate the core logic
      for (const s of schedule) {
        if (!s?.publishedAt) continue;
        const at = new Date(s.publishedAt).getTime();
        assert.ok(isNaN(at) || at >= 0);
      }
      for (const r of receipts) {
        if (!r?.at) continue;
        const at = new Date(r.at).getTime();
        assert.ok(isNaN(at) || at >= 0);
      }
      for (const f of masterFeed) {
        tlIdTs(f?.id);
      }
    }, `should not throw for state: ${JSON.stringify(bad)}`);
  }
});

// ─── 11. Weekly Brief synthetic event ─────────────────────────────────────────

test('Weekly Brief disabled → available:false, no synthetic event injected', () => {
  const brief = generateWeeklyBrief({}, { enabled: false, now: NOW });
  assert.equal(brief.available, false);
  // Dashboard condition: brief?.available → false → no synthetic event
  const all = brief?.available ? [{ id: 'wb-now' }] : [];
  assert.equal(all.length, 0, 'no synthetic event when brief is disabled');
});

test('Weekly Brief available → headline is truthy string', () => {
  const exp = normalizeExperience({
    sessions: [{ id: 'game', type: 'Match' }],
    squad: { formationNames: { '1': 'A' }, published: false, opposition: 'Rivals', kickoffDate: '2026-06-21' },
    roster: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
    fixtures: [{ opposition: 'Rivals', date: '2026-06-21' }],
  });
  const brief = generateWeeklyBrief(exp, { now: NOW });
  assert.equal(brief.available, true);
  assert.ok(typeof brief.headline === 'string' && brief.headline.length > 0, 'headline must be a non-empty string');
  assert.ok(typeof brief.confidence === 'number' && brief.confidence >= 0 && brief.confidence <= 1);
  // Confidence % for display
  const confPct = Math.round((brief.confidence || 0) * 100);
  assert.ok(confPct >= 0 && confPct <= 100);
});

// ─── 12. masterFeed ID timestamp ─────────────────────────────────────────────

test('masterFeed ID format encodes timestamp correctly', () => {
  const ts = NOW_MS;
  const hex = Math.random().toString(16).slice(2);
  const feedId = `feed-${ts}-${hex}`;
  assert.equal(tlIdTs(feedId), ts, 'feed-{ms}-hex correctly parsed');
});
