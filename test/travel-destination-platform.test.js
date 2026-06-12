import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESTINATION_STATUS,
  DESTINATION_TYPE,
  createDestinationPlatform,
} from '../lib/destination-platform/index.js';

const admin = { id: 'idn_admin_1', type: 'ADMINISTRATOR' };
const traveller = { id: 'idn_traveller_1', type: 'TRAVELLER' };

function validDestination(overrides = {}) {
  return {
    name: 'Canggu',
    type: DESTINATION_TYPE.NEIGHBOURHOOD,
    country: 'Indonesia',
    region: 'Bali',
    timezone: 'Asia/Makassar',
    currency: 'idr',
    languages: ['id', 'EN', 'en'],
    safetyNotes: ['Use registered transport at night'],
    seasonality: {
      drySeason: ['May', 'June', 'July', 'August', 'September'],
      rainySeason: ['November', 'December', 'January', 'February', 'March'],
    },
    ...overrides,
  };
}

test('creates a canonical destination with safe normalized defaults', async () => {
  const platform = createDestinationPlatform();
  const destination = await platform.createDestination(validDestination(), admin);

  assert.ok(destination.destinationId.startsWith('dest_'));
  assert.equal(destination.name, 'Canggu');
  assert.equal(destination.type, DESTINATION_TYPE.NEIGHBOURHOOD);
  assert.equal(destination.country, 'Indonesia');
  assert.equal(destination.region, 'Bali');
  assert.equal(destination.timezone, 'Asia/Makassar');
  assert.equal(destination.currency, 'IDR');
  assert.deepEqual(destination.languages, ['id', 'en']);
  assert.deepEqual(destination.safetyNotes, ['Use registered transport at night']);
  assert.equal(destination.status, DESTINATION_STATUS.DRAFT);
  assert.ok(destination.createdAt);
  assert.ok(destination.updatedAt);
});

test('requires privileged actor for create update and lifecycle changes', async () => {
  const platform = createDestinationPlatform();
  await assert.rejects(() => platform.createDestination(validDestination(), traveller), /Actor cannot manage destinations/);

  const destination = await platform.createDestination(validDestination(), admin);
  await assert.rejects(() => platform.updateDestination(destination.destinationId, { name: 'Other' }, traveller), /Actor cannot manage destinations/);
  await assert.rejects(() => platform.activateDestination(destination.destinationId, traveller), /Actor cannot manage destinations/);
});

test('updates mutable destination fields', async () => {
  const platform = createDestinationPlatform();
  const destination = await platform.createDestination(validDestination(), admin);
  const updated = await platform.updateDestination(destination.destinationId, {
    name: 'Canggu Beach',
    type: DESTINATION_TYPE.BEACH,
    region: 'Badung',
    currency: 'IDR',
    languages: ['id', 'en', 'nl'],
    safetyNotes: ['Avoid swimming in red-flag conditions'],
    seasonality: { surf: ['June', 'July'] },
  }, admin);

  assert.equal(updated.name, 'Canggu Beach');
  assert.equal(updated.type, DESTINATION_TYPE.BEACH);
  assert.equal(updated.region, 'Badung');
  assert.deepEqual(updated.languages, ['id', 'en', 'nl']);
  assert.deepEqual(updated.safetyNotes, ['Avoid swimming in red-flag conditions']);
  assert.deepEqual(updated.seasonality, { surf: ['June', 'July'] });
});

test('activates pauses and closes with valid status transitions', async () => {
  const platform = createDestinationPlatform();
  const destination = await platform.createDestination(validDestination(), admin);

  const active = await platform.activateDestination(destination.destinationId, admin);
  assert.equal(active.status, DESTINATION_STATUS.ACTIVE);

  const paused = await platform.pauseDestination(destination.destinationId, admin, 'seasonal review');
  assert.equal(paused.status, DESTINATION_STATUS.PAUSED);

  const reactivated = await platform.activateDestination(destination.destinationId, admin);
  assert.equal(reactivated.status, DESTINATION_STATUS.ACTIVE);

  const closed = await platform.closeDestination(destination.destinationId, admin, 'unsupported market');
  assert.equal(closed.status, DESTINATION_STATUS.CLOSED);
});

