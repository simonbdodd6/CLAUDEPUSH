/**
 * AI Brain — Match Set-Piece Engine (M26)
 *
 * Produces scrum and lineout strategies from the opponent's set-piece picture,
 * our own coverage (Selection Assistant), format and posture. For sevens the
 * set-piece weight is low. Pure + deterministic, every rec evidence-backed.
 */

import { rec, block } from './game-model.js'
import { FORMAT, WEAK_DIM, STRONG_DIM } from './strategy-types.js'

export function buildScrumStrategy(model) {
  const recs = []
  const oppScrum = model.dim('scrumProfile')
  const sevens = model.format === FORMAT.SEVENS

  if (oppScrum != null && oppScrum <= WEAK_DIM) {
    recs.push(rec('scr-pressure', 'Pressure their scrum — pick scrums in their 22 and hunt the penalty',
      `Opponent scrum rated weak (${oppScrum}/100)`, model.dimEvidence('scrumProfile'),
      { priority: 'high', confidence: 0.8 }))
  } else if (oppScrum != null && oppScrum >= STRONG_DIM) {
    recs.push(rec('scr-quick', 'Keep scrum count low — quick ball, avoid resets and their dominant shove',
      `Opponent scrum rated strong (${oppScrum}/100)`, model.dimEvidence('scrumProfile'),
      { priority: 'high', confidence: 0.8 }))
  }
  recs.push(rec('scr-feed', 'Win our own feed cleanly with a fast channel-one strike',
    'Set-piece security underpins attack platform', [], { priority: 'medium', confidence: 0.65 }))

  const summary = sevens ? 'Scrum: minimal — secure own feed, exit fast' : 'Scrum strategy vs opponent pack'
  return block(summary, null, recs, model.confidence * (sevens ? 0.6 : 1))
}

export function buildLineoutStrategy(model) {
  const recs = []
  const oppLineout = model.dim('lineoutProfile')
  const ourLineout = model.lineoutStatus
  const sevens = model.format === FORMAT.SEVENS

  if (oppLineout != null && oppLineout <= WEAK_DIM) {
    recs.push(rec('lo-contest', 'Contest their throw aggressively — they are vulnerable on their own ball',
      `Opponent lineout rated weak (${oppLineout}/100)`, model.dimEvidence('lineoutProfile'),
      { priority: 'high', confidence: 0.8 }))
  } else if (oppLineout != null && oppLineout >= STRONG_DIM) {
    recs.push(rec('lo-maul-def', 'Set maul defence early and compete only on safe lineouts',
      `Opponent lineout rated strong (${oppLineout}/100)`, model.dimEvidence('lineoutProfile'),
      { priority: 'high', confidence: 0.75 }))
  }
  if (ourLineout === 'exposed') {
    recs.push(rec('lo-simplify', 'Simplify our calls and use a guaranteed front-ball option under pressure',
      'Our own lineout coverage is exposed (Selection Assistant)', [], { priority: 'high', confidence: 0.7 }))
  } else {
    recs.push(rec('lo-own', 'Secure our throw with varied calls; use the maul as an attacking weapon',
      'Lineout is our launchpad — keep it clean and varied', [], { priority: 'medium', confidence: 0.65 }))
  }

  const summary = sevens ? 'Lineout: 2-man, quick ball off the top' : 'Lineout strategy (attack + contest)'
  return block(summary, null, recs, model.confidence * (sevens ? 0.6 : 1))
}
