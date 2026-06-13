// Executive Knowledge Graph — worked cross-domain example.
//
// Demonstrates the canonical layer connecting FIVE domains through ONE graph, with a
// single shared person entity referenced across all of them ("exists only once").
// Uses a fixed clock so the produced graph is fully deterministic.

import { createExecutiveKnowledgeGraph } from './service.js';
import { ENTITY_TYPE, RELATIONSHIP_TYPE, DOMAIN } from './constants.js';

const FIXED = '2026-06-13T00:00:00.000Z';

/**
 * Build a populated, deterministic example graph.
 * @returns {ExecutiveKnowledgeGraph}
 */
export function buildExampleGraph() {
  const kg = createExecutiveKnowledgeGraph({ clock: () => FIXED });

  // ── Shared canonical people (domain = platform → referenced everywhere) ────────
  const simon = kg.addEntity({ domain: DOMAIN.PLATFORM, type: ENTITY_TYPE.PERSON, externalId: 'simon@coacheye.io', label: 'Simon Dodd', owner: 'simon@coacheye.io', ref: { engine: 'identity-platform', externalId: 'idn_simon' } });
  const emma  = kg.addEntity({ domain: DOMAIN.PLATFORM, type: ENTITY_TYPE.PERSON, externalId: 'emma@example.com', label: 'Emma Doyle', ref: { engine: 'identity-platform', externalId: 'idn_emma' } });

  // ── Coach's Eye ────────────────────────────────────────────────────────────────
  const team   = kg.addEntity({ domain: DOMAIN.COACHES_EYE, type: ENTITY_TYPE.TEAM, externalId: 'u16', label: 'U16 Squad', ref: { engine: 'memory-engine', externalId: 'team-u16' }, confidence: 90 });
  const player = kg.addEntity({ domain: DOMAIN.COACHES_EYE, type: ENTITY_TYPE.PLAYER, externalId: 'darragh-byrne', label: 'Darragh Byrne', ref: { engine: 'memory-engine', externalId: 'player-darragh' } });
  const evidence = kg.addEntity({ domain: DOMAIN.COACHES_EYE, type: ENTITY_TYPE.EVIDENCE, externalId: 'attendance-3wk', label: 'U16 attendance 58% over 3 weeks', ref: { engine: 'knowledge-engine', externalId: 'cit-1' } });
  const rec    = kg.addEntity({ domain: DOMAIN.COACHES_EYE, type: ENTITY_TYPE.RECOMMENDATION, externalId: 'rec-attendance-1', label: 'Run an attendance review for U16', confidence: 72, featureFlags: [{ key: 'autonomousAssistant', enabled: true }] });
  const decision = kg.addEntity({ domain: DOMAIN.COACHES_EYE, type: ENTITY_TYPE.DECISION, externalId: 'dec-1', label: 'Approve attendance review', confidence: 72 });

  kg.addRelationship({ from: simon.id,  to: team.id,     type: RELATIONSHIP_TYPE.OWNS, validFrom: FIXED });
  kg.addRelationship({ from: player.id, to: team.id,     type: RELATIONSHIP_TYPE.MEMBER_OF, validFrom: FIXED });
  kg.addRelationship({ from: rec.id,    to: team.id,     type: RELATIONSHIP_TYPE.ABOUT });
  kg.addRelationship({ from: rec.id,    to: evidence.id, type: RELATIONSHIP_TYPE.CITES, confidence: 90 });
  kg.addRelationship({ from: rec.id,    to: evidence.id, type: RELATIONSHIP_TYPE.DERIVED_FROM });
  kg.addRelationship({ from: rec.id,    to: decision.id, type: RELATIONSHIP_TYPE.DECIDED_BY });
  kg.linkApproval(rec.id, { approvalId: 'apr-9', state: 'approved', reviewer: 'simon@coacheye.io', at: FIXED });

  // A follow-up recommendation that depends on the attendance review (rec → rec).
  const followUp = kg.addEntity({ domain: DOMAIN.COACHES_EYE, type: ENTITY_TYPE.RECOMMENDATION, externalId: 'rec-followup-1', label: 'Schedule parent engagement session', confidence: 65 });
  kg.addRelationship({ from: followUp.id, to: rec.id, type: RELATIONSHIP_TYPE.DEPENDS_ON });

  // ── Website Lead Intelligence (SAME Simon, cross-domain) ───────────────────────
  const company = kg.addEntity({ domain: DOMAIN.WEBSITE_LEAD, type: ENTITY_TYPE.COMPANY, externalId: 'naas-rfc', label: 'Naas RFC', ref: { engine: 'lead-personalisation', externalId: 'club-naas' } });
  const lead    = kg.addEntity({ domain: DOMAIN.WEBSITE_LEAD, type: ENTITY_TYPE.LEAD, externalId: 'lead-naas', label: 'High-fit lead: Naas RFC', confidence: 81 });
  const leadRec = kg.addEntity({ domain: DOMAIN.WEBSITE_LEAD, type: ENTITY_TYPE.RECOMMENDATION, externalId: 'rec-outreach-naas', label: 'Send personalised outreach to Naas RFC', confidence: 81 });
  kg.addRelationship({ from: simon.id,   to: company.id, type: RELATIONSHIP_TYPE.WORKS_FOR });   // shared person
  kg.addRelationship({ from: lead.id,    to: company.id, type: RELATIONSHIP_TYPE.ABOUT });
  kg.addRelationship({ from: leadRec.id, to: lead.id,    type: RELATIONSHIP_TYPE.DEPENDS_ON });

  // ── Wedding Intelligence (SAME Emma) ───────────────────────────────────────────
  const venue   = kg.addEntity({ domain: DOMAIN.WEDDING, type: ENTITY_TYPE.VENUE, externalId: 'grange-manor', label: 'Grange Manor' });
  const booking = kg.addEntity({ domain: DOMAIN.WEDDING, type: ENTITY_TYPE.BOOKING, externalId: 'bk-emma-2026', label: 'Emma wedding booking' });
  kg.addRelationship({ from: emma.id,    to: booking.id, type: RELATIONSHIP_TYPE.OWNS });
  kg.addRelationship({ from: booking.id, to: venue.id,   type: RELATIONSHIP_TYPE.PART_OF });

  // ── Travel Intelligence (SAME Emma, cross-domain) ──────────────────────────────
  const trip = kg.addEntity({ domain: DOMAIN.TRAVEL, type: ENTITY_TYPE.TRIP, externalId: 'trip-bali-2026', label: 'Bali honeymoon', ref: { engine: 'trip-platform', externalId: 'trip_bali_1' } });
  kg.addRelationship({ from: emma.id, to: trip.id, type: RELATIONSHIP_TYPE.OWNS });

  return kg;
}
