/**
 * Club Profile Builder
 *
 * Builds a structured profile for each lead, inferring:
 *   - likely age groups coached
 *   - top 3 pain points for this club's context
 *   - why Coach's Eye fits specifically
 *   - estimated squad size interpretation
 *
 * All inference is deterministic (no API calls) — based on country, level,
 * player count, and social presence.
 */

// ── Country context ────────────────────────────────────────────────────────────

const COUNTRY_CONTEXT = {
  Ireland: {
    unionName: 'IRFU',
    rugbyContext: 'strong community club culture with provincial affiliation (Leinster/Munster/Connacht/Ulster)',
    communicationStyle: 'heavily WhatsApp-reliant across many squads',
    painPoints: [
      'Managing player availability across 10+ age groups via fragmented WhatsApp threads',
      'IRFU registration and player welfare compliance across mini, youth, and senior squads',
      'Parent communication for large youth sections — coaches share personal phone numbers',
      'Last-minute drop-outs on match day with no centralised confirmation system',
    ],
    outreachTone: 'warm, community-focused, reference to the GAA-level club organisation they aspire to',
    angle: 'Replace the WhatsApp chaos. One app for all squads — from U8 minis to senior men and women.',
  },
  England: {
    unionName: 'RFU',
    rugbyContext: 'RFU-affiliated community club, often with club development plan requirements',
    communicationStyle: 'mix of club website, email newsletters, and group chats',
    painPoints: [
      'RFU safeguarding and concussion protocol documentation requirements',
      'Managing DBS checks and coach accreditation records',
      'Volunteer coach burnout from administrative load on top of coaching',
      'Coordinating multiple training groups across limited pitch time',
    ],
    outreachTone: 'professional, reference to RFU compliance and club development plans',
    angle: 'Built-in welfare documentation and coach communication — helps clubs meet RFU requirements without the admin overhead.',
  },
  France: {
    unionName: 'FFR',
    rugbyContext: 'FFR-affiliated club, often with strong local identity and structured federation requirements',
    communicationStyle: 'formal club channels plus messaging apps',
    painPoints: [
      'FFR player licensing and competition registration administration',
      'Coordinating multiple squads across a competitive regional structure',
      'Managing large membership databases with changing player rosters',
      'Communication between coach staff and committee structures',
    ],
    outreachTone: 'slightly more formal, reference to federation compliance and club professionalisation',
    angle: 'Streamline player registration and squad communication across all your FFR age groups.',
  },
  'New Zealand': {
    unionName: 'NZR',
    rugbyContext: 'NZR-affiliated club with strong youth development culture',
    communicationStyle: 'increasingly digital-first, strong on player pathways',
    painPoints: [
      'Geographic spread — managing players from rural areas with long travel times',
      'Player pathway tracking from age-grade through to senior',
      'Coordinating with provincial union requirements',
      'Retaining coaches and players in a multi-sport competitive environment',
    ],
    outreachTone: 'direct, practical, focus on player development pipeline',
    angle: 'Track your player development pipeline from U6 to senior. Built for how New Zealand clubs actually operate.',
  },
  Scotland: {
    unionName: 'Scottish Rugby',
    rugbyContext: 'Scottish Rugby-affiliated club, often managing geographical challenges',
    communicationStyle: 'heavy reliance on social media and messaging for recruitment and coordination',
    painPoints: [
      'Geographic spread across rural areas — coordinating away travel and kit',
      'Scottish Rugby compliance and licence requirements for coaches',
      'Player recruitment in a competitive environment with other sports',
      'Managing a large volunteer base with varying commitment levels',
    ],
    outreachTone: 'practical, community-focused, acknowledge the challenges of Scottish club rugby',
    angle: 'One app to coordinate your squad, communicate with parents, and track player development — even when your players are spread across the region.',
  },
  Wales: {
    unionName: 'WRU',
    rugbyContext: 'WRU-affiliated club with strong community heritage',
    communicationStyle: 'community-driven, social media and word-of-mouth heavy',
    painPoints: [
      'WRU community game development requirements and coaching accreditation',
      'Managing overlapping rugby and community commitments',
      'Building squad depth in increasingly competitive recruitment environment',
      'Recording and sharing coaching knowledge between volunteer coaches',
    ],
    outreachTone: 'passionate, community-oriented, acknowledge Welsh rugby heritage',
    angle: 'Give your coaches the tools used at professional clubs — built for community clubs.',
  },
  'South Africa': {
    unionName: 'SA Rugby',
    rugbyContext: 'SA Rugby-affiliated community club with strong competitive culture',
    communicationStyle: 'mix of WhatsApp, email, and social media',
    painPoints: [
      'Managing large player databases across multiple age groups',
      'Coordinating with provincial union structures and registration requirements',
      'Player welfare and injury tracking across contact-heavy rugby environment',
      'Retaining players as they progress through age groups',
    ],
    outreachTone: 'direct, results-focused, reference to high-performance culture at community level',
    angle: 'Professional-grade squad management built for the intensity of South African club rugby.',
  },
  Australia: {
    unionName: 'Rugby Australia',
    rugbyContext: 'Rugby Australia-affiliated club competing against AFL, NRL for player retention',
    communicationStyle: 'digital-first, strong on social media presence',
    painPoints: [
      'Competing with other football codes for player numbers',
      'Managing multi-sport athlete schedules and availability',
      'Rugby Australia community game compliance requirements',
      'Keeping players and families engaged across long seasons',
    ],
    outreachTone: 'energetic, player-experience focused, acknowledge multi-sport competitive environment',
    angle: 'Make rugby the most professionally managed sport in your players\'s lives — easy for families, powerful for coaches.',
  },
  Spain: {
    unionName: 'FER',
    rugbyContext: 'FER-affiliated club in a growing rugby market',
    communicationStyle: 'social media heavy, newer to digital club management tools',
    painPoints: [
      'Growing membership with limited administrative infrastructure',
      'Communication with new families unfamiliar with rugby culture',
      'Coordinating age-grade development in an emerging rugby market',
      'FER registration and competition administration',
    ],
    outreachTone: 'welcoming, growth-oriented, frame Coach\'s Eye as professionalising a growing club',
    angle: 'Grow your club professionally. Give your coaches and families the tools that established rugby nations take for granted.',
  },
};

