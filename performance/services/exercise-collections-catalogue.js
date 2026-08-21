// CoachEasier Performance — curated beta exercise collections (SC3).
//
// Reusable, ordered building blocks referencing validated exercises only.
// No loading, no progression, no prescription — see
// domain/exercise-collections.js. Pure module.

import { makeCollection } from '../domain/exercise-collections.js';

export const COLLECTIONS_VERSION = '2026.08-beta.1';

const D = '2026-08-01T00:00:00.000Z';
const col = (o) => makeCollection({ ...o, now: D });

export const COLLECTIONS = [
  col({
    slug: 'rugby-gym-warmup', name: 'Rugby Gym Warm-up', kind: 'warmup',
    description: 'General gym warm-up before any strength session.',
    items: ['ex-inchworm', 'ex-bw-squat', 'ex-bw-hip-hinge', 'ex-glute-bridge', 'ex-band-pull-up'],
  }),
  col({
    slug: 'lower-body-activation', name: 'Lower-body Activation', kind: 'activation',
    description: 'Primers before lower-body strength or speed work.',
    items: ['ex-glute-bridge', 'ex-ninety-ninety', 'ex-split-squat', 'ex-pogo-hops'],
  }),
  col({
    slug: 'sprint-prep', name: 'Sprint Preparation', kind: 'sprint_prep',
    description: 'Build-up sequence before any sprint or speed session.',
    items: ['ex-inchworm', 'ex-hip-flexor-stretch', 'ex-a-skip', 'ex-wall-drill', 'ex-pogo-hops', 'ex-decel-drill'],
  }),
  col({
    slug: 'mobility-reset', name: 'Mobility Reset', kind: 'mobility',
    description: 'Short full-body mobility block for off days or after travel.',
    items: ['ex-ninety-ninety', 'ex-hip-flexor-stretch', 'ex-inchworm'],
  }),
  col({
    slug: 'trunk-block', name: 'Trunk Block', kind: 'trunk',
    description: 'Balanced trunk finisher covering all three demands.',
    items: ['ex-front-plank', 'ex-side-plank', 'ex-pallof-press', 'ex-dead-bug'],
  }),
  col({
    slug: 'post-match-recovery', name: 'Post-match Recovery', kind: 'recovery',
    description: 'Gentle day-after movement — easy effort only.',
    items: ['ex-bw-squat', 'ex-ninety-ninety', 'ex-hip-flexor-stretch', 'ex-bike-intervals'],
  }),
];

export function getCollections() {
  return COLLECTIONS.slice();
}
export function getCollectionsMeta() {
  return { version: COLLECTIONS_VERSION, count: COLLECTIONS.length };
}
