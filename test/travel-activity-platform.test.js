import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_CATEGORY,
  ACTIVITY_DIFFICULTY,
  ACTIVITY_ENVIRONMENT,
  ACTIVITY_STATUS,
  ACTIVITY_VISIBILITY,
  WEATHER_SENSITIVITY,
  createActivityPlatform,
} from '../lib/activity-platform/index.js';

const owner = { id: 'idn_activity_owner_1', type: 'TRAVELLER' };
const otherTraveller = { id: 'idn_activity_owner_2', type: 'TRAVELLER' };
const admin = { id: 'idn_admin_1', type: 'ADMINISTRATOR' };

function validActivity(overrides = {}) {
  return {
    destinationId: 'dest_bali_canggu',
    ownerIdentityId: owner.id,
    name: 'Beginner surf session',
    description: 'Small-group surf session near Canggu for confident swimmers.',
    categories: [ACTIVITY_CATEGORY.SURFING, ACTIVITY_CATEGORY.ADVENTURE],
    difficulty: ACTIVITY_DIFFICULTY.EASY,
    duration: {
      minMinutes: 90,
      maxMinutes: 120,
    },
    estimatedCostRange: {
      min: 250000,
      max: 450000,
      currency: 'idr',
    },
    seasonality: {
      bestMonths: ['May', 'June', 'July', 'August', 'September'],
      notes: 'Morning sessions are usually calmer.',
    },
    ageRestrictions: {
      minimumAge: 12,
      maximumAge: null,
      familyFriendly: true,
      notes: 'Children need guardian supervision.',
    },
    weatherSensitivity: WEATHER_SENSITIVITY.HIGH,
    environment: ACTIVITY_ENVIRONMENT.OUTDOOR,
    ...overrides,
  };
}

test('creates a canonical activity with safe normalized defaults', async () => {
  const platform = createActivityPlatform();
  const activity = await platform.createActivity(validActivity(), owner);

  assert.ok(activity.activityId.startsWith('act_'));
  assert.equal(activity.destinationId, 'dest_bali_canggu');
  assert.equal(activity.ownerIdentityId, owner.id);
  assert.equal(activity.name, 'Beginner surf session');
  assert.deepEqual(activity.categories, [ACTIVITY_CATEGORY.SURFING, ACTIVITY_CATEGORY.ADVENTURE]);
  assert.equal(activity.difficulty, ACTIVITY_DIFFICULTY.EASY);
  assert.deepEqual(activity.duration, { minMinutes: 90, maxMinutes: 120 });
  assert.deepEqual(activity.estimatedCostRange, { min: 250000, max: 450000, currency: 'IDR' });
  assert.equal(activity.status, ACTIVITY_STATUS.INACTIVE);
  assert.equal(activity.visibility, ACTIVITY_VISIBILITY.PRIVATE);
  assert.ok(activity.createdAt);
  assert.ok(activity.updatedAt);
});

test('validates required fields and supported categories', async () => {
  const platform = createActivityPlatform();

  await assert.rejects(() => platform.createActivity(validActivity({ destinationId: '' }), owner), /destinationId is required/);
  await assert.rejects(() => platform.createActivity(validActivity({ ownerIdentityId: '' }), owner), /ownerIdentityId is required/);
  await assert.rejects(() => platform.createActivity(validActivity({ name: '' }), owner), /name is required/);
  await assert.rejects(() => platform.createActivity(validActivity({ categories: [] }), owner), /At least one activity category/);
  await assert.rejects(() => platform.createActivity(validActivity({ categories: ['spacewalking'] }), owner), /Unsupported activity category/);
});

test('validates difficulty duration cost age weather and environment fields', async () => {
  const platform = createActivityPlatform();

  await assert.rejects(() => platform.createActivity(validActivity({ difficulty: 'impossible' }), owner), /Unsupported activity difficulty/);
  await assert.rejects(() => platform.createActivity(validActivity({ duration: { minMinutes: 0 } }), owner), /duration.minMinutes/);
  await assert.rejects(() => platform.createActivity(validActivity({ duration: { minMinutes: 90, maxMinutes: 30 } }), owner), /duration.maxMinutes/);
  await assert.rejects(() => platform.createActivity(validActivity({ estimatedCostRange: { min: -1, max: 10, currency: 'IDR' } }), owner), /estimatedCostRange.min/);
  await assert.rejects(() => platform.createActivity(validActivity({ estimatedCostRange: { min: 10, max: 5, currency: 'IDR' } }), owner), /estimatedCostRange.max/);
  await assert.rejects(() => platform.createActivity(validActivity({ ageRestrictions: { minimumAge: 18, maximumAge: 12 } }), owner), /ageRestrictions.maximumAge/);
  await assert.rejects(() => platform.createActivity(validActivity({ weatherSensitivity: 'unknown' }), owner), /Unsupported activity weatherSensitivity/);
  await assert.rejects(() => platform.createActivity(validActivity({ environment: 'underground' }), owner), /Unsupported activity environment/);
});

