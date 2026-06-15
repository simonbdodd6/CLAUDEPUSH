// Platform Kernel — dumb repository helpers.
//
// Intentionally tiny and domain-free. The kernel does NOT decide persistence,
// does NOT own a base class with behaviour, and makes NO domain assumptions —
// it only provides the clone-on-read helper every in-memory adapter needs so
// stored state can never be mutated through a returned reference.
//
// A full persistence/adapter base is deliberately out of scope (deferred to a
// later milestone once a real backing store is chosen).

import { clone } from './clone.js';

// Clone every item in a collection on read (defensive copy out of the store).
export function cloneCollection(items = []) {
  return items.map(clone);
}
