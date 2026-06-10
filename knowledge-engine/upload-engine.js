/**
 * Upload Engine — mock document processing for Knowledge Upload feature
 *
 * Handles upload tracking, mock extraction, and document library management.
 * No real AI or cloud storage. In-memory store seeded with sample documents.
 *
 * Production path: replace mockExtract() with calls to a document-intelligence
 * API (Azure Form Recogniser, Claude Documents API, etc.) and replace the
 * in-memory store with a real database (Postgres / SQLite).
 */

import { randomUUID } from 'crypto'

// ── In-memory store ───────────────────────────────────────────────────────────

let DOCS = null

function getStore() {
  if (!DOCS) DOCS = buildSeedDocs()
  return DOCS
}

// ── Mock extraction helpers ───────────────────────────────────────────────────

const CATEGORY_THEMES = {
  Training:            ['Session planning', 'Fitness programming', 'Strength & conditioning', 'Recovery protocols', 'Load management'],
  Selection:           ['Squad selection', 'Set piece', 'Attack structure', 'Defensive alignment', 'Squad depth'],
  Medical:             ['Injury management', 'Recovery protocols', 'Nutrition', 'Return to play'],
  Performance:         ['Match analysis', 'Opposition analysis', 'Video analysis', 'Game plan', 'Attack structure', 'Defensive alignment'],
  'Player Development':['Player development', 'Youth development', 'Leadership', 'Mental resilience', 'Skill benchmarking'],
  Club:                ['Team culture', 'Leadership', 'Communication', 'Mental resilience'],
  Analysis:            ['Match analysis', 'Opposition analysis', 'Video analysis', 'Game plan', 'Kick strategy'],
}

const FILETYPE_SUMMARIES = {
  pdf: [
    'Detailed coaching document covering {t1} and {t2}. Structured with diagrams, phase progressions, and drill sequences.',
    'Periodisation plan focusing on {t1}. Includes progressive load framework and {t2} protocols.',
    'Performance report with coaching analysis of {t1}. Contains benchmark comparisons and notes on {t2}.',
  ],
  docx: [
    'Coaching notes covering {t1} and {t2}. Contains session observations and feedback frameworks.',
    'Structured document on {t1} with practical applications for {t2}.',
    'Planning document covering {t1}. Team context included with notes on {t2}.',
  ],
  xlsx: [
    'Data tracking spreadsheet covering {t1}. Historical trends mapped against {t2}.',
    'Squad metrics with analysis of {t1}. Benchmarks aligned to {t2}.',
    'Performance matrix covering {t1} and {t2} with seasonal comparisons.',
  ],
  image: [
    'Tactical diagram illustrating {t1}. Field annotations show movement patterns for {t2}.',
    'Whiteboard coaching diagram. Primary focus: {t1}. Secondary context: {t2}.',
    'Drill blueprint image. Key themes: {t1} and {t2}.',
  ],
  video_link: [
    'Video resource covering {t1}. Supplementary content for {t2}.',
    'Footage analysis of {t1}. Coach commentary highlights applications for {t2}.',
    'External coaching content. Key themes: {t1} and {t2}.',
  ],
  note: [
    'Manual coaching note covering {t1} and {t2}. Direct observation context captured.',
    'Post-session notes on {t1}. Key issues identified: {t2}.',
    'Pre-planning notes covering {t1} with reference to {t2}.',
  ],
}

const CONFIDENCE_BY_TYPE = { pdf: 85, docx: 82, xlsx: 83, image: 68, video_link: 74, note: 78 }

function pickThemes(category, count) {
  const pool = CATEGORY_THEMES[category] ?? CATEGORY_THEMES.Training
  return [...pool].sort(() => 0.5 - Math.random()).slice(0, count)
}