test('rejects exact traveller location fields', async () => {
  const platform = createActivityPlatform();
  await assert.rejects(() => platform.createActivity(validActivity({ latitude: -8.65 }), owner), /must not store exact traveller location/);

  const activity = await platform.createActivity(validActivity(), owner);
  await assert.rejects(() => platform.updateActivity(activity.activityId, { exactLocation: 'specific villa' }, owner), /must not store exact traveller location/);
});

test('updates mutable activity fields', async () => {
  const platform = createActivityPlatform();
  const activity = await platform.createActivity(validActivity(), owner);

  const updated = await platform.updateActivity(activity.activityId, {
    name: 'Sunrise surf lesson',
    categories: [ACTIVITY_CATEGORY.SURFING, ACTIVITY_CATEGORY.PHOTOGRAPHY],
    difficulty: ACTIVITY_DIFFICULTY.MODERATE,
    duration: { minMinutes: 120, maxMinutes: 150 },
    estimatedCostRange: { min: 300000, max: 500000, currency: 'IDR' },
    ageRestrictions: { minimumAge: 14, familyFriendly: false },
    weatherSensitivity: WEATHER_SENSITIVITY.WEATHER_DEPENDENT,
    environment: ACTIVITY_ENVIRONMENT.MIXED,
    visibility: ACTIVITY_VISIBILITY.PUBLIC,
  }, owner);

  assert.equal(updated.name, 'Sunrise surf lesson');
  assert.deepEqual(updated.categories, [ACTIVITY_CATEGORY.SURFING, ACTIVITY_CATEGORY.PHOTOGRAPHY]);
  assert.equal(updated.difficulty, ACTIVITY_DIFFICULTY.MODERATE);
  assert.deepEqual(updated.duration, { minMinutes: 120, maxMinutes: 150 });
  assert.deepEqual(updated.estimatedCostRange, { min: 300000, max: 500000, currency: 'IDR' });
  assert.equal(updated.ageRestrictions.minimumAge, 14);
  assert.equal(updated.weatherSensitivity, WEATHER_SENSITIVITY.WEATHER_DEPENDENT);
  assert.equal(updated.environment, ACTIVITY_ENVIRONMENT.MIXED);
  assert.equal(updated.visibility, ACTIVITY_VISIBILITY.PUBLIC);
});

test('supports active inactive lifecycle and rejects duplicate transitions', async () => {
  const platform = createActivityPlatform();
  const activity = await platform.createActivity(validActivity(), owner);

  const active = await platform.activateActivity(activity.activityId, owner);
  assert.equal(active.status, ACTIVITY_STATUS.ACTIVE);
  await assert.rejects(() => platform.activateActivity(activity.activityId, owner), /already active/);

  const inactive = await platform.deactivateActivity(activity.activityId, owner);
  assert.equal(inactive.status, ACTIVITY_STATUS.INACTIVE);
  await assert.rejects(() => platform.deactivateActivity(activity.activityId, owner), /already inactive/);
});

test('supports public and private visibility', async () => {
  const platform = createActivityPlatform();
  const activity = await platform.createActivity(validActivity(), owner);

  const publicActivity = await platform.changeActivityVisibility(activity.activityId, ACTIVITY_VISIBILITY.PUBLIC, owner);
  assert.equal(publicActivity.visibility, ACTIVITY_VISIBILITY.PUBLIC);

  const privateActivity = await platform.changeActivityVisibility(activity.activityId, ACTIVITY_VISIBILITY.PRIVATE, owner);
  assert.equal(privateActivity.visibility, ACTIVITY_VISIBILITY.PRIVATE);

  await assert.rejects(() => platform.changeActivityVisibility(activity.activityId, 'friends_only', owner), /Unsupported activity visibility/);
});

