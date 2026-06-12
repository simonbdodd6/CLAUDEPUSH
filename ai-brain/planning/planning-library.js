/**
 * AI Brain — Planning Library (M14)
 *
 * Template definitions for each plan scope.
 * Pure data — no functions except goalTemplate (string interpolation only).
 *
 * Each template defines:
 *   goalTemplate(rec)          — goal string built from the recommendation
 *   estimatedDurationDays      — total plan length
 *   actions[]                  — ordered action steps with day offsets
 *   checkpoints[]              — milestone markers with day offsets
 *
 * Action fields: { title, description, estimatedMinutes, dayOffset }
 * Checkpoint fields: { label, dayOffset, description }
 *
 * No LLM calls. No randomness. Templates are deterministic given the same rec.
 */

import { PLAN_SCOPE } from './planning-types.js'

const TEMPLATES = {

  // ── Attendance improvement plan ─────────────────────────────────────────────
  [PLAN_SCOPE.ATTENDANCE]: {
    goalTemplate: rec => `Improve team attendance: ${rec.title}`,
    estimatedDurationDays: 21,
    actions: [
      {
        title:            'Review recent attendance records',
        description:      'Analyse attendance patterns over the last four weeks and identify trends.',
        estimatedMinutes: 30,
        dayOffset:        1,
      },
      {
        title:            'Identify barriers to attendance',
        description:      'Speak with players individually to understand personal barriers to attendance.',
        estimatedMinutes: 60,
        dayOffset:        3,
      },
      {
        title:            'Communicate attendance standards to squad',
        description:      'Deliver a clear message on attendance expectations and the impact on selection.',
        estimatedMinutes: 20,
        dayOffset:        5,
      },
      {
        title:            'Implement consistent attendance tracking',
        description:      'Set up a reliable process for recording and monitoring session attendance.',
        estimatedMinutes: 30,
        dayOffset:        7,
      },
      {
        title:            'Review attendance progress at three weeks',
        description:      'Assess whether attendance has improved and identify any remaining issues.',
        estimatedMinutes: 30,
        dayOffset:        21,
      },
    ],
    checkpoints: [
      { label: 'Week 1', dayOffset: 7,  description: 'Records reviewed and individual barriers identified.' },
      { label: 'Week 2', dayOffset: 14, description: 'Standards communicated and tracking implemented.' },
      { label: 'Week 3', dayOffset: 21, description: 'Attendance trends reassessed and outcomes reviewed.' },
    ],
  },

  // ── Load reduction plan ─────────────────────────────────────────────────────
  [PLAN_SCOPE.LOAD]: {
    goalTemplate: rec => `Reduce and manage session load: ${rec.title}`,
    estimatedDurationDays: 14,
    actions: [
      {
        title:            'Review current training load data',
        description:      'Assess session intensity, volume, and player wellness scores over the past two weeks.',
        estimatedMinutes: 30,
        dayOffset:        1,
      },
      {
        title:            'Consult fitness and conditioning staff',
        description:      'Review load data with relevant staff and agree on required adjustments.',
        estimatedMinutes: 45,
        dayOffset:        3,
      },
      {
        title:            'Adjust session plan for the coming week',
        description:      'Modify training design to reduce acute load for affected players.',
        estimatedMinutes: 60,
        dayOffset:        5,
      },
      {
        title:            'Monitor player response to adjusted sessions',
        description:      'Collect wellness and RPE data following adjusted sessions.',
        estimatedMinutes: 20,
        dayOffset:        10,
      },
      {
        title:            'Review outcomes and confirm new load baseline',
        description:      'Assess whether adjustments achieved the desired outcome and document the new baseline.',
        estimatedMinutes: 30,
        dayOffset:        14,
      },
    ],
    checkpoints: [
      { label: 'Week 1', dayOffset: 7,  description: 'Load reviewed and adjusted sessions delivered.' },
      { label: 'Week 2', dayOffset: 14, description: 'Player responses monitored and new baseline confirmed.' },
    ],
  },

  // ── Player welfare review plan ──────────────────────────────────────────────
  [PLAN_SCOPE.WELFARE]: {
    goalTemplate: rec => `Conduct player welfare review: ${rec.title}`,
    estimatedDurationDays: 7,
    actions: [
      {
        title:            'Schedule welfare review with appropriate staff',
        description:      'Arrange time with medical, welfare, or coaching staff as required by the situation.',
        estimatedMinutes: 15,
        dayOffset:        1,
      },
      {
        title:            'Conduct player welfare assessment',
        description:      'Meet with the player to understand their situation and current wellbeing.',
        estimatedMinutes: 60,
        dayOffset:        2,
      },
      {
        title:            'Document findings and agreed next steps',
        description:      'Record assessment outcomes and any agreed support, referrals, or accommodations.',
        estimatedMinutes: 30,
        dayOffset:        3,
      },
      {
        title:            'Brief coaching staff on relevant outcomes',
        description:      'Share relevant (non-private) findings with the coaching staff.',
        estimatedMinutes: 20,
        dayOffset:        5,
      },
      {
        title:            'Follow up with player to confirm support is in place',
        description:      'Check in with the player to ensure agreed actions have been taken.',
        estimatedMinutes: 20,
        dayOffset:        7,
      },
    ],
    checkpoints: [
      { label: 'Day 3', dayOffset: 3, description: 'Welfare assessment completed and findings documented.' },
      { label: 'Day 7', dayOffset: 7, description: 'Follow-up completed and support confirmed.' },
    ],
  },

  // ── Selection review plan ───────────────────────────────────────────────────
  [PLAN_SCOPE.SELECTION]: {
    goalTemplate: rec => `Review player selection: ${rec.title}`,
    estimatedDurationDays: 7,
    actions: [
      {
        title:            'Review player availability and recent form',
        description:      'Gather data on fitness, form, and availability for each player under consideration.',
        estimatedMinutes: 30,
        dayOffset:        1,
      },
      {
        title:            'Consult with assistant coach',
        description:      'Discuss selection options and considerations with the coaching team.',
        estimatedMinutes: 30,
        dayOffset:        2,
      },
      {
        title:            'Review opposition and tactical requirements',
        description:      'Consider team selection in light of the upcoming opposition and game plan.',
        estimatedMinutes: 30,
        dayOffset:        3,
      },
      {
        title:            'Finalise selection decision',
        description:      'Confirm the selection with all required coaching and management approvals.',
        estimatedMinutes: 20,
        dayOffset:        5,
      },
      {
        title:            'Communicate decision to squad',
        description:      'Inform relevant players of the selection outcome and next steps.',
        estimatedMinutes: 15,
        dayOffset:        6,
      },
    ],
    checkpoints: [
      { label: 'Day 3', dayOffset: 3, description: 'Data reviewed and coaching discussion completed.' },
      { label: 'Day 5', dayOffset: 5, description: 'Selection decision finalised.' },
    ],
  },

  // ── Match preparation checklist ─────────────────────────────────────────────
  [PLAN_SCOPE.PREPARATION]: {
    goalTemplate: rec => `Match preparation checklist: ${rec.title}`,
    estimatedDurationDays: 7,
    actions: [
      {
        title:            'Confirm squad availability',
        description:      'Collect and confirm availability from all squad members for the fixture.',
        estimatedMinutes: 20,
        dayOffset:        1,
      },
      {
        title:            'Review opposition and prepare game plan',
        description:      'Analyse the upcoming opposition and agree on the tactical approach.',
        estimatedMinutes: 90,
        dayOffset:        2,
      },
      {
        title:            'Confirm logistics and travel arrangements',
        description:      'Verify venue, transport, kit, equipment, and all operational requirements.',
        estimatedMinutes: 30,
        dayOffset:        3,
      },
      {
        title:            'Deliver pre-match training session',
        description:      'Run the planned pre-match preparation session with the confirmed squad.',
        estimatedMinutes: 90,
        dayOffset:        5,
      },
      {
        title:            'Deliver pre-match team briefing',
        description:      'Brief the team on the game plan, individual roles, and expectations.',
        estimatedMinutes: 30,
        dayOffset:        6,
      },
    ],
    checkpoints: [
      { label: 'Day 3', dayOffset: 3, description: 'Squad confirmed, game plan prepared, logistics confirmed.' },
      { label: 'Day 6', dayOffset: 6, description: 'Pre-match training complete and team briefed.' },
    ],
  },

  // ── Availability follow-up plan ─────────────────────────────────────────────
  [PLAN_SCOPE.AVAILABILITY]: {
    goalTemplate: rec => `Follow-up plan for player availability: ${rec.title}`,
    estimatedDurationDays: 5,
    actions: [
      {
        title:            'Follow up with players who have not confirmed availability',
        description:      'Contact players with outstanding availability requests.',
        estimatedMinutes: 20,
        dayOffset:        1,
      },
      {
        title:            'Review confirmed availability and identify coverage gaps',
        description:      'Assess confirmed responses and flag any position or number gaps.',
        estimatedMinutes: 20,
        dayOffset:        2,
      },
      {
        title:            'Update selection options based on responses',
        description:      'Revise selection plans to account for confirmed availability.',
        estimatedMinutes: 30,
        dayOffset:        3,
      },
      {
        title:            'Confirm and communicate squad',
        description:      'Finalise and communicate the confirmed squad to all relevant parties.',
        estimatedMinutes: 15,
        dayOffset:        5,
      },
    ],
    checkpoints: [
      { label: 'Day 2', dayOffset: 2, description: 'Outstanding availability followed up.' },
      { label: 'Day 5', dayOffset: 5, description: 'Squad confirmed and communicated.' },
    ],
  },

  // ── Logistics coordination plan ─────────────────────────────────────────────
  [PLAN_SCOPE.LOGISTICS]: {
    goalTemplate: rec => `Coordinate logistics: ${rec.title}`,
    estimatedDurationDays: 14,
    actions: [
      {
        title:            'Identify all logistical requirements',
        description:      'List venue, transport, equipment, catering, and staffing needs in full.',
        estimatedMinutes: 30,
        dayOffset:        1,
      },
      {
        title:            'Contact venues and service providers',
        description:      'Make initial enquiries and provisional bookings with all relevant providers.',
        estimatedMinutes: 30,
        dayOffset:        3,
      },
      {
        title:            'Confirm all arrangements',
        description:      'Verify bookings and resolve any outstanding logistics items.',
        estimatedMinutes: 20,
        dayOffset:        7,
      },
      {
        title:            'Brief team and staff on confirmed arrangements',
        description:      'Communicate confirmed logistics to the squad, coaching staff, and volunteers.',
        estimatedMinutes: 15,
        dayOffset:        12,
      },
    ],
    checkpoints: [
      { label: 'Week 1', dayOffset: 7,  description: 'Requirements identified and contacts made.' },
      { label: 'Week 2', dayOffset: 14, description: 'All arrangements confirmed and team briefed.' },
    ],
  },

  // ── Club management plan ────────────────────────────────────────────────────
  [PLAN_SCOPE.CLUB]: {
    goalTemplate: rec => `Club management action plan: ${rec.title}`,
    estimatedDurationDays: 21,
    actions: [
      {
        title:            'Review situation and gather relevant data',
        description:      'Collect all relevant information to understand the club management situation fully.',
        estimatedMinutes: 45,
        dayOffset:        1,
      },
      {
        title:            'Consult with committee or club management',
        description:      'Discuss the situation with relevant club stakeholders and decision-makers.',
        estimatedMinutes: 60,
        dayOffset:        5,
      },
      {
        title:            'Develop a structured action plan',
        description:      'Agree on specific steps, responsibilities, owners, and timelines.',
        estimatedMinutes: 60,
        dayOffset:        10,
      },
      {
        title:            'Begin implementing agreed actions',
        description:      'Execute the initial steps of the agreed action plan.',
        estimatedMinutes: 60,
        dayOffset:        14,
      },
      {
        title:            'Review progress and adjust the plan',
        description:      'Assess progress at three weeks and revise the plan as needed.',
        estimatedMinutes: 30,
        dayOffset:        21,
      },
    ],
    checkpoints: [
      { label: 'Week 1', dayOffset: 7,  description: 'Situation fully assessed.' },
      { label: 'Week 2', dayOffset: 14, description: 'Action plan developed and initial steps begun.' },
      { label: 'Week 3', dayOffset: 21, description: 'Progress reviewed and plan adjusted as needed.' },
    ],
  },

  // ── Performance improvement plan (default) ──────────────────────────────────
  [PLAN_SCOPE.PERFORMANCE]: {
    goalTemplate: rec => `Performance improvement plan: ${rec.title}`,
    estimatedDurationDays: 14,
    actions: [
      {
        title:            'Assess current performance baseline',
        description:      'Review relevant metrics and establish the current performance level.',
        estimatedMinutes: 30,
        dayOffset:        1,
      },
      {
        title:            'Design targeted improvement interventions',
        description:      'Develop specific drills, sessions, or activities to address the performance gap.',
        estimatedMinutes: 45,
        dayOffset:        3,
      },
      {
        title:            'Implement interventions with squad',
        description:      'Deliver the designed interventions within training sessions.',
        estimatedMinutes: 60,
        dayOffset:        5,
      },
      {
        title:            'Monitor progress against baseline',
        description:      'Collect data on player and team response to the interventions.',
        estimatedMinutes: 30,
        dayOffset:        10,
      },
      {
        title:            'Review outcomes and refine approach',
        description:      'Assess progress against the baseline and adjust the plan as needed.',
        estimatedMinutes: 30,
        dayOffset:        14,
      },
    ],
    checkpoints: [
      { label: 'Week 1', dayOffset: 7,  description: 'Baseline established and interventions delivered.' },
      { label: 'Week 2', dayOffset: 14, description: 'Progress reviewed and approach refined.' },
    ],
  },

}

/**
 * Retrieve the plan template for the given scope.
 * Falls back to PERFORMANCE if the scope is unrecognised.
 */
export function getTemplate(scope) {
  return TEMPLATES[scope] ?? TEMPLATES[PLAN_SCOPE.PERFORMANCE]
}

export const ALL_SCOPES = Object.keys(TEMPLATES)
