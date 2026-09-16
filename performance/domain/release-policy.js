// CoachEasier Performance — what may reach a player, and what only informs a
// coach (SC9.34).
//
// THE DECISION THIS ENCODES
//
// A coach must not be a manual approval bottleneck. SC9.33 measured why that
// matters: 9 of the 38 corpus programmes, and the real U18 athlete with nothing
// wrong with him, return `requiresReview: true` with no restriction supplied at
// all. Three flags fire on an ordinary, healthy sixteen-year-old. If review
// gated release, most youth athletes would open Performance and find nothing.
//
// So the product decision is: a generated programme is released to the player,
// and review signals travel to the coach alongside it rather than in front of
// it.
//
// WHY THAT IS SAFE, AND NOT A WEAKENING
//
// Because the hard gates do not live in the flags. They live earlier, and a
// programme that EXISTS has already passed all of them:
//
//   1. `generateProgramme` THROWS rather than returning a document, for
//      `athlete_unavailable`, `profile_required`, `author_required`,
//      `profile_must_be_an_object` and every malformed athlete state.
//   2. `programmeDraftFromBlueprint` throws `blueprint_has_no_sessions` when
//      the coaching rules produce no week.
//   3. `partitionEligibility` has ALREADY removed every exercise a supplied
//      restriction contraindicates, before a single slot is filled. A
//      restricted exercise cannot be in the programme to be released.
//   4. Youth ceilings — effort, sets, repetition band — are applied during
//      generation, not checked afterwards.
//
// A flag is raised AFTER all of that, about a programme that already complies.
// Releasing it is therefore not releasing something unreviewed as unsafe; it is
// releasing something the engine has already made safe, while telling the coach
// what it had to do and what it could not resolve.
//
// THE ONE THING THAT COULD STILL GATE
//
// `blocking` is in the flag severity vocabulary and no flag currently uses it.
// It is honoured here so that if a future build ever needs a true stop, the
// mechanism exists and release is refused rather than quietly permitted. This
// module adds no coaching rule of its own.
//
// Pure: no DOM, no storage, no clock.

export const RELEASE_POLICY_VERSION = '2026.09-sc934-beta.1';

/**
 * Severities that prevent a generated programme reaching the player.
 *
 * Deliberately just one, and deliberately not any of the review severities.
 * `requires_review` means a human should look; it does not mean the programme
 * is unsafe, because the unsafe cases never produced a programme.
 */
export const BLOCKING_SEVERITIES = ['blocking'];

/** Severities that travel to the coach without holding anything up. */
export const REVIEW_SEVERITIES = ['requires_review', 'warning'];

/**
 * Decide whether a generated programme may go straight to the player.
 *
 * @param {object} blueprint  as returned by `generateProgramme`
 * @returns {{
 *   releasable: boolean,
 *   blockedBy: Array<{id:string, severity:string, label:string}>,
 *   reviewSignals: Array<{id:string, severity:string, label:string}>,
 *   informational: Array<{id:string, severity:string, label:string}>,
 *   requiresCoachReview: boolean,
 *   statement: string,
 * }}
 */
export function releaseDecision(blueprint) {
  const flags = blueprint?.flags || [];
  const blockedBy = flags.filter((f) => BLOCKING_SEVERITIES.includes(f.severity));
  const reviewSignals = flags.filter((f) => REVIEW_SEVERITIES.includes(f.severity));
  const informational = flags.filter((f) => f.severity === 'info');
  const releasable = blockedBy.length === 0;

  const statement = releasable
    ? (reviewSignals.length
      ? `Released. ${reviewSignals.length} signal(s) sent to the coach alongside the programme, `
        + 'not in front of it — every hard safety condition was applied during generation.'
      : 'Released. No coach signals.')
    : `Held. ${blockedBy.map((f) => f.id).join(', ')}.`;

  return {
    releasable,
    blockedBy,
    reviewSignals,
    informational,
    // Kept separate from `releasable` on purpose: a coach still has things to
    // look at, and that is not the same question as whether the player waits.
    requiresCoachReview: reviewSignals.length > 0,
    statement,
    version: RELEASE_POLICY_VERSION,
  };
}