function mockExtract(doc) {
  const themes = pickThemes(doc.category, 3)
  const templates = FILETYPE_SUMMARIES[doc.fileType] ?? FILETYPE_SUMMARIES.note
  const tpl = templates[Math.floor(Math.random() * templates.length)]
  const summary = tpl
    .replace('{t1}', themes[0]?.toLowerCase() ?? 'coaching fundamentals')
    .replace('{t2}', themes[1]?.toLowerCase() ?? 'player development')

  const confidence = CONFIDENCE_BY_TYPE[doc.fileType] ?? 75
  const suggestedTags = [
    ...themes.map(t => t.toLowerCase().replace(/\s+/g, '-').replace(/[&]/g, 'and')),
    doc.ageGroup && doc.ageGroup !== 'All' ? doc.ageGroup.toLowerCase().replace(/\s+/g, '-') : null,
    doc.season ? doc.season.replace('/', '-') : null,
    doc.category.toLowerCase().replace(/\s+/g, '-'),
  ].filter(Boolean)

  return { extractedSummary: summary, detectedThemes: themes, suggestedTags, confidence }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createDocument(fields) {
  const store = getStore()
  const id  = `kd-${randomUUID().slice(0, 8)}`
  const doc = {
    id,
    title:            fields.title           ?? 'Untitled document',
    fileType:         fields.fileType        ?? 'note',
    source:           fields.source          ?? 'upload',
    coach:            fields.coach           ?? 'Head Coach',
    team:             fields.team            ?? null,
    ageGroup:         fields.ageGroup        ?? null,
    season:           fields.season          ?? '2025-26',
    category:         fields.category        ?? 'Training',
    tags:             Array.isArray(fields.tags) ? fields.tags : [],
    uploadDate:       new Date().toISOString(),
    processingStatus: 'uploaded',
    extractedSummary: null,
    confidence:       null,
    linkedPlayers:    fields.linkedPlayers   ?? [],
    linkedTeams:      fields.linkedTeams     ?? (fields.team ? [fields.team] : []),
    linkedFixtures:   fields.linkedFixtures  ?? [],
    detectedThemes:   [],
    suggestedTags:    [],
    fileSize:         fields.fileSize        ?? null,
    pageCount:        fields.pageCount       ?? null,
    url:              fields.url             ?? null,
    notes:            fields.notes           ?? null,
    reviewNotes:      null,
  }
  store.unshift(doc)
  return doc
}

export function processDocument(id) {
  const store = getStore()
  const doc   = store.find(d => d.id === id)
  if (!doc) return null
  const extracted = mockExtract(doc)
  Object.assign(doc, extracted, { processingStatus: 'tagged' })
  return doc
}

export function getLibrary(filters = {}) {
  const store = getStore()
  let docs = [...store]

  if (filters.category && filters.category !== 'All') docs = docs.filter(d => d.category === filters.category)
  if (filters.ageGroup && filters.ageGroup !== 'All') docs = docs.filter(d => d.ageGroup === filters.ageGroup)
  if (filters.team     && filters.team     !== 'All') docs = docs.filter(d => d.team === filters.team || d.linkedTeams?.includes(filters.team))
  if (filters.season   && filters.season   !== 'All') docs = docs.filter(d => d.season === filters.season)
  if (filters.fileType && filters.fileType !== 'All') docs = docs.filter(d => d.fileType === filters.fileType)
  if (filters.status   && filters.status   !== 'All') docs = docs.filter(d => d.processingStatus === filters.status)
  if (filters.q) {
    const q = filters.q.toLowerCase()
    docs = docs.filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.extractedSummary?.toLowerCase().includes(q) ||
      d.tags.some(t => t.toLowerCase().includes(q)) ||
      d.detectedThemes.some(t => t.toLowerCase().includes(q))
    )
  }

  const all = store
  return {
    docs,
    total: docs.length,
    stats: {
      total:             all.length,
      uploaded:          all.filter(d => d.processingStatus === 'uploaded').length,
      extracting:        all.filter(d => d.processingStatus === 'extracting').length,
      tagged:            all.filter(d => d.processingStatus === 'tagged').length,
      reviewed:          all.filter(d => d.processingStatus === 'reviewed').length,
      inKnowledgeBase:   all.filter(d => d.processingStatus === 'added_to_knowledge_base').length,
      failed:            all.filter(d => d.processingStatus === 'failed').length,
    },
  }
}

export function getDocument(id) {
  return getStore().find(d => d.id === id) ?? null
}

export function updateDocumentStatus(id, status, notes) {
  const doc = getStore().find(d => d.id === id)
  if (!doc) return null
  doc.processingStatus = status
  if (notes) doc.reviewNotes = notes
  return doc
}

export { updateDocumentStatus as addToCoachDNA }
export { updateDocumentStatus as addToClubKnowledge }
export { updateDocumentStatus as flagForReview }

