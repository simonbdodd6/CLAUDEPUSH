/**
 * AI Brain — Live Match Event Store (M27)
 *
 * Normalises and stores live match events (append-only, per matchId). Each event
 * is assigned a stable evidence id so every downstream recommendation can cite
 * the exact moments that justify it. Pure derivation; the only state is an
 * in-memory per-match log.
 */

import { EVENT } from './match-state.js'

/** Normalise a raw event, assigning an evidence id and defaulting fields. */
export function normaliseEvent(raw, index = 0) {
  const minute = typeof raw?.minute === 'number' ? raw.minute : 0
  const type = raw?.type ?? EVENT.RUCK
  const team = raw?.team === 'them' ? 'them' : 'us'
  return {
    eventId: raw?.eventId ?? `ev-${minute}-${type}-${index}`,
    minute,
    type,
    team,
    zone: raw?.zone ?? null,
    data: raw?.data ?? {},
  }
}

export function normaliseEvents(rawEvents = []) {
  return (Array.isArray(rawEvents) ? rawEvents : []).map((e, i) => normaliseEvent(e, i))
}

// ── in-memory per-match store ────────────────────────────────────────────────

const store = new Map()   // matchId → events[]

export function recordEvents(matchId, rawEvents) {
  if (!matchId) return 0
  const cur = store.get(matchId) ?? []
  const startIndex = cur.length
  const next = [...cur, ...normaliseEvents(Array.isArray(rawEvents) ? rawEvents : [rawEvents]).map((e, i) => ({
    ...e, eventId: e.eventId ?? `ev-${matchId}-${startIndex + i}`,
  }))]
  store.set(matchId, next)
  return next.length
}

export function recordEvent(matchId, rawEvent) {
  return recordEvents(matchId, [rawEvent])
}

export function getEvents(matchId) {
  return store.get(matchId) ?? []
}

export function resetMatch(matchId) {
  if (!matchId) return null
  store.delete(matchId)
  return { matchId, reset: true }
}

export function _clear() {
  store.clear()
}
