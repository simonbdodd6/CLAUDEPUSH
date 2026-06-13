// Executive Knowledge Graph — error types.

export class KnowledgeGraphError extends Error {
  constructor(message, code = 'KNOWLEDGE_GRAPH_ERROR') {
    super(message);
    this.name = 'KnowledgeGraphError';
    this.code = code;
  }
}

export class InvalidEntityError extends KnowledgeGraphError {
  constructor(message) { super(message, 'INVALID_ENTITY'); this.name = 'InvalidEntityError'; }
}

export class InvalidRelationshipError extends KnowledgeGraphError {
  constructor(message) { super(message, 'INVALID_RELATIONSHIP'); this.name = 'InvalidRelationshipError'; }
}

export class EntityNotFoundError extends KnowledgeGraphError {
  constructor(id) { super(`Entity not found: ${id}`, 'ENTITY_NOT_FOUND'); this.name = 'EntityNotFoundError'; }
}
