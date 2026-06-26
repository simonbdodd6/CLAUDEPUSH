/**
 * @coach-intelligence — Readiness Coach View Smoke Fixture (M219, DORMANT)
 *
 * A deterministic, representative sample of the M217 `coachView` — so we (and a future UI) can inspect
 * exactly what the read-only draft endpoint (M218) would return. It is NOT hand-fabricated: it runs the
 * real readiness chain (M209 → M208 → M211 → M212 → M213 → M217) over a fixed set of player records, so
 * it always conforms to the live contract and never drifts from it.
 *
 * It recommends nothing, ranks nobody, builds no team, calls no AI, and touches no
 * database/network/filesystem/timestamp/clock/randomness. Pure, deterministic; output deeply frozen.
 */

import { assessSquadReadiness } from './match-readiness-summary.js'
import { explainPlayerReadiness } from './match-readiness-explanations.js'
import { summarizeSquadReadiness } from './match-readiness-presenter.js'
import { gateReadinessReport } from './readiness-report-envelope.js'
import { buildReadinessEvidenceBundle } from './readiness-evidence-bundle.js'
import { buildReadinessCoachView } from './readiness-coach-view.js'

// A representative 20-player pool: enough available for a MATCH_READY status, but with many players
// whose fitness/attendance are unknown (Phase-0-realistic) so confidence is LOW with warnings, plus a
// returning-from-injury and a poor-attendance case for limiting factors, and a few unavailable.
const SAMPLE_RECORDS = Object.freeze([
  { playerId: 'p01', position: 'Loosehead Prop', availability: 'available', fitness: 'fit', attendance: 'good' },
  { playerId: 'p02', position: 'Hooker', availability: 'available', fitness: 'fit', attendance: 'good' },
  { playerId: 'p03', position: 'Tighthead Prop', availability: 'available', fitness: 'fit', attendance: 'good' },
  { playerId: 'p04', position: 'Lock', availability: 'available', fitness: 'fit', attendance: 'good' },
  { playerId: 'p05', position: 'Lock', availability: 'available', fitness: 'fit', attendance: 'good' },
  { playerId: 'p06', position: 'Openside Flanker', availability: 'available', fitness: 'returning', attendance: 'good' }, // injury concern
  { playerId: 'p07', position: 'Inside Centre', availability: 'available', fitness: 'fit', attendance: 'poor' },          // limited training
  // available, but only availability is known (fitness/attendance missing) → drives LOW confidence
  { playerId: 'p08', position: 'Blindside Flanker', availability: 'available' },
  { playerId: 'p09', position: 'Number 8', availability: 'available' },
  { playerId: 'p10', position: 'Scrum-half', availability: 'available' },
  { playerId: 'p11', position: 'Fly-half', availability: 'available' },
  { playerId: 'p12', position: 'Left Wing', availability: 'available' },
  { playerId: 'p13', position: 'Outside Centre', availability: 'available' },
  { playerId: 'p14', position: 'Right Wing', availability: 'available' },
  { playerId: 'p15', position: 'Fullback', availability: 'available' },
  { playerId: 'p16', position: 'Hooker', availability: 'available' },
  // unavailable / tentative (missing data)
  { playerId: 'p17', position: 'Lock', availability: 'unavailable' },
  { playerId: 'p18', position: 'Scrum-half', availability: 'unavailable' },
  { playerId: 'p19', position: 'Loosehead Prop', availability: 'unavailable' },
  { playerId: 'p20', position: 'Fly-half', availability: 'maybe' },
])

/**
 * Build the representative coach-view smoke fixture by running the real readiness chain (matches what
 * the M218 draft endpoint produces for the squad-readiness path).
 *
 * @returns {Readonly<object>}  an M217 coachView
 */
export function buildReadinessCoachViewSample() {
  const squadSummary = assessSquadReadiness(SAMPLE_RECORDS)                 // M209
  const explanations = SAMPLE_RECORDS.map(explainPlayerReadiness)          // M208
  const report = summarizeSquadReadiness({ readiness: squadSummary })      // M211 (no trend, as on the single-draft endpoint)
  const envelope = gateReadinessReport(report)                            // M212
  const bundle = buildReadinessEvidenceBundle({ explanations, squadSummary, report, envelope })  // M213
  return buildReadinessCoachView(bundle)                                  // M217 (deeply frozen)
}
