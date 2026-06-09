// Routes AI-generated items from all engines into the approval queue.
import { enqueue, getPending, stats } from './approval-queue.js';
import { createCard, cardsFromCommsDrafts, cardFromWorkflow, cardFromCopilot } from './approval-card.js';

// Route a full communications pack into the queue.
export function routeCommsPack(pack) {
  const cards = cardsFromCommsDrafts(pack.drafts ?? []);
  return cards.map(card => enqueue(card));
}

// Route individual communication draft.
export function routeCommsDraft(draft) {
  const [card] = cardsFromCommsDrafts([draft]);
  return enqueue(card);
}

// Route a workflow run result.
export function routeWorkflowResult(result, workflowName) {
  return enqueue(cardFromWorkflow(result, workflowName));
}

// Route a Copilot suggestion.
export function routeCopilotSuggestion(response) {
  return enqueue(cardFromCopilot(response));
}

// Route any generic item — used by orchestrator and other engines.
export function routeGeneric(options) {
  return enqueue(createCard(options));
}

// Seed the approval queue with representative demo items (used by CLI/dashboard).
export async function seedDemoApprovals(options = {}) {
  const { clubName = 'Kildare Valley RFC' } = options;
  const items = [];

  // Training session
  items.push(enqueue(createCard({
    type:        'training_session',
    title:       `Senior Training Session — Lineout & Set Piece`,
    generatedBy: 'coaching-engine',
    confidence:  88,
    evidence:    ['Generated from Senior squad data', 'Focus matches this week\'s fixture opponent analysis', 'Duration adjusted for 22 available players'],
    preview:     { summary: 'Full 90-minute session: lineout drills (30 min), set piece work (25 min), conditioned game (25 min), cool-down (10 min). 6 core exercises, 3 team drills.' },
    riskLevel:   'low',
    requiresRole:'coach',
  })));

  // Weekly newsletter
  items.push(enqueue(createCard({
    type:        'weekly_newsletter',
    title:       `Weekly Newsletter — ${new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long' })}`,
    generatedBy: 'communications-engine',
    confidence:  92,
    evidence:    ['Includes this week\'s results from 4 age groups', 'Player spotlight: Darragh Byrne (2 tries vs Naas RFC)', '3 upcoming fixtures listed', 'Coach message included'],
    preview:     { subject: `${clubName} Weekly Update — ${new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })}`, body: `Great week across all teams! Results, fixtures, and club news inside...` },
    riskLevel:   'high',
    requiresRole:'manager',
  })));

  // Sponsor update email
  items.push(enqueue(createCard({
    type:        'sponsor_update',
    title:       'Sponsor Update — Kildare Motor Group (Title Sponsor)',
    generatedBy: 'communications-engine',
    confidence:  85,
    evidence:    ['Title sponsor — highest sensitivity', 'Includes club statistics from this month', 'References 3 specific club achievements'],
    preview:     { subject: `${clubName} Sponsor Update — ${new Date().toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })}`, body: 'Dear Seán, Thank you for your continued support of Kildare Valley RFC as our title sponsor...' },
    riskLevel:   'high',
    requiresRole:'manager',
  })));

  // Player rehab programme
  items.push(enqueue(createCard({
    type:        'rehab_programme',
    title:       'Return-to-Play Programme — Darragh Byrne (Hamstring)',
    generatedBy: 'workflow-engine',
    confidence:  79,
    evidence:    ['AI-generated based on injury type and severity', 'Standard hamstring RTP protocol — 4 week programme', 'Requires sign-off by physio before commencing'],
    preview:     { summary: 'Phase 1 (week 1-2): pool walking, cycling. Phase 2 (week 3): light jog, agility. Phase 3 (week 4): contact training return. Estimated RTP: 28 days.' },
    riskLevel:   'high',
    requiresRole:'manager',
  })));

  // Social media post
  items.push(enqueue(createCard({
    type:        'social_media_post',
    title:       'Social Media: Match Result — Senior WIN vs Naas RFC 24-17',
    generatedBy: 'communications-engine',
    confidence:  95,
    evidence:    ['Result from official fixture data', 'Score verified: 24-17', 'POTM: Ciarán Murphy'],
    preview:     { summary: 'Facebook: 🟢🏆 WIN! Kildare Valley RFC 24 – 17 Naas RFC. Try scorers: D. Byrne (12\'), C. Murphy (34\'). ⭐ Man of the Match: Ciarán Murphy 👏 #KildareValleyRFC #rugby' },
    riskLevel:   'low',
    requiresRole:'coach',
  })));

  // Club intelligence report
  items.push(enqueue(createCard({
    type:        'club_intelligence_report',
    title:       'Weekly Club Intelligence Brief',
    generatedBy: 'club-intelligence',
    confidence:  82,
    evidence:    ['Based on 18 data sources (15 mock, 3 planned)', 'Health score trend: stable', '3 high-priority recommendations identified'],
    preview:     { summary: 'Club health: 72/100 (Grade B). Top issues: bar sales data gap, 2 lapsed memberships, volunteer shortage for Christmas Dinner. 3 recommendations: connect real data sources, run renewal campaign, recruit volunteers.' },
    riskLevel:   'medium',
    requiresRole:'coach',
  })));

  // Volunteer request
  items.push(enqueue(createCard({
    type:        'volunteer_request',
    title:       'Volunteer Request — Christmas Dinner (13 Dec)',
    generatedBy: 'communications-engine',
    confidence:  90,
    evidence:    ['Event confirmed in club calendar', 'Required roles: 3 stewards, 2 bar help, 4 set-up', 'Sent to 8 registered volunteers'],
    preview:     { subject: '🙋 Volunteer Request — Christmas Dinner, Saturday 13 December', body: 'Hi [Name], We need volunteers for Christmas Dinner on 13 December...' },
    riskLevel:   'medium',
    requiresRole:'coach',
  })));

  // Season plan
  items.push(enqueue(createCard({
    type:        'season_plan',
    title:       'Season Plan 2025-26 — Updated Objectives',
    generatedBy: 'workflow-engine',
    confidence:  71,
    evidence:    ['AI-generated from historical performance data', 'Incorporates current squad strength ratings', 'Flagged: 2 objectives may be aspirational given current data'],
    preview:     { summary: 'Season goals: Win Division 1 League (target: 8+ wins), register 200 members (currently 155), launch U8 tag programme (volunteer coach required).' },
    riskLevel:   'medium',
    requiresRole:'coach',
  })));

  return items;
}

export { getPending, stats };
