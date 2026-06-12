import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOMMODATION_STYLE,
  BUDGET_LEVEL,
  CLIMATE_PREFERENCE,
  CROWD_TOLERANCE,
  FITNESS_LEVEL,
  PREFERRED_ACTIVITY_CATEGORY,
  RISK_TOLERANCE,
  TRANSPORT_PREFERENCE,
  TRAVEL_PACE,
  TRAVEL_STYLE,
  createTravellerPreferencesPlatform,
} from '../lib/traveller-preferences-platform/index.js';

const traveller = { id: 'idn_traveller_1', type: 'TRAVELLER' };
const otherTraveller = { id: 'idn_traveller_2', type: 'TRAVELLER' };
const admin = { id: 'idn_admin_1', type: 'ADMINISTRATOR' };

function validPreferences(overrides = {}) {
  return {
    travellerIdentityId: traveller.id,
    budgetLevel: BUDGET_LEVEL.BUDGET,
    accommodationStyles: [ACCOMMODATION_STYLE.HOSTEL, ACCOMMODATION_STYLE.CO_LIVING],
    travelStyles: [TRAVEL_STYLE.BACKPACKING, TRAVEL_STYLE.DIGITAL_NOMAD],
    preferredActivityCategories: [PREFERRED_ACTIVITY_CATEGORY.SURFING, PREFERRED_ACTIVITY_CATEGORY.FOOD],
    fitnessLevel: FITNESS_LEVEL.MODERATE,
    accessibilityRequirements: {
      requirements: ['step-free access'],
      notes: 'Avoid long stair climbs with luggage.',
    },
    foodPreferences: {
      dietaryNeeds: ['vegetarian'],
      cuisines: ['Indonesian', 'Thai'],
      avoids: ['shellfish'],
      notes: 'Prefers local food markets.',
    },
    languages: ['EN', 'id', 'en'],
    transportPreferences: [TRANSPORT_PREFERENCE.WALKING, TRANSPORT_PREFERENCE.PUBLIC_TRANSPORT],
    riskTolerance: RISK_TOLERANCE.LOW,
    crowdTolerance: CROWD_TOLERANCE.MODERATE,
    climatePreferences: [CLIMATE_PREFERENCE.TROPICAL, CLIMATE_PREFERENCE.COASTAL],
    preferredTravelPace: TRAVEL_PACE.SLOW,
    maximumDailyBudget: {
      amount: 750000,
      currency: 'idr',
    },
    preferredTripDuration: {
      minDays: 7,
      maxDays: 21,
    },
    favouriteDestinations: ['dest_bali_canggu', 'dest_lombok_kuta'],
    avoidedDestinations: ['dest_overcrowded_party_strip'],
    favouriteActivities: ['act_beginner_surf'],
    avoidedActivities: ['act_late_night_pub_crawl'],
    ...overrides,
  };
}

test('creates one canonical private preferences profile for a traveller', async () => {
  const platform = createTravellerPreferencesPlatform();
  const preferences = await platform.createPreferences(validPreferences(), traveller);

  assert.ok(preferences.preferencesId.startsWith('pref_'));
  assert.equal(preferences.travellerIdentityId, traveller.id);
  assert.equal(preferences.budgetLevel, BUDGET_LEVEL.BUDGET);
  assert.deepEqual(preferences.accommodationStyles, [ACCOMMODATION_STYLE.HOSTEL, ACCOMMODATION_STYLE.CO_LIVING]);
  assert.deepEqual(preferences.travelStyles, [TRAVEL_STYLE.BACKPACKING, TRAVEL_STYLE.DIGITAL_NOMAD]);
  assert.deepEqual(preferences.preferredActivityCategories, [PREFERRED_ACTIVITY_CATEGORY.SURFING, PREFERRED_ACTIVITY_CATEGORY.FOOD]);
  assert.equal(preferences.fitnessLevel, FITNESS_LEVEL.MODERATE);
  assert.deepEqual(preferences.languages, ['en', 'id']);
  assert.deepEqual(preferences.maximumDailyBudget, { amount: 750000, currency: 'IDR' });
  assert.deepEqual(preferences.preferredTripDuration, { minDays: 7, maxDays: 21 });
  assert.equal(preferences.deletedAt, null);
  assert.ok(preferences.createdAt);
  assert.ok(preferences.updatedAt);
});

test('rejects duplicate preferences for the same traveller identity', async () => {
  const platform = createTravellerPreferencesPlatform();
  await platform.createPreferences(validPreferences(), traveller);

  await assert.rejects(() => platform.createPreferences(validPreferences(), traveller), /already exist/);
});

