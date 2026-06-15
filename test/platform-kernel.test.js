import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PlatformKernelError,
  clone,
  deepClone,
  EXACT_LOCATION_FIELDS,
  findExactLocationFields,
  assertNoExactLocation,
  assertNoExactLocationShallow,
  scrubExactLocation,
  normalizeReference,
  assertReference,
  stableReferenceKey,
  createAuditEvent,
  nowIso,
  stableHash,
  buildIdempotencyKey,
  slug,
  isPlainObject,
  assertNonEmptyString,
  assertPlainObject,
  compareStrings,
  byKeys,
  cloneCollection,
} from '../lib/platform-kernel/index.js';

test('clone produces a detached deep copy', () => {
  const src = { a: 1, nested: { b: [1, 2] } };
  const copy = clone(src);
  assert.deepEqual(copy, src);
  copy.nested.b.push(3);
  assert.deepEqual(src.nested.b, [1, 2]); // original unaffected
  assert.equal(clone(null), null);
  assert.equal(deepClone, clone);
});

test('findExactLocationFields finds forbidden fields deeply', () => {
  assert.deepEqual(findExactLocationFields({ ok: 1 }), []);
  assert.deepEqual(findExactLocationFields({ a: { b: { lat: 1 } } }), ['lat']);
  const many = findExactLocationFields({ latitude: 1, nested: [{ gps: 'x' }] }).sort();
  assert.deepEqual(many, ['gps', 'latitude']);
});

test('assertNoExactLocation throws on first forbidden field via injected error + label', () => {
  assert.equal(assertNoExactLocation({ ok: 1 }, undefined, { label: 'x' }).ok, 1);
  assert.throws(() => assertNoExactLocation({ a: { lng: 2 } }, undefined, { label: 'Event' }),
    err => err instanceof PlatformKernelError && /Event must not include exact location field: lng/.test(err.message) && err.details.field === 'lng');

  // Injected factory preserves a module's own error identity.
  class MyError extends Error { constructor(m, d) { super(m); this.code = 'VALIDATION_FAILED'; this.details = d; } }
  const factory = (m, d) => new MyError(m, d);
  assert.throws(() => assertNoExactLocation({ gps: 1 }, factory, { label: 'Ctx' }),
    err => err instanceof MyError && err.code === 'VALIDATION_FAILED');
});

test('assertNoExactLocationShallow checks top-level only, batch-reports, honours custom field list', () => {
  // top-level batch report
  assert.throws(() => assertNoExactLocationShallow({ lat: 1, lng: 2, ok: 3 }, undefined, { label: 'timeline input' }),
    err => /timeline input must not include exact traveller location/.test(err.message)
      && err.details.fields.includes('lat') && err.details.fields.includes('lng'));
  // shallow: nested forbidden field is NOT caught (matches legacy shallow behaviour)
  assert.deepEqual(assertNoExactLocationShallow({ nested: { lat: 1 } }, undefined, { label: 'x' }), { nested: { lat: 1 } });
  // custom field list (memory's 10-field set, no gps/geo): gps is allowed
  const memoryFields = ['coordinates', 'lat', 'lng', 'latitude', 'longitude', 'exactLocation', 'liveLocation'];
  assert.equal(assertNoExactLocationShallow({ gps: 'x' }, undefined, { label: 'm', fields: memoryFields }).gps, 'x');
  // non-objects pass through
  assert.equal(assertNoExactLocationShallow(null), null);
  assert.equal(assertNoExactLocationShallow('str'), 'str');
});

test('scrubExactLocation removes forbidden fields deeply, keeping the rest', () => {
  const out = scrubExactLocation({ keep: 1, lat: 2, nested: { gps: 'x', area: 'Bali' } });
  assert.deepEqual(out, { keep: 1, nested: { area: 'Bali' } });
  assert.ok(EXACT_LOCATION_FIELDS.includes('coordinates'));
});

test('reference normalization, validation, and stable key', () => {
  assert.deepEqual(normalizeReference({ type: 'Trip', id: 'trip_1', tripName: 'leak' }), { type: 'trip', id: 'trip_1' });
  assert.throws(() => normalizeReference({ type: 'trip' }), err => /reference.id is required/.test(err.message));
  assert.throws(() => assertReference('nope'), err => /must be an object/.test(err.message));
  assert.equal(stableReferenceKey({ type: 'Destination', id: 'bali' }), 'destination:bali');
});

test('createAuditEvent stamps a stable id + occurredAt, append-only shape', () => {
  const e = createAuditEvent({ action: 'X' }, { idPrefix: 'audit' });
  assert.ok(e.id.startsWith('audit_'));
  assert.ok(e.occurredAt);
  assert.equal(e.action, 'X');
  const kept = createAuditEvent({ id: 'fixed', occurredAt: '2026-01-01T00:00:00.000Z', action: 'Y' });
  assert.equal(kept.id, 'fixed');
  assert.equal(kept.occurredAt, '2026-01-01T00:00:00.000Z');
  assert.ok(typeof nowIso() === 'string');
});

test('idempotency helpers are deterministic', () => {
  assert.equal(stableHash('abc'), stableHash('abc'));
  assert.notEqual(stableHash('abc'), stableHash('abd'));
  assert.equal(stableHash('abc').length, 16);
  assert.equal(stableHash('abc', 8).length, 8);
  assert.equal(buildIdempotencyKey('a', null, 'b', undefined, 'c'), 'a:b:c');
  assert.equal(slug('  Bali Island '), 'bali-island');
});

test('validation helpers', () => {
  assert.equal(isPlainObject({}), true);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject(null), false);
  assert.equal(assertNonEmptyString('  x  ', 'f'), 'x');
  assert.throws(() => assertNonEmptyString('', 'f'), err => /f is required/.test(err.message));
  assert.throws(() => assertPlainObject([], 'f'), err => /f must be an object/.test(err.message));
});

test('deterministic ordering helpers', () => {
  assert.equal(compareStrings('a', 'b'), -1);
  const rows = [{ p: 2, id: 'z' }, { p: 1, id: 'a' }, { p: 2, id: 'a' }];
  rows.sort(byKeys(r => r.p, r => r.id));
  assert.deepEqual(rows.map(r => `${r.p}${r.id}`), ['1a', '2a', '2z']);
});

test('cloneCollection detaches every item', () => {
  const src = [{ a: 1 }, { b: 2 }];
  const out = cloneCollection(src);
  out[0].a = 99;
  assert.equal(src[0].a, 1);
  assert.deepEqual(cloneCollection(), []);
});
