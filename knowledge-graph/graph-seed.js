/**
 * Knowledge Graph — Seed Data
 *
 * Populates the graph with a rich demo dataset connecting all existing
 * Coach's Eye mock entities: coaches, players, teams, fixtures, sessions,
 * coaching principles, documents, recommendations, decisions, and engines.
 *
 * Called once on first use (guarded by isSeeded() in graph-store).
 */

import {
  buildCoach, buildClub, buildTeam, buildPlayer, buildFixture, buildTrainingSession,
  buildDrill, buildExercise, buildCoachingPrinciple, buildTheme, buildRecommendation,
  buildDecision, buildObservation, buildDocument, buildSeason, buildCompetition,
  buildPosition, buildIntelligenceEngine, buildKnowledgeBase,
  link,
} from './graph-builder.js'
import { isSeeded, markSeeded } from './graph-store.js'

function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString() }

export function seedGraph() {
  if (isSeeded()) return

  // ── Club & Coach ─────────────────────────────────────────────────────────────

  const club  = buildClub({ id: 'club-001', name: 'Lansdowne FC', location: 'Dublin', founded: 1872 })
  const simon = buildCoach({ id: 'coach-simon', name: 'Simon Dodd', role: 'Head Coach', clubId: club.id })

  // ── Positions ────────────────────────────────────────────────────────────────

  const posProp = buildPosition({ id: 'pos-prop',  name: 'Prop',       abbreviation: 'PR' })
  const posLock = buildPosition({ id: 'pos-lock',  name: 'Lock',       abbreviation: 'LK' })
  const posFlan = buildPosition({ id: 'pos-flank', name: 'Flanker',    abbreviation: 'FL' })
  const posSH   = buildPosition({ id: 'pos-sh',    name: 'Scrum-Half', abbreviation: 'SH' })

  // ── Teams ────────────────────────────────────────────────────────────────────

  const seniorA = buildTeam({ id: 'team-sra', name: 'Senior A',  ageGroup: 'Senior', division: 'All Ireland League' })
  const seniorB = buildTeam({ id: 'team-srb', name: 'Senior B',  ageGroup: 'Senior', division: 'Leinster League' })
  const under20 = buildTeam({ id: 'team-u20', name: 'Under 20s', ageGroup: 'U20',    division: 'Leinster U20' })
  const under18 = buildTeam({ id: 'team-u18', name: 'Under 18s', ageGroup: 'U18',    division: 'Leinster U18' })

  link.coaches(simon.id, seniorA.id)
  link.coaches(simon.id, seniorB.id)
  link.coaches(simon.id, under20.id)
  link.coaches(simon.id, under18.id)
  link.partOf(seniorA.id, club.id)
  link.partOf(seniorB.id, club.id)
  link.partOf(under20.id, club.id)
  link.partOf(under18.id, club.id)

  // ── Players ──────────────────────────────────────────────────────────────────

  const jack   = buildPlayer({ id: 'player-jack',  name: "Jack O'Sullivan", position: 'Prop',       clubId: club.id })
  const ross   = buildPlayer({ id: 'player-ross',  name: 'Ross Dunne',      position: 'Lock',       clubId: club.id })
  const conor  = buildPlayer({ id: 'player-conor', name: 'Conor Lynch',     position: 'Prop',       clubId: club.id })
  const sean   = buildPlayer({ id: 'player-sean',  name: "Séan Hennessy",   position: 'Scrum-Half', clubId: club.id })
  const liam   = buildPlayer({ id: 'player-liam',  name: 'Liam Walsh',      position: 'Flanker',    clubId: club.id })
  const ciaran = buildPlayer({ id: 'player-ciar',  name: "Ciarán Murphy",   position: 'Prop',       clubId: club.id })

  link.memberOf(jack.id,   seniorA.id)
  link.memberOf(ross.id,   seniorA.id)
  link.memberOf(conor.id,  seniorA.id)
  link.memberOf(sean.id,   seniorA.id)
  link.memberOf(liam.id,   seniorA.id)
  link.memberOf(ciaran.id, seniorA.id)

  link.hasPosition(jack.id,   posProp.id)
  link.hasPosition(conor.id,  posProp.id)
  link.hasPosition(ciaran.id, posProp.id)
  link.hasPosition(ross.id,   posLock.id)
  link.hasPosition(sean.id,   posSH.id)
  link.hasPosition(liam.id,   posFlan.id)

  // ── Season & Competition ─────────────────────────────────────────────────────

  const season2526 = buildSeason({ id: 'season-2526', name: '2025-26', startDate: '2025-09-01', endDate: '2026-05-31' })
  const aileague   = buildCompetition({ id: 'comp-ail',  name: 'All Ireland League', level: 'National',   region: 'Ireland' })
  const leinster   = buildCompetition({ id: 'comp-lein', name: 'Leinster League',    level: 'Provincial', region: 'Leinster' })

  link.contains(season2526.id, aileague.id)
  link.contains(season2526.id, leinster.id)

  // ── Fixtures ─────────────────────────────────────────────────────────────────

  const fixNaas     = buildFixture({ id: 'fix-naas',    homeTeam: 'Lansdowne FC', awayTeam: 'Naas RFC',        date: daysAgo(-5), competition: 'All Ireland League', venue: 'Aviva Drive' })
  const fixClontarf = buildFixture({ id: 'fix-clont',   homeTeam: 'Clontarf RFC', awayTeam: 'Lansdowne FC',    date: daysAgo(11), competition: 'All Ireland League', venue: 'Castle Avenue', result: 'W 23-10' })
  const fixBective  = buildFixture({ id: 'fix-bective', homeTeam: 'Lansdowne FC', awayTeam: 'Bective Rangers', date: daysAgo(25), competition: 'All Ireland League', venue: 'Aviva Drive',   result: 'W 18-12' })
  const fixTerenure = buildFixture({ id: 'fix-teren',   homeTeam: 'Terenure Col', awayTeam: 'Lansdowne FC',    date: daysAgo(39), competition: 'All Ireland League', venue: 'Lakelands',     result: 'L 14-21' })

  link.played(seniorA.id, fixNaas.id)
  link.played(seniorA.id, fixClontarf.id)
  link.played(seniorA.id, fixBective.id)
  link.played(seniorA.id, fixTerenure.id)
  link.contains(season2526.id, fixNaas.id)
  link.contains(season2526.id, fixClontarf.id)
  link.contains(season2526.id, fixBective.id)
  link.contains(season2526.id, fixTerenure.id)

  for (const p of [jack, conor, sean, liam]) { link.participatedIn(p.id, fixClontarf.id) }
  for (const p of [jack, conor, sean, liam]) { link.participatedIn(p.id, fixBective.id) }
  for (const p of [conor, sean, liam])       { link.participatedIn(p.id, fixTerenure.id) }

  // ── Training Sessions ────────────────────────────────────────────────────────

  const sessMatch = buildTrainingSession({ id: 'sess-001', date: daysAgo(2),  type: 'Match Week',      duration: 60, intensity: 'Medium',    teamId: seniorA.id })
  const sessDef   = buildTrainingSession({ id: 'sess-002', date: daysAgo(9),  type: 'Defensive Shape', duration: 90, intensity: 'High',      teamId: seniorA.id })
  const sessAtt   = buildTrainingSession({ id: 'sess-003', date: daysAgo(14), type: 'Attack Shape',    duration: 90, intensity: 'High',      teamId: seniorA.id })
  const sessScrum = buildTrainingSession({ id: 'sess-004', date: daysAgo(21), type: 'Set Piece',       duration: 75, intensity: 'High',      teamId: seniorA.id })
  const sessPreS  = buildTrainingSession({ id: 'sess-005', date: daysAgo(60), type: 'Conditioning',    duration: 90, intensity: 'Very High', teamId: seniorA.id })

  link.created(simon.id, sessMatch.id)
  link.created(simon.id, sessDef.id)
  link.created(simon.id, sessAtt.id)
  link.created(simon.id, sessScrum.id)
  link.contains(season2526.id, sessMatch.id)
  link.contains(season2526.id, sessDef.id)
  link.contains(season2526.id, sessAtt.id)
  link.contains(season2526.id, sessScrum.id)

  for (const p of [jack, conor, sean, liam])       { link.attended(p.id, sessMatch.id) }
  for (const p of [jack, conor, ross, sean, liam]) { link.attended(p.id, sessDef.id) }
  for (const p of [conor, sean, liam])             { link.attended(p.id, sessAtt.id) }
  for (const p of [jack, conor])                   { link.attended(p.id, sessScrum.id) }

  // ── Drills & Exercises ───────────────────────────────────────────────────────

  const drillBlitz    = buildDrill({ id: 'drill-blitz',   name: 'Blitz Defence Trigger',    description: 'Line speed off set piece on own 22',        skillLevel: 'Advanced',     duration: 15 })
  const drillDrift    = buildDrill({ id: 'drill-drift',   name: 'Drift Defence Alignment',  description: 'Midfield drift reads — outside shoulder',   skillLevel: 'Intermediate', duration: 12 })
  const drillWidthAtt = buildDrill({ id: 'drill-width',   name: 'Width-First Attack Shape', description: 'Pod alignment and width creation from 9',   skillLevel: 'Advanced',     duration: 20 })
  const drillScrumR   = buildDrill({ id: 'drill-scrumr',  name: 'Scrum Reset Sequence',     description: 'Crouch-bind-set timing and prop footwork',  skillLevel: 'All',          duration: 15 })
  const drillLineout  = buildDrill({ id: 'drill-lineout', name: 'Lineout Call Sequence',    description: 'Peel and drive variations from lineout',    skillLevel: 'Advanced',     duration: 18 })
  const exCond        = buildExercise({ id: 'ex-cond', name: 'Pre-Season Conditioning Block', category: 'Fitness',        description: '3-phase load progression GPP->SPP' })
  const exRPE         = buildExercise({ id: 'ex-rpe',  name: 'RPE Session Monitoring',        category: 'Load Management',description: 'Borg scale monitoring across training block' })

  link.uses(sessDef.id,   drillBlitz.id)
  link.uses(sessDef.id,   drillDrift.id)
  link.uses(sessAtt.id,   drillWidthAtt.id)
  link.uses(sessScrum.id, drillScrumR.id)
  link.uses(sessMatch.id, drillLineout.id)
  link.uses(sessPreS.id,  exCond.id)
  link.uses(sessPreS.id,  exRPE.id)

  // ── Coaching Principles ──────────────────────────────────────────────────────

  const prinWidth    = buildCoachingPrinciple({ id: 'prin-width',    name: 'Width First',          category: 'Attack',       description: 'Attack the wide channels before going narrow' })
  const prinPatient  = buildCoachingPrinciple({ id: 'prin-patient',  name: 'Patient at Breakdown', category: 'Attack',       description: 'Recycle and wait for space rather than forcing' })
  const prinBlitz    = buildCoachingPrinciple({ id: 'prin-blitz',    name: 'Blitz on Own 22',      category: 'Defence',      description: 'Aggressive line speed on own 22 to disrupt opposition' })
  const prinDrift    = buildCoachingPrinciple({ id: 'prin-drift',    name: 'Drift in Midfield',    category: 'Defence',      description: 'Structured drift defence in midfield' })
  const prinSetPiece = buildCoachingPrinciple({ id: 'prin-setpiece', name: 'Set Piece Dominance',  category: 'Forward Play', description: 'Control games through superior set-piece platform' })
  const prinLoad     = buildCoachingPrinciple({ id: 'prin-load',     name: 'Load Management',      category: 'Fitness',      description: 'Systematic load control to prevent fatigue and injury' })
  const prinCulture  = buildCoachingPrinciple({ id: 'prin-culture',  name: 'Challenge Culture',    category: 'Mental',       description: 'Build a team culture that embraces challenge and adversity' })
  const prinComms    = buildCoachingPrinciple({ id: 'prin-comms',    name: 'Direct Communication', category: 'Leadership',   description: 'Proactive direct communication before problems escalate' })

  link.teaches(drillBlitz.id,    prinBlitz.id)
  link.teaches(drillDrift.id,    prinDrift.id)
  link.teaches(drillWidthAtt.id, prinWidth.id)
  link.teaches(drillWidthAtt.id, prinPatient.id)
  link.teaches(drillScrumR.id,   prinSetPiece.id)
  link.teaches(drillLineout.id,  prinSetPiece.id)
  link.teaches(exCond.id,        prinLoad.id)
  link.teaches(exRPE.id,         prinLoad.id)

  // ── Themes ───────────────────────────────────────────────────────────────────

  const tAttack   = buildTheme({ id: 'theme-att', name: 'Attack structure',    category: 'Attack'      })
  const tDefence  = buildTheme({ id: 'theme-def', name: 'Defensive alignment', category: 'Defence'     })
  const tSetPiece = buildTheme({ id: 'theme-sp',  name: 'Set piece',           category: 'Forward'     })
  const tFitness  = buildTheme({ id: 'theme-fit', name: 'Fitness programming', category: 'Fitness'     })
  const tMedical  = buildTheme({ id: 'theme-med', name: 'Injury management',   category: 'Medical'     })
  const tCulture  = buildTheme({ id: 'theme-cul', name: 'Team culture',        category: 'Leadership'  })
  const tAnalysis = buildTheme({ id: 'theme-ana', name: 'Match analysis',      category: 'Performance' })
  const tPlayer   = buildTheme({ id: 'theme-dev', name: 'Player development',  category: 'Development' })

  link.relatedTo(tAttack.id,   prinWidth.id)
  link.relatedTo(tDefence.id,  prinBlitz.id)
  link.relatedTo(tDefence.id,  prinDrift.id)
  link.relatedTo(tSetPiece.id, prinSetPiece.id)
  link.relatedTo(tFitness.id,  prinLoad.id)
  link.relatedTo(tCulture.id,  prinCulture.id)
  link.relatedTo(tCulture.id,  prinComms.id)

  // ── Intelligence Engines ─────────────────────────────────────────────────────

  const engRec   = buildIntelligenceEngine({ id: 'eng-rec',   name: 'recommendation-engine', version: '1.0', capabilities: ['player', 'team', 'fixture', 'season'] })
  const engAtt   = buildIntelligenceEngine({ id: 'eng-att',   name: 'attendance-engine',      version: '1.0', capabilities: ['player', 'team'] })
  const engMatch = buildIntelligenceEngine({ id: 'eng-match', name: 'match-readiness-engine', version: '1.0', capabilities: ['fixture', 'squad'] })
  buildIntelligenceEngine({ id: 'eng-fit',   name: 'fitness-engine',         version: '1.0', capabilities: ['player', 'load', 'recovery'] })
  buildIntelligenceEngine({ id: 'eng-know',  name: 'knowledge-engine',       version: '1.0', capabilities: ['search', 'qa', 'citations'] })
  buildIntelligenceEngine({ id: 'eng-kg',    name: 'knowledge-graph-engine', version: '1.0', capabilities: ['graph', 'traverse', 'query', 'sync'] })

  // ── Knowledge Bases ──────────────────────────────────────────────────────────

  const coachDNA  = buildKnowledgeBase({ id: 'kb-coach-dna', name: 'Coach DNA',       scope: 'coach' })
  const clubKB    = buildKnowledgeBase({ id: 'kb-club',       name: 'Club Knowledge',  scope: 'club'  })
  buildKnowledgeBase({ id: 'kb-sessions', name: 'Session Library', scope: 'club' })

  // ── Documents ────────────────────────────────────────────────────────────────

  const docSeed = [
    { id: 'kd-seed-01', title: 'Pre-Season Conditioning Programme', fileType: 'pdf',        category: 'Training',          confidence: 89, status: 'added_to_knowledge_base', themes: [tFitness],                    principles: [prinLoad],                                      kbs: [coachDNA, clubKB], players: [] },
    { id: 'kd-seed-02', title: 'Match Analysis: vs Clontarf RFC',   fileType: 'xlsx',       category: 'Analysis',          confidence: 86, status: 'added_to_knowledge_base', themes: [tDefence, tSetPiece, tAnalysis], principles: [],                                          kbs: [clubKB],            players: [] },
    { id: 'kd-seed-03', title: 'Defensive System: Blitz & Drift',   fileType: 'pdf',        category: 'Performance',       confidence: 84, status: 'tagged',                  themes: [tDefence],                    principles: [prinBlitz, prinDrift],                          kbs: [],                  players: [] },
    { id: 'kd-seed-04', title: 'U20 Player Development Pathway',    fileType: 'docx',       category: 'Player Development',confidence: 91, status: 'reviewed',                themes: [tPlayer],                     principles: [],                                              kbs: [coachDNA],          players: [jack, conor] },
    { id: 'kd-seed-05', title: 'Session Plan: Attack Shape',        fileType: 'image',      category: 'Training',          confidence: 71, status: 'tagged',                  themes: [tAttack, tSetPiece],          principles: [prinWidth],                                     kbs: [],                  players: [] },
    { id: 'kd-seed-06', title: 'Opposition Analysis: Naas Kicking', fileType: 'video_link', category: 'Analysis',          confidence: 78, status: 'tagged',                  themes: [tAnalysis],                   principles: [],                                              kbs: [],                  players: [] },
    { id: 'kd-seed-07', title: 'Ross Dunne — RTP Protocol Notes',   fileType: 'note',       category: 'Medical',           confidence: 88, status: 'reviewed',                themes: [tMedical],                    principles: [],                                              kbs: [coachDNA],          players: [ross] },
    { id: 'kd-seed-08', title: 'Season 2025-26 Game Model',         fileType: 'pdf',        category: 'Performance',       confidence: 94, status: 'added_to_knowledge_base', themes: [tAttack, tDefence, tSetPiece],principles: [prinWidth, prinPatient, prinBlitz, prinDrift, prinSetPiece], kbs: [coachDNA, clubKB], players: [] },
    { id: 'kd-seed-09', title: 'Scrum Reset Drills U18 & U20',      fileType: 'docx',       category: 'Training',          confidence: 80, status: 'tagged',                  themes: [tSetPiece],                   principles: [prinSetPiece],                                  kbs: [],                  players: [] },
    { id: 'kd-seed-10', title: 'Annual Nutrition Guidelines',        fileType: 'pdf',        category: 'Medical',           confidence: 87, status: 'added_to_knowledge_base', themes: [tMedical, tFitness],          principles: [],                                              kbs: [clubKB],            players: [] },
    { id: 'kd-seed-11', title: 'Mental Performance Workshop Notes',  fileType: 'note',       category: 'Club',              confidence: 82, status: 'reviewed',                themes: [tCulture],                    principles: [prinCulture, prinComms],                        kbs: [coachDNA],          players: [] },
    { id: 'kd-seed-12', title: 'Lineout Calls Reference Card',       fileType: 'image',      category: 'Performance',       confidence: null,status: 'uploaded',               themes: [],                            principles: [],                                              kbs: [],                  players: [] },
  ]

  const docNodes = {}
  for (const d of docSeed) {
    const dn = buildDocument({ id: d.id, title: d.title, fileType: d.fileType, category: d.category, confidence: d.confidence, processingStatus: d.status, coach: 'Simon Dodd' })
    docNodes[d.id] = dn
    link.uploaded(simon.id, dn.id)
    for (const t  of d.themes)     link.covers(dn.id, t.id)
    for (const p  of d.principles) link.covers(dn.id, p.id)
    for (const pl of d.players)    link.mentions(dn.id, pl.id)
    for (const kb of d.kbs)        link.contributesTo(dn.id, kb.id)
  }

  // ── Observations ─────────────────────────────────────────────────────────────

  const obsConc  = buildObservation({ id: 'obs-001', title: '1 high-severity concussion protocol active', severity: 'high',   description: 'Ross Dunne — concussion protocol step 3. Not cleared for contact.', engine: engAtt.id })
  const obsProps = buildObservation({ id: 'obs-002', title: '2 Prop players unavailable — 5d to kickoff', severity: 'high',   description: 'Jack and Conor unavailable — selection action required.',           engine: engMatch.id })
  const obsAtt   = buildObservation({ id: 'obs-003', title: 'Senior A attendance 63% — below target',    severity: 'high',   description: 'Below target for 3 consecutive sessions.',                          engine: engAtt.id })
  const obsWelf  = buildObservation({ id: 'obs-004', title: 'Player welfare risk: Sean Hennessy',        severity: 'medium', description: 'Attendance not recovered. Digital twin welfare score critical.',     engine: engAtt.id })
  buildObservation({ id: 'obs-005', title: 'Match week: reduce training load', severity: 'medium', description: 'Fixture 5 days away. Optimal window to taper.', engine: engMatch.id })

  link.observedIn(obsConc.id,  fixNaas.id)
  link.observedIn(obsProps.id, fixNaas.id)
  link.hasMedicalEvent(ross.id,  obsConc.id)
  link.hasMedicalEvent(jack.id,  obsProps.id)
  link.hasMedicalEvent(conor.id, obsProps.id)

  // ── Recommendations ──────────────────────────────────────────────────────────

  const recMed  = buildRecommendation({ id: 'rec-001', title: '1 high-severity medical alert',              category: 'Medical',        priority: 'HIGH',   confidence: 92, source: engRec.id, description: 'Ross Dunne — concussion protocol active.',                    action: "Contact medical officer today. Update Ross's status before next training.", explainability: 'Any HIGH severity medical alert triggers this — safeguarding requirement.' })
  const recSel  = buildRecommendation({ id: 'rec-002', title: '2 Prop players unavailable — 5d to kickoff', category: 'Selection',      priority: 'HIGH',   confidence: 87, source: engRec.id, description: "Jack O'Sullivan (hamstring) and Conor Lynch (precautionary) unavailable.", action: 'Review squad depth at Prop. Consider repositioning or calling up cover.', explainability: 'Positional shortage below minimum cover within match week.' })
  const recAtt  = buildRecommendation({ id: 'rec-003', title: 'Match week: reduce training load',            category: 'Training',       priority: 'MEDIUM', confidence: 80, source: engRec.id, description: 'Fixture is 5 days away. Optimal window to taper intensity.',   action: 'Cap session length to 60 min. Focus on shape and set-pieces.',             explainability: 'Season intelligence detects match-week prep (5d to kickoff).' })
  const recWelf = buildRecommendation({ id: 'rec-004', title: '1 player flagged at welfare risk',             category: 'Player Welfare', priority: 'MEDIUM', confidence: 70, source: engRec.id, description: "Sean Hennessy's attendance has not recovered. Welfare score critical.", action: "Make direct contact with Sean. Consider a pastoral conversation.",       explainability: 'Digital twin welfare risk scoring re-flagged after attendance below 50% for 3 weeks.' })
  const recLoad = buildRecommendation({ id: 'rec-005', title: 'Training attendance dropped 18%',              category: 'Training',       priority: 'MEDIUM', confidence: 72, source: engRec.id, description: 'Average club-wide attendance 71%. Senior A lowest at 63%.',      action: 'Run attendance communication to all teams.',                               explainability: 'Attendance engine tracking 18% decline. Fires when below 80%.' })

  for (const rec of [recMed, recSel, recAtt, recWelf, recLoad]) link.generatedBy(rec.id, engRec.id)

  link.createdFrom(recMed.id,  obsConc.id)
  link.createdFrom(recSel.id,  obsProps.id)
  link.createdFrom(recAtt.id,  obsAtt.id)
  link.createdFrom(recWelf.id, obsWelf.id)
  link.createdFrom(recLoad.id, obsAtt.id)

  link.concerns(recMed.id,  ross.id)
  link.concerns(recSel.id,  jack.id)
  link.concerns(recSel.id,  conor.id)
  link.concerns(recWelf.id, sean.id)

  link.supports(prinLoad.id,     recAtt.id)
  link.supports(prinComms.id,    recWelf.id)
  link.supports(prinSetPiece.id, recSel.id)

  link.references(recMed.id, docNodes['kd-seed-07'].id)
  link.references(recSel.id, docNodes['kd-seed-08'].id)
  link.references(recAtt.id, docNodes['kd-seed-01'].id)

  // ── Decisions ────────────────────────────────────────────────────────────────

  const dec1 = buildDecision({ id: 'dec-001', action: 'Approved load reduction — Tuesday capped to 60 min',   outcome: 'Session modified. Squad freshness maintained.',    coach: 'Simon Dodd', timestamp: daysAgo(2)  })
  const dec2 = buildDecision({ id: 'dec-002', action: 'Conor Lynch cleared for contact',                      outcome: 'Started as sub vs Clontarf. No re-injury.',        coach: 'Simon Dodd', timestamp: daysAgo(3)  })
  const dec3 = buildDecision({ id: 'dec-003', action: 'Approved A/B squad rotation — back-to-back fixtures',  outcome: '6 players rotated. No fatigue injuries reported.', coach: 'Simon Dodd', timestamp: daysAgo(7)  })
  const dec4 = buildDecision({ id: 'dec-004', action: 'Video review: defensive line speed addressed',         outcome: 'Addressed in 2 sessions. Won next match 23-10.',   coach: 'Simon Dodd', timestamp: daysAgo(14) })

  link.resultedIn(recAtt.id,  dec1.id)
  link.resultedIn(recSel.id,  dec2.id)
  link.resultedIn(recLoad.id, dec3.id)

  link.accepted(simon.id, dec1.id)
  link.accepted(simon.id, dec2.id)
  link.accepted(simon.id, dec3.id)
  link.accepted(simon.id, dec4.id)

  // ── Temporal ordering ────────────────────────────────────────────────────────

  link.precedes(fixTerenure.id, fixBective.id)
  link.precedes(fixBective.id,  fixClontarf.id)
  link.follows(fixClontarf.id,  fixBective.id)

  link.similarTo(drillBlitz.id, drillDrift.id)

  markSeeded()
}