// ── Seed data ─────────────────────────────────────────────────────────────────

function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString() }

function buildSeedDocs() { return [
  {
    id: 'kd-seed-01', title: 'Senior A Pre-Season Conditioning Programme 2025-26',
    fileType: 'pdf', source: 'upload', coach: 'Simon Dodd', team: 'Senior A',
    ageGroup: 'Senior', season: '2025-26', category: 'Training',
    tags: ['pre-season', 'conditioning', 'strength', 'fitness'],
    uploadDate: daysAgo(14), processingStatus: 'added_to_knowledge_base',
    extractedSummary: 'Structured pre-season conditioning programme covering strength, power, and aerobic base phases. Includes weekly load progression from GPP through SPP. 12-week periodisation with daily RPE targets and recovery windows.',
    confidence: 89, detectedThemes: ['Fitness programming', 'Strength & conditioning', 'Recovery protocols'],
    suggestedTags: ['pre-season', 'conditioning', 'strength-and-conditioning', '2025-26'],
    linkedPlayers: [], linkedTeams: ['Senior A'], linkedFixtures: [],
    fileSize: '3.2 MB', pageCount: 24, url: null, notes: null, reviewNotes: null,
  },
  {
    id: 'kd-seed-02', title: 'Match Analysis: vs Clontarf RFC (15 Mar)',
    fileType: 'xlsx', source: 'upload', coach: 'Simon Dodd', team: 'Senior A',
    ageGroup: 'Senior', season: '2025-26', category: 'Analysis',
    tags: ['match-analysis', 'clontarf', 'defensive-line', 'set-piece'],
    uploadDate: daysAgo(11), processingStatus: 'added_to_knowledge_base',
    extractedSummary: 'Post-match performance metrics from vs Clontarf RFC. Defensive line speed identified as primary weakness. Set-piece success 78%. Exit efficiency 61% — below target of 75%.',
    confidence: 86, detectedThemes: ['Defensive alignment', 'Set piece', 'Match analysis'],
    suggestedTags: ['match-analysis', 'clontarf', 'set-piece', '2025-26'],
    linkedPlayers: [], linkedTeams: ['Senior A'], linkedFixtures: ['vs Clontarf RFC (15 Mar)'],
    fileSize: '1.8 MB', pageCount: null, url: null, notes: null, reviewNotes: null,
  },
  {
    id: 'kd-seed-03', title: 'Defensive System: Blitz & Drift Principles',
    fileType: 'pdf', source: 'upload', coach: 'Simon Dodd', team: null,
    ageGroup: 'All', season: '2025-26', category: 'Performance',
    tags: ['defence', 'blitz', 'drift', 'system'],
    uploadDate: daysAgo(9), processingStatus: 'tagged',
    extractedSummary: 'Coaching framework for the club\'s primary defensive system. Covers blitz triggers, drift situations, and ruck-edge reads. Includes progressive drill sequences from walk-through to live contact.',
    confidence: 84, detectedThemes: ['Defensive alignment', 'Game plan', 'Session planning'],
    suggestedTags: ['defence', 'blitz', 'drift', 'game-plan'],
    linkedPlayers: [], linkedTeams: ['Senior A', 'Senior B'], linkedFixtures: [],
    fileSize: '2.7 MB', pageCount: 18, url: null, notes: null, reviewNotes: null,
  },
  {
    id: 'kd-seed-04', title: 'U20 Player Development Pathway 2025',
    fileType: 'docx', source: 'upload', coach: 'Simon Dodd', team: 'Under 20s',
    ageGroup: 'U20', season: '2025-26', category: 'Player Development',
    tags: ['u20', 'development', 'pathway', 'skills'],
    uploadDate: daysAgo(7), processingStatus: 'reviewed',
    extractedSummary: 'Structured player development pathway for U20 squad. Covers technical skills benchmarks at 16, 18, and 20. Includes mentorship model and promotion criteria to Senior B.',
    confidence: 91, detectedThemes: ['Player development', 'Youth development', 'Leadership'],
    suggestedTags: ['u20', 'player-development', 'youth-development', '2025-26'],
    linkedPlayers: [{ id: 'p-jack', name: 'Jack O\'Sullivan' }, { id: 'p-conor', name: 'Conor Lynch' }],
    linkedTeams: ['Under 20s', 'Senior B'], linkedFixtures: [],
    fileSize: '1.4 MB', pageCount: 16, url: null, notes: null, reviewNotes: null,
  },
  {
    id: 'kd-seed-05', title: 'Session Plan: Tuesday Attack Shape (Match Week)',
    fileType: 'image', source: 'upload', coach: 'Simon Dodd', team: 'Senior A',
    ageGroup: 'Senior', season: '2025-26', category: 'Training',
    tags: ['attack', 'match-week', 'session-plan', 'shape'],
    uploadDate: daysAgo(5), processingStatus: 'tagged',
    extractedSummary: 'Tactical diagram for Tuesday match-week session. Whiteboard showing attack shape from lineout. Primary play: pod 3 carry from #8, secondary strike from #9 snipe. Includes backline width cues.',
    confidence: 71, detectedThemes: ['Attack structure', 'Set piece', 'Session planning'],
    suggestedTags: ['attack', 'lineout', 'match-week', 'session-plan'],
    linkedPlayers: [], linkedTeams: ['Senior A'], linkedFixtures: ['vs Naas RFC (Saturday)'],
    fileSize: '4.1 MB', pageCount: null, url: null, notes: null, reviewNotes: null,
  },
  {
    id: 'kd-seed-06', title: 'Opposition Analysis: Naas RFC Kicking Game',
    fileType: 'video_link', source: 'link', coach: 'Simon Dodd', team: 'Senior A',
    ageGroup: 'Senior', season: '2025-26', category: 'Analysis',
    tags: ['opposition', 'naas', 'kicking', 'video'],
    uploadDate: daysAgo(4), processingStatus: 'tagged',
    extractedSummary: 'Video analysis of Naas RFC kicking strategy. Primary kicker targets left-channel. Cross-field kick triggered from left-side lineout. Counter-kick game underdeveloped — attack high ball.',
    confidence: 78, detectedThemes: ['Kick strategy', 'Opposition analysis', 'Match analysis'],
    suggestedTags: ['opposition-analysis', 'naas', 'kicking-game', 'video-analysis'],
    linkedPlayers: [], linkedTeams: ['Senior A'], linkedFixtures: ['vs Naas RFC (Saturday)'],
    fileSize: null, pageCount: null, url: 'https://example.com/naas-kicking', notes: null, reviewNotes: null,
  },
  {
    id: 'kd-seed-07', title: 'Ross Dunne — Return to Play Protocol Notes',
    fileType: 'note', source: 'manual', coach: 'Simon Dodd', team: 'Senior A',
    ageGroup: 'Senior', season: '2025-26', category: 'Medical',
    tags: ['concussion', 'rtp', 'ross-dunne', 'medical'],
    uploadDate: daysAgo(3), processingStatus: 'reviewed',
    extractedSummary: 'Concussion protocol notes for Ross Dunne. Currently on Step 3. Medical officer sign-off required before progression to Step 4. Not cleared for contact until further assessment.',
    confidence: 88, detectedThemes: ['Injury management', 'Recovery protocols'],
    suggestedTags: ['concussion', 'return-to-play', 'ross-dunne', 'medical'],
    linkedPlayers: [{ id: 'p-ross', name: 'Ross Dunne' }],
    linkedTeams: ['Senior A'], linkedFixtures: [],
    fileSize: null, pageCount: null, url: null,
    notes: 'Ross attended Thursday light session. No headache reported. Dr. Murphy sign-off needed before Tuesday.',
    reviewNotes: null,
  },
  {
    id: 'kd-seed-08', title: 'Season 2025-26 Game Model — Full Document',
    fileType: 'pdf', source: 'upload', coach: 'Simon Dodd', team: null,
    ageGroup: 'All', season: '2025-26', category: 'Performance',
    tags: ['game-model', 'philosophy', 'attack', 'defence'],
    uploadDate: daysAgo(28), processingStatus: 'added_to_knowledge_base',
    extractedSummary: 'Club\'s overarching game model for 2025-26. Playing identity: width first, patience at breakdown. Defensive alignment: blitz on own 22, drift in midfield. Full set-piece ambition framework.',
    confidence: 94, detectedThemes: ['Game plan', 'Attack structure', 'Defensive alignment', 'Set piece'],
    suggestedTags: ['game-model', 'philosophy', '2025-26', 'attack-structure'],
    linkedPlayers: [], linkedTeams: ['Senior A', 'Senior B', 'Under 20s'], linkedFixtures: [],
    fileSize: '5.8 MB', pageCount: 42, url: null, notes: null, reviewNotes: null,
  },
  {
    id: 'kd-seed-09', title: 'Scrum Reset Drills — U18 & U20',
    fileType: 'docx', source: 'upload', coach: 'Simon Dodd', team: 'Under 20s',
    ageGroup: 'U18', season: '2025-26', category: 'Training',
    tags: ['scrum', 'u18', 'u20', 'drills'],
    uploadDate: daysAgo(21), processingStatus: 'tagged',
    extractedSummary: 'Technical drill progressions for scrum reset. Covers crouch-bind-set timing, prop footwork, and hooker strike sequencing. Designed for 15-minute warm-up blocks in junior sessions.',
    confidence: 80, detectedThemes: ['Scrum', 'Set piece', 'Session planning'],
    suggestedTags: ['scrum', 'set-piece', 'u18', 'drills'],
    linkedPlayers: [], linkedTeams: ['Under 20s', 'Under 18s'], linkedFixtures: [],
    fileSize: '0.9 MB', pageCount: 8, url: null, notes: null, reviewNotes: null,
  },
  {
    id: 'kd-seed-10', title: 'Annual Nutrition Guidelines — All Squads',
    fileType: 'pdf', source: 'upload', coach: 'Simon Dodd', team: null,
    ageGroup: 'All', season: '2025-26', category: 'Medical',
    tags: ['nutrition', 'recovery', 'hydration', 'diet'],
    uploadDate: daysAgo(35), processingStatus: 'added_to_knowledge_base',
    extractedSummary: 'Annual nutrition and hydration guidelines. Pre-match, post-match, and daily fuelling protocols. Recovery nutrition windows (0–30 min post-session). High-load period guidance.',
    confidence: 87, detectedThemes: ['Nutrition', 'Recovery protocols', 'Fitness programming'],
    suggestedTags: ['nutrition', 'recovery', 'hydration', '2025-26'],
    linkedPlayers: [], linkedTeams: ['Senior A', 'Senior B', 'Under 20s', 'Under 18s'], linkedFixtures: [],
    fileSize: '1.6 MB', pageCount: 14, url: null, notes: null, reviewNotes: null,
  },
  {
    id: 'kd-seed-11', title: 'Mental Performance Workshop Notes — Feb 2026',
    fileType: 'note', source: 'manual', coach: 'Simon Dodd', team: null,
    ageGroup: 'Senior', season: '2025-26', category: 'Club',
    tags: ['mental-performance', 'resilience', 'culture', 'workshop'],
    uploadDate: daysAgo(45), processingStatus: 'reviewed',
    extractedSummary: 'Notes from February mental performance workshop. Key themes: adversity response, pre-match routine standardisation, and building a challenge culture. Squad goal: "trust in the system".',
    confidence: 82, detectedThemes: ['Mental resilience', 'Team culture', 'Leadership'],
    suggestedTags: ['mental-performance', 'culture', 'leadership', 'resilience'],
    linkedPlayers: [], linkedTeams: ['Senior A', 'Senior B'], linkedFixtures: [],
    fileSize: null, pageCount: null, url: null,
    notes: 'Workshop facilitated by external consultant. Follow-up session scheduled April 2026.',
    reviewNotes: null,
  },
  {
    id: 'kd-seed-12', title: 'Lineout Calls Reference Card — 2025-26',
    fileType: 'image', source: 'upload', coach: 'Simon Dodd', team: 'Senior A',
    ageGroup: 'Senior', season: '2025-26', category: 'Performance',
    tags: ['lineout', 'calls', 'reference', 'set-piece'],
    uploadDate: daysAgo(1), processingStatus: 'uploaded',
    extractedSummary: null, confidence: null, detectedThemes: [], suggestedTags: [],
    linkedPlayers: [], linkedTeams: ['Senior A'], linkedFixtures: [],
    fileSize: '2.2 MB', pageCount: null, url: null, notes: null, reviewNotes: null,
  },
]}