test('validates required traveller identity and enum values', async () => {
  const platform = createTravellerPreferencesPlatform();

  await assert.rejects(() => platform.createPreferences(validPreferences({ travellerIdentityId: '' }), traveller), /travellerIdentityId is required/);
  await assert.rejects(() => platform.createPreferences(validPreferences({ budgetLevel: 'infinite' }), traveller), /Unsupported traveller preferences budgetLevel/);
  await assert.rejects(() => platform.createPreferences(validPreferences({ accommodationStyles: ['castle'] }), traveller), /Unsupported traveller preferences accommodationStyles/);
  await assert.rejects(() => platform.createPreferences(validPreferences({ travelStyles: ['teleporting'] }), traveller), /Unsupported traveller preferences travelStyles/);
  await assert.rejects(() => platform.createPreferences(validPreferences({ preferredActivityCategories: ['dragon_racing'] }), traveller), /Unsupported traveller preferences preferredActivityCategories/);
  await assert.rejects(() => platform.createPreferences(validPreferences({ fitnessLevel: 'superhuman' }), traveller), /Unsupported traveller preferences fitnessLevel/);
  await assert.rejects(() => platform.createPreferences(validPreferences({ riskTolerance: 'reckless' }), traveller), /Unsupported traveller preferences riskTolerance/);
  await assert.rejects(() => platform.createPreferences(validPreferences({ crowdTolerance: 'infinite' }), traveller), /Unsupported traveller preferences crowdTolerance/);
  await assert.rejects(() => platform.createPreferences(validPreferences({ climatePreferences: ['lava'] }), traveller), /Unsupported traveller preferences climatePreferences/);
  await assert.rejects(() => platform.createPreferences(validPreferences({ preferredTravelPace: 'chaotic' }), traveller), /Unsupported traveller preferences preferredTravelPace/);
  await assert.rejects(() => platform.createPreferences(validPreferences({ transportPreferences: ['rocket'] }), traveller), /Unsupported traveller preferences transportPreferences/);
});

test('validates structured budget duration accessibility and food preferences', async () => {
  const platform = createTravellerPreferencesPlatform();

  await assert.rejects(() => platform.createPreferences(validPreferences({ maximumDailyBudget: { amount: -1, currency: 'IDR' } }), traveller), /maximumDailyBudget.amount/);
  await assert.rejects(() => platform.createPreferences(validPreferences({ maximumDailyBudget: { amount: 10, currency: '' } }), traveller), /maximumDailyBudget.currency is required/);
  await assert.rejects(() => platform.createPreferences(validPreferences({ preferredTripDuration: { minDays: 0, maxDays: 2 } }), traveller), /preferredTripDuration.minDays/);
  await assert.rejects(() => platform.createPreferences(validPreferences({ preferredTripDuration: { minDays: 10, maxDays: 2 } }), traveller), /preferredTripDuration.maxDays/);
  await assert.rejects(() => platform.createPreferences(validPreferences({ accessibilityRequirements: [] }), traveller), /accessibilityRequirements must be an object/);
  await assert.rejects(() => platform.createPreferences(validPreferences({ foodPreferences: [] }), traveller), /foodPreferences must be an object/);
});

test('rejects exact traveller location fields', async () => {
  const platform = createTravellerPreferencesPlatform();

  await assert.rejects(() => platform.createPreferences(validPreferences({ latitude: -8.65 }), traveller), /must not store exact traveller location/);

  await platform.createPreferences(validPreferences(), traveller);
  await assert.rejects(() => platform.updatePreferences(traveller.id, { liveLocation: 'specific villa' }, traveller), /must not store exact traveller location/);
});

test('enforces owner isolation for create read update and delete', async () => {
  const platform = createTravellerPreferencesPlatform();

  await assert.rejects(() => platform.createPreferences(validPreferences(), otherTraveller), /Actor cannot access traveller preferences/);

  await platform.createPreferences(validPreferences(), traveller);
  await assert.rejects(() => platform.getPreferencesForTraveller(traveller.id, otherTraveller), /Actor cannot access traveller preferences/);
  await assert.rejects(() => platform.updatePreferences(traveller.id, { budgetLevel: BUDGET_LEVEL.LUXURY }, otherTraveller), /Actor cannot access traveller preferences/);
  await assert.rejects(() => platform.deletePreferences(traveller.id, otherTraveller), /Actor cannot access traveller preferences/);

  const adminRead = await platform.getPreferencesForTraveller(traveller.id, admin);
  assert.equal(adminRead.travellerIdentityId, traveller.id);
});

