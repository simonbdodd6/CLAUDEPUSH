/**
 * @brain/evidence-contracts — Canonical enums (M43)
 *
 * The single source-of-truth value sets for AI Brain evidence ingestion, taken
 * verbatim from the approved M42 Evidence Ingestion Architecture. Pure, frozen
 * constants. No logic, no I/O, no LLM, no randomness, no storage.
 *
 * DORMANT in M43 — nothing imports them yet, so there is no runtime behaviour
 * change. A shape/parity test asserts they match the architecture document so the
 * two can never silently diverge.
 */

/** Evidence contract version (the shape of an EvidenceRecord). */
export const EVIDENCE_CONTRACT_VERSION = '1.0'

/** Source family — the two trust families (§1). */
export const SOURCE_FAMILY = Object.freeze({
  PROVIDER: 'provider',   // automatic feeds — generally higher trust (after verification)
  MANUAL:   'manual',     // coach-entered — first-class, lower default confidence
})

/**
 * Source type — `<family>.<name>` (§1). Every value is namespaced by its family
 * so `sourceType.split('.')[0]` always yields a SOURCE_FAMILY value.
 */
export const SOURCE_TYPE = Object.freeze({
  // provider
  PROVIDER_FRAME_SPORTS:           'provider.frameSports',
  PROVIDER_VIDEO:                  'provider.video',
  PROVIDER_STATS_IMPORT:           'provider.statsImport',
  // manual
  MANUAL_COACH_OBSERVATION:        'manual.coachObservation',
  MANUAL_MATCH_NOTE:               'manual.matchNote',
  MANUAL_VIDEO_TAG:                'manual.videoTag',
  MANUAL_TEAM_SHEET:               'manual.teamSheet',
  MANUAL_POST_MATCH_QUESTIONNAIRE: 'manual.postMatchQuestionnaire',
  MANUAL_SCOUTING_NOTE:            'manual.scoutingNote',
  MANUAL_CONTEXT_NOTE:             'manual.contextNote',
})

/** Subject type — what an EvidenceRecord is about (§2). Keys into the knowledge graph. */
export const SUBJECT_TYPE = Object.freeze({
  PLAYER:   'player',
  TEAM:     'team',
  COACH:    'coach',
  FIXTURE:  'fixture',
  OPPONENT: 'opponent',
  CLUB:     'club',
  DRILL:    'drill',
  SESSION:  'session',
})

/** Who/what authored a record (§2). */
export const AUTHOR_KIND = Object.freeze({
  COACH:    'coach',
  PROVIDER: 'provider',
  SYSTEM:   'system',     // pipeline / deterministic derivation
})

/** Signal polarity — how a normalized signal reads (§2). */
export const SIGNAL_POLARITY = Object.freeze({
  STRENGTH: 'strength',
  WEAKNESS: 'weakness',
  NEUTRAL:  'neutral',
})

/** Privacy / sensitivity level — drives access + retention (§2 / §4.9). */
export const SENSITIVITY = Object.freeze({
  PUBLIC:     'public',
  CLUB:       'club',
  MEDICAL:    'medical',
  RESTRICTED: 'restricted',
})

/** Audit action — every state transition a record may record (§2 / §3). Append-only. */
export const AUDIT_ACTION = Object.freeze({
  RECEIVED:     'received',
  VALIDATED:    'validated',
  NORMALIZED:   'normalized',
  DEDUPLICATED: 'deduplicated',
  LINKED:       'linked',
  REWEIGHTED:   'reweighted',
  SUPERSEDED:   'superseded',
  REJECTED:     'rejected',
  REDACTED:     'redacted',
})

/** Conflict flag raised by reweighting when evidence disagrees (§4.5 / §6). */
export const DISPUTED_FLAG = 'disputed'
