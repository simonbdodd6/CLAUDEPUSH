import { randomUUID } from 'crypto';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/**
 * In-memory event repository behind a stable adapter boundary.
 *
 * Deliberately DUMB and APPEND-ONLY. It offers no update and no delete — at the
 * storage layer there is simply no way to mutate or remove an event, so
 * immutability is structural, not merely a convention. It maintains the append
 * order (the source of the monotonic sequence and total ordering) and an id
 * index for O(1) duplicate detection. All validation and querying live in the
 * service. A production adapter (append-only table, Kafka, an event store) can
 * implement the same async surface unchanged.
 */
export class InMemoryEventRepository {
  constructor(seed = {}) {
    this.events = []; // append order — the canonical log
    this.byId = new Map(); // eventId -> event

    for (const event of seed.events ?? []) {
      this.events.push(clone(event));
      this.byId.set(event.eventId, clone(event));
    }
  }

  async size() {
    return this.events.length;
  }

  async has(eventId) {
    return this.byId.has(eventId);
  }

  async append(event) {
    this.events.push(clone(event));
    this.byId.set(event.eventId, clone(event));
    return clone(event);
  }

  async getById(eventId) {
    return clone(this.byId.get(eventId) ?? null);
  }

  // Returns the full log in append order. The service applies all filtering.
  async list() {
    return this.events.map(clone);
  }
}