test('updates traveller preferences without replacing canonical identity', async () => {
  const platform = createTravellerPreferencesPlatform();
  await platform.createPreferences(validPreferences(), traveller);

  const updated = await platform.updatePreferences(traveller.id, {
    budgetLevel: BUDGET_LEVEL.MID_RANGE,
    accommodationStyles: [ACCOMMODATION_STYLE.GUESTHOUSE],
    travelStyles: [TRAVEL_STYLE.SLOW_TRAVEL, TRAVEL_STYLE.CULTURAL],
    preferredActivityCategories: [PREFERRED_ACTIVITY_CATEGORY.CULTURE, PREFERRED_ACTIVITY_CATEGORY.HIKING],
    fitnessLevel: FITNESS_LEVEL.HIGH,
    accessibilityRequirements: { requirements: [], notes: null },
    foodPreferences: { dietaryNeeds: ['vegan'], cuisines: ['Vietnamese'], avoids: [] },
    languages: ['fr', 'EN'],
    transportPreferences: [TRANSPORT_PREFERENCE.TRAIN, TRANSPORT_PREFERENCE.BOAT],
    riskTolerance: RISK_TOLERANCE.MODERATE,
    crowdTolerance: CROWD_TOLERANCE.LOW,
    climatePreferences: [CLIMATE_PREFERENCE.MOUNTAIN],
    preferredTravelPace: TRAVEL_PACE.BALANCED,
    maximumDailyBudget: { amount: 1000000, currency: 'IDR' },
    preferredTripDuration: { minDays: 3, maxDays: 10 },
    favouriteDestinations: ['dest_raja_ampat'],
    avoidedDestinations: [],
    favouriteActivities: ['act_hike'],
    avoidedActivities: [],
  }, traveller);

  assert.equal(updated.travellerIdentityId, traveller.id);
  assert.equal(updated.budgetLevel, BUDGET_LEVEL.MID_RANGE);
  assert.deepEqual(updated.accommodationStyles, [ACCOMMODATION_STYLE.GUESTHOUSE]);
  assert.deepEqual(updated.travelStyles, [TRAVEL_STYLE.SLOW_TRAVEL, TRAVEL_STYLE.CULTURAL]);
  assert.deepEqual(updated.preferredActivityCategories, [PREFERRED_ACTIVITY_CATEGORY.CULTURE, PREFERRED_ACTIVITY_CATEGORY.HIKING]);
  assert.equal(updated.fitnessLevel, FITNESS_LEVEL.HIGH);
  assert.deepEqual(updated.foodPreferences.dietaryNeeds, ['vegan']);
  assert.deepEqual(updated.languages, ['fr', 'en']);
  assert.deepEqual(updated.transportPreferences, [TRANSPORT_PREFERENCE.TRAIN, TRANSPORT_PREFERENCE.BOAT]);
  assert.equal(updated.riskTolerance, RISK_TOLERANCE.MODERATE);
  assert.equal(updated.crowdTolerance, CROWD_TOLERANCE.LOW);
  assert.deepEqual(updated.climatePreferences, [CLIMATE_PREFERENCE.MOUNTAIN]);
  assert.equal(updated.preferredTravelPace, TRAVEL_PACE.BALANCED);
  assert.deepEqual(updated.maximumDailyBudget, { amount: 1000000, currency: 'IDR' });
  assert.deepEqual(updated.preferredTripDuration, { minDays: 3, maxDays: 10 });
  assert.deepEqual(updated.favouriteDestinations, ['dest_raja_ampat']);
  assert.deepEqual(updated.favouriteActivities, ['act_hike']);
});

test('deletes preferences with privacy-safe tombstone handling', async () => {
  const platform = createTravellerPreferencesPlatform();
  await platform.createPreferences(validPreferences(), traveller);

  const deleted = await platform.deletePreferences(traveller.id, traveller);
  assert.equal(deleted.travellerIdentityId, traveller.id);
  assert.deepEqual(deleted.accommodationStyles, []);
  assert.deepEqual(deleted.travelStyles, []);
  assert.deepEqual(deleted.preferredActivityCategories, []);
  assert.deepEqual(deleted.languages, []);
  assert.equal(deleted.maximumDailyBudget, null);
  assert.equal(deleted.preferredTripDuration, null);
  assert.ok(deleted.deletedAt);

  await assert.rejects(() => platform.getPreferencesForTraveller(traveller.id, traveller), /Traveller preferences not found/);
});

test('audits create read update and delete operations', async () => {
  const platform = createTravellerPreferencesPlatform();
  await platform.createPreferences(validPreferences(), traveller);
  await platform.getPreferencesForTraveller(traveller.id, traveller);
  await platform.updatePreferences(traveller.id, { budgetLevel: BUDGET_LEVEL.PREMIUM }, traveller);
  await platform.deletePreferences(traveller.id, traveller);

  const auditEvents = await platform.getAuditEvents({ travellerIdentityId: traveller.id });
  assert.deepEqual(auditEvents.map(event => event.action), [
    'PREFERENCES_CREATED',
    'PREFERENCES_READ',
    'PREFERENCES_UPDATED',
    'PREFERENCES_DELETED',
  ]);
});
