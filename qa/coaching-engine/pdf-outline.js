/**
 * PDF outline schemas — defines the data structure that PDF generation will consume.
 * PDFs are NOT generated here. This module provides the structural contract
 * so that when PDF support is added later, the data shape is already defined.
 *
 * Usage: call getProgrammePDFOutline(programme) to get a PDF-ready data object.
 * Pass that object to the PDF generator (future module) to render the document.
 */

/**
 * Transform a programme output into a PDF-ready outline.
 * Sections map to pages/sections in the eventual PDF.
 */
export function getProgrammePDFOutline(programme) {
  if (!programme?.overview) throw new Error('getProgrammePDFOutline: invalid programme object');

  return {
    documentType: 'training-programme',
    meta: {
      title:       `${programme.overview.duration} Training Programme`,
      subtitle:    programme._meta?.player
        ? `${programme._meta.player.ageGroup} ${programme._meta.player.position}`
        : '',
      generatedAt: programme._meta?.generatedAt ?? new Date().toISOString(),
      pageCount:   estimatePageCount(programme),
    },
    coverPage: {
      title:         programme.overview.summary,
      duration:      programme.overview.duration,
      daysPerWeek:   programme.overview.daysPerWeek,
      primaryGoals:  programme.overview.primaryGoals,
    },
    sections: [
      {
        id:      'overview',
        title:   'Programme Overview',
        content: {
          keyConsiderations: programme.overview.keyConsiderations,
          weeklySplit:       programme.weeklySplit,
        },
      },
      {
        id:      'exercise-blocks',
        title:   'Training Blocks',
        content: programme.exerciseBlocks,
      },
      {
        id:      'conditioning',
        title:   'Conditioning Protocol',
        content: programme.conditioning,
      },
      {
        id:      'mobility',
        title:   'Mobility & Recovery',
        content: {
          mobility: programme.mobility,
          recovery: programme.recovery,
        },
      },
      {
        id:      'nutrition',
        title:   'Nutrition Guidelines',
        content: programme.nutritionNotes,
      },
      {
        id:      'progression',
        title:   'Progression & Testing',
        content: {
          progression: programme.progression,
          testing:     programme.testing,
        },
      },
      {
        id:      'coach-notes',
        title:   'Coach Notes',
        content: programme.coachNotes,
      },
    ],
    styling: {
      theme:        'rugby-dark',
      accentColour: '#1a5c2e',
      fontFamily:   'sans-serif',
      showPageNumbers: true,
      showLogo:     true,
    },
  };
}

/**
 * Transform a session output into a PDF-ready outline.
 */
export function getSessionPDFOutline(session) {
  if (!session?.theme) throw new Error('getSessionPDFOutline: invalid session object');

  return {
    documentType: 'training-session',
    meta: {
      title:       `${session.ageGroup} Training Session`,
      subtitle:    session.theme,
      generatedAt: session._meta?.generatedAt ?? new Date().toISOString(),
      pageCount:   2,
    },
    coverPage: {
      theme:           session.theme,
      duration:        `${session.duration} minutes`,
      ageGroup:        session.ageGroup,
      intensity:       session.intensity,
      equipmentNeeded: session.equipmentNeeded,
    },
    sections: [
      {
        id:      'warm-up',
        title:   'Warm-Up',
        content: session.warmUp,
      },
      ...session.skillBlocks.map((block, i) => ({
        id:      `skill-block-${i + 1}`,
        title:   block.title,
        content: block,
      })),
      {
        id:      'conditioning',
        title:   'Conditioning',
        content: session.conditioning,
      },
      {
        id:      'cool-down',
        title:   'Cool-Down & Debrief',
        content: session.coolDown,
      },
      {
        id:      'coaching-notes',
        title:   'Overall Coaching Points',
        content: {
          coachingPoints: session.overallCoachingPoints,
          safetyNotes:    session.safetyNotes,
        },
      },
    ],
    styling: {
      theme:        'session-card',
      accentColour: '#2c5f8a',
      fontFamily:   'sans-serif',
      showPageNumbers: false,
      showLogo:     true,
    },
  };
}

function estimatePageCount(programme) {
  const blockCount = programme.exerciseBlocks?.length ?? 2;
  return 2 + blockCount + 2; // cover + overview + blocks + conditioning/nutrition/notes
}
