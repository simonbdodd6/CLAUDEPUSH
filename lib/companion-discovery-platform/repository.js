import { randomUUID } from 'crypto';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/**
 * In-memory companion-discovery repository behind a stable adapter boundary.
 *
 * A future production adapter can implement the same async surface without
 * changing the domain service. The service never touches the underlying data
 * structures directly; it only calls these methods.
 */
export class InMemoryCompanionDiscoveryRepository {
  constructor(seed = {}) {
    this.profiles = new Map();
    this.auditEvents = [];

    for (const profile of seed.profiles ?? []) {
      this.profiles.set(profile.profileId, clone(profile));
    }
    for (const event of seed.auditEvents ?? []) {
      this.auditEvents.push(clone(event));
    }
  }

  async saveProfile(profile) {
    this.profiles.set(profile.profileId, clone(profile));
    return clone(profile);
  }

  async getProfile(profileId) {
    return clone(this.profiles.get(profileId) ?? null);
  }

  async getProfileByTraveller(travellerIdentityId) {
    for (const profile of this.profiles.values()) {
      if (profile.travellerIdentityId === travellerIdentityId) return clone(profile);
    }
    return null;
  }

  // Returns every stored profile. The service applies all opt-in, visibility,
  // and block filtering — the repository never decides discoverability.
  async listProfiles() {
    return [...this.profiles.values()].map(clone);
  }

  async appendAudit(event) {
    const auditEvent = {
      id: event.id ?? `companion_discovery_audit_${randomUUID()}`,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      ...event,
    };
    this.auditEvents.push(clone(auditEvent));
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.auditEvents
      .filter(event => !filter.profileId || event.profileId === filter.profileId)
      .filter(event => !filter.travellerIdentityId || event.travellerIdentityId === filter.travellerIdentityId)
      .filter(event => !filter.action || event.action === filter.action)
      .map(clone);
  }
}