test('enforces owner isolation for private reads updates lifecycle and owner lists', async () => {
  const platform = createActivityPlatform();
  const activity = await platform.createActivity(validActivity(), owner);
  await platform.createActivity(validActivity({
    ownerIdentityId: otherTraveller.id,
    name: 'Food walk',
    categories: [ACTIVITY_CATEGORY.FOOD],
  }), otherTraveller);

  await assert.rejects(() => platform.getActivityById(activity.activityId, otherTraveller), /private activity/);
  await assert.rejects(() => platform.updateActivity(activity.activityId, { name: 'Hijack' }, otherTraveller), /Actor cannot access this activity/);
  await assert.rejects(() => platform.activateActivity(activity.activityId, otherTraveller), /Actor cannot access this activity/);
  await assert.rejects(() => platform.listActivitiesForOwner(owner.id, otherTraveller), /Actor cannot list activities/);

  const ownActivities = await platform.listActivitiesForOwner(owner.id, owner);
  assert.equal(ownActivities.length, 1);
  assert.equal(ownActivities[0].ownerIdentityId, owner.id);

  const adminRead = await platform.getActivityById(activity.activityId, admin);
  assert.equal(adminRead.activityId, activity.activityId);
});

test('public active activities can be listed by destination and searched', async () => {
  const platform = createActivityPlatform();
  const surf = await platform.createActivity(validActivity({
    name: 'Canggu surf lesson',
    visibility: ACTIVITY_VISIBILITY.PUBLIC,
  }), owner);
  const food = await platform.createActivity(validActivity({
    name: 'Canggu food walk',
    categories: [ACTIVITY_CATEGORY.FOOD],
    visibility: ACTIVITY_VISIBILITY.PUBLIC,
  }), owner);
  await platform.createActivity(validActivity({
    name: 'Private photo route',
    categories: [ACTIVITY_CATEGORY.PHOTOGRAPHY],
    visibility: ACTIVITY_VISIBILITY.PRIVATE,
  }), owner);
  await platform.createActivity(validActivity({
    name: 'Ubud hike',
    destinationId: 'dest_bali_ubud',
    categories: [ACTIVITY_CATEGORY.HIKING],
    visibility: ACTIVITY_VISIBILITY.PUBLIC,
  }), owner);

  await platform.activateActivity(surf.activityId, owner);
  await platform.activateActivity(food.activityId, owner);

  const active = await platform.listActiveActivitiesByDestination('dest_bali_canggu');
  assert.deepEqual(active.map(activity => activity.name), ['Canggu food walk', 'Canggu surf lesson']);

  const results = await platform.searchActivitiesByName('canggu');
  assert.deepEqual(results.map(activity => activity.name), ['Canggu food walk', 'Canggu surf lesson']);
});

test('destination listing hides private activities from non-owners', async () => {
  const platform = createActivityPlatform();
  await platform.createActivity(validActivity({
    name: 'Public surf',
    visibility: ACTIVITY_VISIBILITY.PUBLIC,
  }), owner);
  await platform.createActivity(validActivity({
    name: 'Private reef note',
    visibility: ACTIVITY_VISIBILITY.PRIVATE,
  }), owner);

  const visibleToOther = await platform.listActivitiesByDestination('dest_bali_canggu', otherTraveller);
  assert.deepEqual(visibleToOther.map(activity => activity.name), ['Public surf']);

  const visibleToOwner = await platform.listActivitiesByDestination('dest_bali_canggu', owner);
  assert.deepEqual(visibleToOwner.map(activity => activity.name), ['Private reef note', 'Public surf']);
});

test('audits activity lifecycle reads and updates', async () => {
  const platform = createActivityPlatform();
  const activity = await platform.createActivity(validActivity(), owner);
  await platform.getActivityById(activity.activityId, owner);
  await platform.updateActivity(activity.activityId, { description: 'Updated' }, owner);
  await platform.activateActivity(activity.activityId, owner);

  const auditEvents = await platform.getAuditEvents({ activityId: activity.activityId });
  assert.deepEqual(auditEvents.map(event => event.action), [
    'ACTIVITY_CREATED',
    'ACTIVITY_READ',
    'ACTIVITY_UPDATED',
    'ACTIVITY_ACTIVATED',
  ]);
});
