// Universal Event Platform (M21).
//
// The canonical, immutable, append-only event model that EVERY product
// (Travel, Coach's Eye, Website Lead Agent, Executive, Wedding, Hospitality, …)
// will eventually publish into. This is NOT an event bus, queue, messaging, or
// notification system — it is the single, durable shape an event takes. Travel
// is merely its first consumer.

// The event schema version is stamped onto every event so the model can evolve
// over years without breaking historical events (Stripe-style per-event versioning).
export const EVENT_SCHEMA_VERSION = '1.0.0';

// Closed category vocabulary (+ custom escape hatch). Categories are broad and
// product-agnostic; the fine-grained meaning lives in `eventType`, which is an
// open string scoped by `sourcePlatform`/`sourceModule`.
export const EVENT_CATEGORY = Object.freeze({
  IDENTITY: 'identity',
  TRAVEL: 'travel',
  RELATIONSHIP: 'relationship',
  TIMELINE: 'timeline',
  MEMORY: 'memory',
  BOOKING: 'booking',
  ACTIVITY: 'activity',
  APPROVAL: 'approval',
  NOTIFICATION: 'notification',
  SYSTEM: 'system',
  CUSTOM: 'custom',
});

export const EVENT_CATEGORIES = Object.freeze(Object.values(EVENT_CATEGORY));

export const EVENT_ORDER = Object.freeze({ ASC: 'asc', DESC: 'desc' });

export const DEFAULT_EVENT_QUERY_LIMIT = 1000;
