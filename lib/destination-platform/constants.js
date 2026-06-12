export const DESTINATION_TYPE = Object.freeze({
  COUNTRY: 'country',
  REGION: 'region',
  CITY: 'city',
  ISLAND: 'island',
  BEACH: 'beach',
  MOUNTAIN: 'mountain',
  NATIONAL_PARK: 'national_park',
  NEIGHBOURHOOD: 'neighbourhood',
  TRANSPORT_HUB: 'transport_hub',
});

export const DESTINATION_STATUS = Object.freeze({
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused',
  CLOSED: 'closed',
});

export const DESTINATION_AUDIT_ACTIONS = Object.freeze({
  DESTINATION_CREATED: 'DESTINATION_CREATED',
  DESTINATION_UPDATED: 'DESTINATION_UPDATED',
  DESTINATION_ACTIVATED: 'DESTINATION_ACTIVATED',
  DESTINATION_PAUSED: 'DESTINATION_PAUSED',
  DESTINATION_CLOSED: 'DESTINATION_CLOSED',
  DESTINATION_READ: 'DESTINATION_READ',
});

export const TERMINAL_DESTINATION_STATUSES = Object.freeze([
  DESTINATION_STATUS.CLOSED,
]);

