// Executive Reasoning — explanation repository (adapter boundary).
//
// In-memory by default. The platform's durable ledger (PIF-2) can be plugged in
// later by passing a sink with append()/readAll() — this module does not own
// persistence and never writes files itself.

export class InMemoryExplanationRepository {
  constructor() { this._byId = new Map(); this._bySubject = new Map(); }

  save(explanation) {
    this._byId.set(explanation.id, explanation);
    if (explanation.subjectId) this._bySubject.set(explanation.subjectId, explanation);
    return explanation;
  }

  getById(id)            { return this._byId.get(id) ?? null; }
  getBySubject(subjectId){ return this._bySubject.get(subjectId) ?? null; }
  list(limit = 100)      { const all = [...this._byId.values()]; return limit > 0 ? all.slice(-limit) : all; }
  clear()                { this._byId.clear(); this._bySubject.clear(); }
}