test('rejects invalid type and exact traveller location fields', async () => {
  const platform = createDestinationPlatform();
  await assert.rejects(() => platform.createDestination(validDestination({ type: 'spaceport' }), admin), /Unsupported destination type/);
  await assert.rejects(() => platform.createDestination(validDestination({ latitude: -8.65 }), admin), /must not store exact traveller location/);
});

test('rejects invalid status transitions', async () => {
  const platform = createDestinationPlatform();
  const destination = await platform.createDestination(validDestination(), admin);

  await assert.rejects(() => platform.pauseDestination(destination.destinationId, admin), /Cannot change destination status from draft to paused/);

  await platform.closeDestination(destination.destinationId, admin, 'not launching');
  await assert.rejects(() => platform.activateDestination(destination.destinationId, admin), /Cannot change destination status from closed to active/);
});

test('closed destinations cannot be updated', async () => {
  const platform = createDestinationPlatform();
  const destination = await platform.createDestination(validDestination(), admin);
  await platform.closeDestination(destination.destinationId, admin, 'closed');

  await assert.rejects(() => platform.updateDestination(destination.destinationId, { name: 'Reopen' }, admin), /Cannot update a closed destination/);
});

test('lists destinations by country case-insensitively', async () => {
  const platform = createDestinationPlatform();
  await platform.createDestination(validDestination({ name: 'Canggu' }), admin);
  await platform.createDestination(validDestination({ name: 'Ubud', type: DESTINATION_TYPE.CITY, region: 'Bali' }), admin);
  await platform.createDestination(validDestination({ name: 'Lisbon', country: 'Portugal', region: null, timezone: 'Europe/Lisbon', currency: 'EUR', languages: ['pt'] }), admin);

  const indonesia = await platform.listDestinationsByCountry('indonesia');
  assert.deepEqual(indonesia.map(d => d.name), ['Canggu', 'Ubud']);
});

test('lists active destinations only', async () => {
  const platform = createDestinationPlatform();
  const canggu = await platform.createDestination(validDestination({ name: 'Canggu' }), admin);
  await platform.createDestination(validDestination({ name: 'Draft Ubud', type: DESTINATION_TYPE.CITY }), admin);
  const lombok = await platform.createDestination(validDestination({ name: 'Lombok', type: DESTINATION_TYPE.ISLAND, region: 'West Nusa Tenggara' }), admin);
  await platform.activateDestination(canggu.destinationId, admin);
  await platform.activateDestination(lombok.destinationId, admin);
  await platform.pauseDestination(lombok.destinationId, admin);

  const active = await platform.listActiveDestinations();
  assert.deepEqual(active.map(d => d.name), ['Canggu']);
});

test('searches destinations by name', async () => {
  const platform = createDestinationPlatform();
  await platform.createDestination(validDestination({ name: 'Canggu' }), admin);
  await platform.createDestination(validDestination({ name: 'Canggu Beach', type: DESTINATION_TYPE.BEACH }), admin);
  await platform.createDestination(validDestination({ name: 'Ubud', type: DESTINATION_TYPE.CITY }), admin);

  const results = await platform.searchDestinationsByName('canggu');
  assert.deepEqual(results.map(d => d.name), ['Canggu', 'Canggu Beach']);
  assert.deepEqual(await platform.searchDestinationsByName(''), []);
});

test('reads destination by ID for non-privileged actors without exposing traveller location', async () => {
  const platform = createDestinationPlatform();
  const destination = await platform.createDestination(validDestination(), admin);
  const read = await platform.getDestinationById(destination.destinationId, traveller);

  assert.equal(read.destinationId, destination.destinationId);
  assert.equal(read.latitude, undefined);
  assert.equal(read.longitude, undefined);
});

