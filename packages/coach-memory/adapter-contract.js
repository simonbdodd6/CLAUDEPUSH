/**
 * @coach-memory — Coach Memory store adapter contract (M108, DORMANT)
 *
 * Documentation-as-code: describes the methods and guarantees a FUTURE coach-memory store
 * adapter must provide. It implements no storage and touches nothing — no persistence,
 * filesystem, network, vector store, engine, clock or randomness. It exists so the
 * proprietary memory model (built now) can later sit behind a pluggable, tenant-safe store
 * without the model depending on any concrete database.
 */

/**
 * Return the frozen description of the future coach-memory store adapter.
 * @returns {Readonly<{ methods: ReadonlyArray<string>, guarantees: ReadonlyArray<string> }>}
 */
export function createCoachMemoryStoreContract() {
  return Object.freeze({
    methods: Object.freeze([
      'upsertCoachMemory',
      'getCoachMemory',
      'searchCoachMemory',
      'listCoachMemories',
      'deleteCoachMemory',
    ]),
    guarantees: Object.freeze([
      'store implementation must preserve tenant boundaries',
      "store implementation must not expose one club's memory to another club",
      'store implementation must preserve evidenceRefs',
      'store implementation must preserve ontologyLinks',
      'store implementation must return deterministic ordering for equal scores',
    ]),
  })
}