const DEFAULT_COUNTRY_CONTEXT = {
  unionName: 'National Union',
  rugbyContext: 'community rugby club with developing club structure',
  communicationStyle: 'mixed digital and in-person communication',
  painPoints: [
    'Managing multiple squads across age groups with limited resources',
    'Coordinating player availability and match day logistics',
    'Keeping coaches and players engaged across a long season',
    'Administrative load on volunteer officials and coaches',
  ],
  outreachTone: 'professional, practical',
  angle: 'Simplify your squad management so coaches can focus on coaching.',
};

// ── Age group inference ────────────────────────────────────────────────────────

function inferAgeGroups(lead) {
  const { level, estimatedPlayers, country } = lead;
  const lvl = (level || '').toLowerCase();
  const players = estimatedPlayers || 0;

  if (lvl.includes('mini') || lvl.includes('junior') || lvl.includes('youth')) {
    return ['U8', 'U10', 'U12', 'U14'];
  }

  // Large clubs almost certainly have a full youth section
  if (players >= 200) return ['U8', 'U10', 'U12', 'U14', 'U16', 'Senior'];
  if (players >= 120) return ['U12', 'U14', 'U16', 'Senior'];
  if (players >= 60)  return ['U14', 'U16', 'Senior'];
  return ['Senior'];
}

function playerCountLabel(n) {
  if (!n) return 'unknown size';
  if (n >= 300) return 'large club (300+ players)';
  if (n >= 200) return 'established club (200–300 players)';
  if (n >= 100) return 'mid-size club (100–200 players)';
  if (n >= 50)  return 'community club (50–100 players)';
  return 'developing club (<50 players)';
}

function hasContactInfo(lead) {
  return {
    hasEmail: !!lead.email,
    hasWebsite: !!lead.website,
    hasSocial: !!(lead.socialFacebook || lead.socialInstagram),
  };
}

// ── Coach's Eye value proposition ─────────────────────────────────────────────

const CE_VALUE_PROPS = [
  'Built-in player availability — coaches know who is coming before training',
  'Direct coach-to-player messaging without sharing personal phone numbers',
  'Session planning tools with AI-generated coaching ideas',
  'Player development tracking from first session to senior',
  'Parent-facing communication for youth squads — safeguarding built in',
  'Match day lineup management and position assignment',
  'Attendance records for welfare and insurance purposes',
];

/**
 * Build a rich club profile from a lead record.
 * @param {object} lead
 * @returns {object} ClubProfile
 */
export function buildClubProfile(lead) {
  const ctx          = COUNTRY_CONTEXT[lead.country] || DEFAULT_COUNTRY_CONTEXT;
  const ageGroups    = inferAgeGroups(lead);
  const hasYouth     = ageGroups.some(ag => ag !== 'Senior');
  const contact      = hasContactInfo(lead);
  const sizeLabel    = playerCountLabel(lead.estimatedPlayers);

  // Select the 3 most relevant pain points
  const painPoints   = ctx.painPoints.slice(0, 3);
  if (hasYouth) {
    painPoints[2] = 'Parent communication for youth squads — coaches need a safe, professional channel';
  }

  // Select 2 most relevant CE value props
  const valueProp1   = ctx.angle;
  const valueProp2   = hasYouth
    ? 'Parent-facing communication built in — no more sharing coach mobile numbers with 200 parents.'
    : 'Session planning and player development tracking — gives volunteer coaches the tools of a professional set-up.';

  // Likely outreach contact role
  const contactRole  = ageGroups.includes('U8')
    ? 'Youth Development Officer or Club Secretary'
    : 'Club Secretary, Head Coach, or Rugby Director';

  return {
    clubName:       lead.clubName,
    country:        lead.country,
    unionName:      ctx.unionName,
    rugbyContext:   ctx.rugbyContext,
    sizeLabel,
    ageGroups,
    hasYouth,
    painPoints,
    valueProp1,
    valueProp2,
    outreachTone:   ctx.outreachTone,
    contactRole,
    contact,
    coachesEyeFit:  [valueProp1, valueProp2, ...CE_VALUE_PROPS.slice(0, 2)],
  };
}
