// Universal Travel Relationship Graph (M13).
//
// The graph owns RELATIONSHIPS (edges) only. Nodes are pure references
// (entityType + entityId) to facts owned authoritatively by source platforms;
// the graph stores no business data. Relationship types are a closed vocabulary
// (with CUSTOM as the escape hatch); entity types are an OPEN slug namespace on
// purpose — a brand-new entity (the "Future Entity") must work without editing
// this file.

export const ENTITY_TYPE = Object.freeze({
  TRAVELLER: 'traveller',
  TRIP: 'trip',
  COUNTRY: 'country',
  CITY: 'city',
  DESTINATION: 'destination',
  ACCOMMODATION: 'accommodation',
  TRANSPORT: 'transport',
  FLIGHT: 'flight',
  BOOKING: 'booking',
  MEMORY: 'memory',
  PHOTO: 'photo',
  JOURNAL: 'journal',
  COMPANION: 'companion',
  RECOMMENDATION: 'recommendation',
  TIMELINE_EVENT: 'timeline_event',
  CUSTOM: 'custom',
});

// Convenience constants only — NOT an allow-list. Any non-empty slug is a valid
// entity type so future modules/products participate without code changes.
export const ENTITY_TYPES = Object.freeze(Object.values(ENTITY_TYPE));

export const RELATIONSHIP_TYPE = Object.freeze({
  VISITED: 'visited',
  PLANNED: 'planned',
  BOOKED: 'booked',
  REMEMBERED: 'remembered',
  TRAVELLED_WITH: 'travelled_with',
  LOCATED_IN: 'located_in',
  GENERATED: 'generated',
  REFERENCES: 'references',
  CREATED: 'created',
  RELATED_TO: 'related_to',
  OWNS: 'owns',
  ATTACHED_TO: 'attached_to',
  CONNECTED_TO: 'connected_to',
  CUSTOM: 'custom',
});

export const RELATIONSHIP_TYPES = Object.freeze(Object.values(RELATIONSHIP_TYPE));

// Relationships that are symmetric by nature default to undirected (A↔B). All
// others default to directed (A→B).
export const SYMMETRIC_RELATIONSHIP_TYPES = Object.freeze([
  RELATIONSHIP_TYPE.TRAVELLED_WITH,
  RELATIONSHIP_TYPE.CONNECTED_TO,
  RELATIONSHIP_TYPE.RELATED_TO,
]);

export const TRAVERSAL_DIRECTION = Object.freeze({
  OUT: 'out', // follow edges where the node is the source
  IN: 'in', // follow edges where the node is the target
  BOTH: 'both', // follow both (undirected edges are always bidirectional)
});

export const GRAPH_AUDIT_ACTIONS = Object.freeze({
  RELATIONSHIP_CREATED: 'RELATIONSHIP_CREATED',
  RELATIONSHIP_DELETED: 'RELATIONSHIP_DELETED',
});

export const DEFAULT_MAX_DEPTH = 6;
export const DEFAULT_NEIGHBOUR_LIMIT = 1000;
