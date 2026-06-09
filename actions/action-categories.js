// Coach's Eye Action Library — Category definitions

export const CATEGORY_IDS = {
  COACHING:           'COACHING',
  PLAYERS:            'PLAYERS',
  COMMUNICATIONS:     'COMMUNICATIONS',
  DIRECTOR_OF_RUGBY:  'DIRECTOR_OF_RUGBY',
  COMMITTEE:          'COMMITTEE',
  CLUB_OPERATIONS:    'CLUB_OPERATIONS',
};

export const CATEGORIES = {
  COACHING: {
    id:          'COACHING',
    name:        'Coaching',
    icon:        '🏉',
    description: 'Session planning, squad management, match preparation, player programmes.',
    roles:       ['coach', 'head_coach', 'dor', 'admin'],
    sortOrder:   1,
  },
  PLAYERS: {
    id:          'PLAYERS',
    name:        'Players',
    icon:        '👤',
    description: 'Player reviews, progress tracking, return-to-play, parent updates.',
    roles:       ['coach', 'head_coach', 'dor', 'admin'],
    sortOrder:   2,
  },
  COMMUNICATIONS: {
    id:          'COMMUNICATIONS',
    name:        'Communications',
    icon:        '📣',
    description: 'Newsletters, social media, sponsor and parent emails, announcements.',
    roles:       ['coach', 'committee', 'admin'],
    sortOrder:   3,
  },
  DIRECTOR_OF_RUGBY: {
    id:          'DIRECTOR_OF_RUGBY',
    name:        'Director of Rugby',
    icon:        '📊',
    description: 'Academy reviews, team comparisons, coach performance, pathways.',
    roles:       ['dor', 'admin'],
    sortOrder:   4,
  },
  COMMITTEE: {
    id:          'COMMITTEE',
    name:        'Committee',
    icon:        '🏛',
    description: 'Governance packs, health reports, membership, volunteers, AGM.',
    roles:       ['committee', 'chairperson', 'admin'],
    sortOrder:   5,
  },
  CLUB_OPERATIONS: {
    id:          'CLUB_OPERATIONS',
    name:        'Club Operations',
    icon:        '⚙️',
    description: 'Day-to-day club management, match day, events, campaigns.',
    roles:       ['admin', 'committee', 'dor'],
    sortOrder:   6,
  },
};

export function getCategory(id) {
  return CATEGORIES[id] ?? null;
}

export function listCategories() {
  return Object.values(CATEGORIES).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getCategoryRoles(categoryId) {
  return CATEGORIES[categoryId]?.roles ?? [];
}
