import { clone, createAuditEvent } from '../platform-kernel/index.js';

/**
 * In-memory travel-memory repository behind a stable adapter boundary.
 *
 * A future production adapter (Postgres/Supabase/etc.) can implement the same
 * async surface without changing the domain service. The service never touches
 * the underlying data structures directly; it only calls these methods.
 */
export class InMemoryTravelMemoryRepository {
  constructor(seed = {}) {
    this.memories = new Map();
    this.versions = new Map(); // memoryId -> version snapshot[]
    this.auditEvents = [];

    for (const memory of seed.memories ?? []) {
      this.memories.set(memory.memoryId, clone(memory));
    }
    for (const [memoryId, snapshots] of Object.entries(seed.versions ?? {})) {
      this.versions.set(memoryId, (snapshots ?? []).map(clone));
    }
    for (const event of seed.auditEvents ?? []) {
      this.auditEvents.push(clone(event));
    }
  }

  async saveMemory(memory) {
    this.memories.set(memory.memoryId, clone(memory));
    return clone(memory);
  }

  async getMemory(memoryId) {
    return clone(this.memories.get(memoryId) ?? null);
  }

  // Memory identity is (travellerIdentityId, key, value). Returns the live
  // record (a clone) or null.
  async findMemory(travellerIdentityId, key, value) {
    for (const memory of this.memories.values()) {
      if (memory.travellerIdentityId === travellerIdentityId
        && memory.key === key
        && memory.value === value) {
        return clone(memory);
      }
    }
    return null;
  }

  async listMemoriesForTraveller(travellerIdentityId) {
    return [...this.memories.values()]
      .filter(memory => memory.travellerIdentityId === travellerIdentityId)
      .map(clone)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async appendVersion(memoryId, snapshot) {
    const history = this.versions.get(memoryId) ?? [];
    history.push(clone(snapshot));
    this.versions.set(memoryId, history);
    return clone(snapshot);
  }

  async listVersions(memoryId) {
    return (this.versions.get(memoryId) ?? []).map(clone);
  }

  async getVersion(memoryId, version) {
    return clone((this.versions.get(memoryId) ?? []).find(entry => entry.version === version) ?? null);
  }

  async appendAudit(event) {
    const auditEvent = createAuditEvent(event, { idPrefix: 'travel_memory_audit' });
    this.auditEvents.push(clone(auditEvent));
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.auditEvents
      .filter(event => !filter.memoryId || event.memoryId === filter.memoryId)
      .filter(event => !filter.travellerIdentityId || event.travellerIdentityId === filter.travellerIdentityId)
      .filter(event => !filter.action || event.action === filter.action)
      .map(clone);
  }
}
