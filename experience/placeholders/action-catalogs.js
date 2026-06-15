// ─── DEV-ONLY PLACEHOLDER ────────────────────────────────────────────────────
// Static action / quick-prompt catalogs lifted out of the old command-centre
// pages so the CommandBar has something to render. No live data, no /api calls,
// no engine/Core/@brain imports. Importable ONLY by experience/app/, which passes
// the data to the CommandBar as props. Replaced by real actions in a later phase.
// ─────────────────────────────────────────────────────────────────────────────

export const QUICK_PROMPTS = [
  { label: "Prepare Thursday's U14 training", icon: '🏉', category: 'COACHING' },
  { label: 'Show injured players',            icon: '🩺', category: 'PLAYERS' },
  { label: 'Create sponsor update',           icon: '📣', category: 'COMMUNICATIONS' },
  { label: 'Review attendance',               icon: '📊', category: 'COACHING' },
  { label: 'Club health report',              icon: '🏛',  category: 'COMMITTEE' },
  { label: 'Select the Senior squad',         icon: '👥', category: 'COACHING' },
  { label: 'Generate match report',           icon: '📝', category: 'COMMUNICATIONS' },
  { label: "Build this week's newsletter",    icon: '📰', category: 'COMMUNICATIONS' },
]

// Representative action records (shape mirrors the old api.actions() payload).
export const PLACEHOLDER_ACTIONS = [
  { id: 'a-train',   name: 'Prepare training session', description: 'Draft a session plan',      category: 'COACHING',       tags: ['training', 'session'] },
  { id: 'a-squad',   name: 'Select squad',             description: 'Build a matchday squad',    category: 'COACHING',       tags: ['selection', 'squad'] },
  { id: 'a-injury',  name: 'Review injuries',          description: 'List players in rehab',     category: 'PLAYERS',        tags: ['injury', 'medical'] },
  { id: 'a-news',    name: 'Draft newsletter',         description: 'Weekly club newsletter',    category: 'COMMUNICATIONS', tags: ['newsletter', 'comms'] },
  { id: 'a-sponsor', name: 'Sponsor update',           description: 'Update the main sponsor',   category: 'COMMUNICATIONS', tags: ['sponsor'] },
  { id: 'a-health',  name: 'Club health report',       description: 'Committee health snapshot', category: 'COMMITTEE',      tags: ['health', 'governance'] },
  { id: 'a-attend',  name: 'Attendance review',        description: 'Flag low attendance',       category: 'COACHING',       tags: ['attendance'] },
  { id: 'a-report',  name: 'Match report',             description: 'Generate a match report',   category: 'COMMUNICATIONS', tags: ['report', 'match'] },
]

// Page-specific catalogs (quarantined verbatim from the retired pages).
export const PLAYER_ACTIONS = [
  { id: 'p-card',    label: 'Open player card' },
  { id: 'p-message', label: 'Message player' },
  { id: 'p-flag',    label: 'Flag for review' },
]

export const REPORT_ACTIONS = [
  { id: 'r-health',  label: 'Club health' },
  { id: 'r-attend',  label: 'Attendance' },
  { id: 'r-season',  label: 'Season summary' },
]

export const COMMS_ACTIONS = [
  { id: 'c-news',    label: 'Newsletter' },
  { id: 'c-sponsor', label: 'Sponsor update' },
  { id: 'c-match',   label: 'Match report' },
]
