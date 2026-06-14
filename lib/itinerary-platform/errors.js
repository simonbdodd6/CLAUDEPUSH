export class ItineraryPlatformError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ItineraryPlatformError';
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = {}) {
  return new ItineraryPlatformError('VALIDATION_FAILED', message, details);
}

export function notFoundError(itineraryId) {
  return new ItineraryPlatformError('ITINERARY_NOT_FOUND', `Itinerary not found: ${itineraryId}`, { itineraryId });
}

export function blockNotFoundError(blockId) {
  return new ItineraryPlatformError('BLOCK_NOT_FOUND', `Itinerary block not found: ${blockId}`, { blockId });
}

export function dayNotFoundError(day) {
  return new ItineraryPlatformError('DAY_NOT_FOUND', `Itinerary day not found: ${day}`, { day });
}

export function versionNotFoundError(version) {
  return new ItineraryPlatformError('VERSION_NOT_FOUND', `Itinerary version not found: ${version}`, { version });
}

export function forbiddenError(message, details = {}) {
  return new ItineraryPlatformError('FORBIDDEN', message, details);
}
