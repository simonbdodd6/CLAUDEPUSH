/**
 * Decision Centre
 *
 * Turns Coach's Eye Intelligence from a reporting dashboard into an AI assistant
 * that proposes actions. Coaches see prioritised recommendations, pending
 * decisions, a completed history, and a live impact preview panel.
 *
 * All data arrives via useIntelligenceDecisions() → /api/intelligence/decisions.
 * Action buttons (Approve / Dismiss / Remind Later) update local React state.
 * In production they call POST /api/intelligence/decisions/:id/approve|dismiss|snooze.
 *
 * Feature flag: aiDecisionCentre
 * Read-only. No Core logic duplicated. Uses existing engines only.
 */

import { useState, useCallback } from 'react'
import { useIntelligenceDecisions } from '../hooks/useClubData.js'
import { api } from '../api/client.js'

// ── Colour helpers ─────────────────────────────────────────────────────────────

function priorityBadge(p) {
  if (p === 'HIGH')   return 'bg-red-100   text-red-700   dark:bg-red-900/30   dark:text-red-400'
  if (p === 'MEDIUM') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return                     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
}
function priorityRing(p) {
  if (p === 'HIGH')   return 'border-red-200   dark:border-red-800/50'
  if (p === 'MEDIUM') return 'border-amber-200 dark:border-amber-800/50'
  return                     'border-green-200 dark:border-green-800/50'
}
function urgencyDot(u) {
  if (u === 'HIGH')   return 'bg-red-500'
  if (u === 'MEDIUM') return 'bg-amber-400'
  return 'bg-green-400'
}
function categoryDot(c) {
  const m = { Medical:'bg-red-400', Selection:'bg-orange-400', Training:'bg-amber-400',
               Logistics:'bg-blue-400', 'Player Welfare':'bg-purple-400', Club:'bg-indigo-400', Performance:'bg-green-400' }
  return m[c] ?? 'bg-surface-3'
}
function statusBadge(s) {
  if (s === 'new')          return 'bg-blue-100  text-blue-700  dark:bg-blue-900/30  dark:text-blue-300'
  if (s === 'acknowledged') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  if (s === 'completed')    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  return 'bg-surface-3 text-ink-3'
}
function categoryColor(c) {
  const m = { Medical:'text-red-500', Selection:'text-orange-500', Training:'text-amber-500',
               Logistics:'text-blue-500', 'Player Welfare':'text-purple-500', Club:'text-indigo-500', Performance:'text-green-500' }
  return m[c] ?? 'text-ink-3'
}

function relTime(ts) {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (diff < 2)  return 'just now'
  if (diff < 60) return `${diff}m ago`
  const h = Math.floor(diff / 60); if (h < 24) return `${h}h ago`
  return `${Math.floor(h/24)}d ago`
}

// ── Mock impact previews keyed by category ──────────────────────────────────

const IMPACT_MAP = {
  Medical: {
    currentLabel:  'Medical risk',
    actionLabel:   'Medical protocol',
    outcomes: [
      { label: 'Contact clearance',        value: 'Pending → Active', positive: true  },
      { label: 'Player welfare',            value: 'Protected',        positive: true  },
      { label: 'Squad contact risk',        value: '↓ eliminated',     positive: true  },
    ],
  },
  Selection: {
    currentLabel:  'Positional shortage',
    actionLabel:   'Squad adjustment',
    outcomes: [
      { label: 'Selection confidence',     value: '+8%',              positive: true  },
      { label: 'Scrum continuity',         value: 'Restored',         positive: true  },
      { label: 'Late withdrawal risk',     value: '↓ reduced',        positive: true  },
    ],
  },
  Training: {
    currentLabel:  'Training load',
    actionLabel:   'Load adjustment',
    outcomes: [
      { label: 'Fatigue risk',             value: '↓ 20%',            positive: true  },
      { label: 'Match-day freshness',      value: '↑ improved',       positive: true  },
      { label: 'Soft tissue injury risk',  value: '↓ 15%',            positive: true  },
    ],
  },
  Logistics: {
    currentLabel:  'Logistical conflict',
    actionLabel:   'Schedule adjustment',
    outcomes: [
      { label: 'Player load',              value: 'Managed',          positive: true  },
      { label: 'Fatigue across fixtures',  value: '↓ reduced',        positive: true  },
      { label: 'Recovery window',          value: '↑ extended',       positive: true  },
    ],
  },
  'Player Welfare': {
    currentLabel:  'Welfare risk flag',
    actionLabel:   'Direct contact',
    outcomes: [
      { label: 'Retention risk',           value: '↓ reduced',        positive: true  },
      { label: 'Player engagement',        value: '↑ likely improved', positive: true  },
      { label: 'Coach–player trust',       value: 'Strengthened',     positive: true  },
    ],
  },
  Club: {
    currentLabel:  'Club health metric',
    actionLabel:   'Engagement action',
    outcomes: [
      { label: 'Engagement score',         value: '+4–8 pts (est.)',   positive: true  },
      { label: 'Renewal risk',             value: '↓ reduced',        positive: true  },
      { label: 'Member satisfaction',      value: '↑ likely improved', positive: true  },
    ],
  },
  Performance: {
    currentLabel:  'Performance indicator',
    actionLabel:   'Coaching adjustment',
    outcomes: [
      { label: 'Training specificity',     value: '↑ aligned',        positive: true  },
      { label: 'Match-day performance',    value: '+5–10% (est.)',     positive: true  },
      { label: 'Season target tracking',   value: 'Maintained',       positive: true  },
    ],
  },
}

// ── Pending decision icons ─────────────────────────────────────────────────────

function PendingIcon({ type }) {
  if (type === 'publish_squad')   return <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M8 1L13.5 4v6L8 13 2.5 10V4L8 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M8 5v4M6 7h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
  if (type === 'contact_players') return <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><circle cx="6.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2"/><path d="M2 14c0-2.485 2.015-4.5 4.5-4.5S11 11.515 11 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M12 7l1.2 1.2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  if (type === 'medical_followup')return <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/><path d="M8 5.5V8.5M6.5 7H9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
  if (type === 'adjust_training') return <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M3 12V7l5-5 5 5v5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><rect x="6" y="9" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/></svg>
  return <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><rect x="2.5" y="3.5" width="11" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M5 3.5V2.5M11 3.5V2.5M2.5 7h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Sk({ h = 'h-28' }) {
  return <div className={`${h} rounded-xl bg-surface-2 animate-pulse`} />
}

// ── Section 1: High Priority Actions ─────────────────────────────────────────

function HighPriorityActions({ recs, dismissed, snoozed, onSelect, selectedId, onApprove, onDismiss, onSnooze }) {
  const visible = recs.filter(r => !dismissed.has(r.id) && !snoozed.has(r.id))

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold text-ink-1 text-sm">High Priority Actions</h2>
          <p className="text-[11px] text-ink-3 mt-0.5">AI Brain recommendations requiring your decision</p>
        </div>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${visible.filter(r=>r.priority==='HIGH').length > 0 ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-surface-3 text-ink-3'}`}>
          {visible.filter(r => r.priority === 'HIGH').length} HIGH
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-2xl mb-2">✓</div>
          <p className="text-sm text-ink-2 font-medium">All actions addressed</p>
          <p className="text-xs text-ink-3 mt-1">The AI Brain has no pending high-priority recommendations.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(r => {
            const selected = selectedId === r.id
            return (
              <div
                key={r.id}
                className={`card border transition-all duration-200 cursor-pointer ${selected ? 'border-accent/50 ring-1 ring-accent/20 shadow-accent/5' : priorityRing(r.priority)} hover:shadow-md`}
                onClick={() => onSelect(selected ? null : r)}
                role="button"
                tabIndex={0}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect(selected ? null : r)}
                aria-pressed={selected}
                aria-label={`Recommendation: ${r.title}`}
              >
                <div className="p-4">
                  {/* Header row */}
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${priorityBadge(r.priority)}`}>
                        {r.priority}
                      </span>
                      <span className="text-[10px] text-ink-3">{r.confidence}%</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink-1 leading-snug">{r.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-medium ${categoryColor(r.category)}`}>{r.category}</span>
                        <span className="text-[10px] text-ink-3">·</span>
                        <span className="text-[10px] text-ink-3">{r.source === 'mock' ? 'Preview mode' : r.source}</span>
                      </div>
                    </div>
                    <svg viewBox="0 0 12 12" fill="none" className={`w-3 h-3 text-ink-3 shrink-0 mt-1 transition-transform ${selected ? 'rotate-180' : ''}`}>
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>

                  {/* Expanded detail */}
                  {selected && (
                    <div className="mt-3 space-y-2.5 border-t border-border-subtle pt-3">
                      <p className="text-xs text-ink-2">{r.description}</p>

                      <div className="rounded-lg bg-surface-2 px-3 py-2.5">
                        <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide mb-1">Suggested action</p>
                        <p className="text-xs text-ink-1">{r.action}</p>
                      </div>

                      <div className="rounded-lg bg-purple-50 dark:bg-purple-900/20 px-3 py-2.5">
                        <p className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">Why am I seeing this?</p>
                        <p className="text-[11px] text-ink-2 leading-relaxed">{r.explainability}</p>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border-subtle" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onApprove(r)}
                      className="flex-1 text-xs font-semibold py-1.5 px-3 rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors active:scale-95"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => onSnooze(r)}
                      className="flex-1 text-xs font-medium py-1.5 px-3 rounded-lg bg-surface-2 hover:bg-surface-3 text-ink-2 border border-border-subtle transition-colors active:scale-95"
                    >
                      Remind Later
                    </button>
                    <button
                      type="button"
                      onClick={() => onDismiss(r)}
                      className="flex-1 text-xs font-medium py-1.5 px-3 rounded-lg bg-surface-2 hover:bg-surface-3 text-ink-3 border border-border-subtle transition-colors active:scale-95"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(dismissed.size > 0 || snoozed.size > 0) && (
        <p className="text-[10px] text-ink-3 mt-2 px-1">
          {dismissed.size > 0 && `${dismissed.size} dismissed`}
          {dismissed.size > 0 && snoozed.size > 0 && ' · '}
          {snoozed.size > 0 && `${snoozed.size} snoozed`}
          {' — '}session only
        </p>
      )}
    </section>
  )
}

// ── Section 2: Decisions Waiting ──────────────────────────────────────────────

function DecisionsWaiting({ pending, approvedPending, onApprovePending, onDeferPending }) {
  const visible = pending.filter(p => !approvedPending.has(p.id))

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold text-ink-1 text-sm">Decisions Waiting</h2>
          <p className="text-[11px] text-ink-3 mt-0.5">Coaching actions awaiting your confirmation</p>
        </div>
        <span className="text-[11px] text-ink-3 bg-surface-2 px-2 py-0.5 rounded-full">{visible.length}</span>
      </div>

      {visible.length === 0 ? (
        <div className="card p-5 text-center">
          <p className="text-xs text-ink-3">No pending decisions</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visible.map(p => (
            <div key={p.id} className={`card p-4 border ${p.urgency === 'HIGH' ? 'border-red-200 dark:border-red-800/40' : p.urgency === 'MEDIUM' ? 'border-amber-200 dark:border-amber-800/40' : 'border-border-subtle'}`}>
              <div className="flex items-start gap-2.5 mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${p.urgency === 'HIGH' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : p.urgency === 'MEDIUM' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-surface-2 text-ink-3'}`}>
                  <PendingIcon type={p.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-ink-1 leading-snug">{p.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {p.team && <span className="text-[10px] text-ink-3">{p.team}</span>}
                    {p.fixture && <><span className="text-[10px] text-ink-3">·</span><span className="text-[10px] text-ink-3">{p.fixture}</span></>}
                    {p.dueBy && <><span className="text-[10px] text-ink-3">·</span><span className={`text-[10px] font-medium ${p.dueBy === 'Today' ? 'text-red-500' : 'text-ink-3'}`}>Due {p.dueBy}</span></>}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-ink-3 mb-3 leading-relaxed">{p.description}</p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onApprovePending(p)}
                  className="flex-1 text-[11px] font-semibold py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors active:scale-95"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onDeferPending(p)}
                  className="flex-1 text-[11px] font-medium py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-ink-2 border border-border-subtle transition-colors active:scale-95"
                >
                  Defer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Section 3: Recently Completed ─────────────────────────────────────────────

function RecentlyCompleted({ completed, localCompleted }) {
  const all = [...localCompleted, ...completed].slice(0, 6)

  return (
    <section>
      <div className="mb-3">
        <h2 className="font-semibold text-ink-1 text-sm">Recently Completed</h2>
        <p className="text-[11px] text-ink-3 mt-0.5">AI-assisted decisions by your coaching team</p>
      </div>

      {all.length === 0 ? (
        <div className="card p-5 text-center">
          <p className="text-xs text-ink-3">No completed decisions yet</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {all.map((c, i) => (
            <div key={c.id ?? i} className="flex items-start gap-3 p-3 rounded-xl bg-surface-1 border border-border-subtle">
              <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${categoryDot(c.category)}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-ink-1 leading-snug">{c.decision}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-[10px] text-ink-3">{c.coach}</span>
                  <span className="text-[10px] text-ink-3">·</span>
                  <span className="text-[10px] text-ink-3">{relTime(c.timestamp)}</span>
                  {c.category && <><span className="text-[10px] text-ink-3">·</span><span className={`text-[10px] font-medium ${categoryColor(c.category)}`}>{c.category}</span></>}
                </div>
              </div>
              {c.outcome && (
                <div className="shrink-0 max-w-[120px]">
                  <p className="text-[10px] text-green-600 dark:text-green-400 text-right leading-snug">{c.outcome}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Section 4: Impact Preview (right panel) ───────────────────────────────────

function ImpactPreview({ rec }) {
  if (!rec) {
    return (
      <div className="card p-6 flex flex-col items-center justify-center min-h-[260px] text-center">
        <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-3">
          <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5 text-purple-500">
            <circle cx="10" cy="9" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M10 5.5V9l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10 14v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>
        <p className="text-sm font-medium text-ink-2">Impact Preview</p>
        <p className="text-xs text-ink-3 mt-1.5 max-w-[200px] leading-relaxed">
          Select a recommendation to see the predicted impact of taking action.
        </p>
      </div>
    )
  }

  const impact = IMPACT_MAP[rec.category] ?? IMPACT_MAP.Performance

  return (
    <div className="card p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${priorityBadge(rec.priority)}`}>{rec.priority}</span>
          <span className={`text-[10px] font-medium ${categoryColor(rec.category)}`}>{rec.category}</span>
        </div>
        <h3 className="text-sm font-semibold text-ink-1 leading-snug">{rec.title}</h3>
      </div>

      {/* Flow diagram */}
      <div className="space-y-2">

        {/* Current situation */}
        <div className="rounded-xl bg-red-50 dark:bg-red-900/15 border border-red-100 dark:border-red-900/30 p-3">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1">{impact.currentLabel}</p>
          <p className="text-xs text-ink-1 leading-snug">{rec.description}</p>
        </div>

        {/* Arrow */}
        <div className="flex justify-center">
          <div className="flex flex-col items-center gap-0.5">
            <div className="w-0.5 h-3 bg-border-subtle" />
            <svg viewBox="0 0 12 8" fill="none" className="w-3 h-2 text-ink-3">
              <path d="M6 7L1 1h10L6 7z" fill="currentColor"/>
            </svg>
          </div>
        </div>

        {/* Recommended action */}
        <div className="rounded-xl bg-blue-50 dark:bg-blue-900/15 border border-blue-100 dark:border-blue-900/30 p-3">
          <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1">{impact.actionLabel}</p>
          <p className="text-xs text-ink-1 leading-snug">{rec.action}</p>
        </div>

        {/* Arrow */}
        <div className="flex justify-center">
          <div className="flex flex-col items-center gap-0.5">
            <div className="w-0.5 h-3 bg-border-subtle" />
            <svg viewBox="0 0 12 8" fill="none" className="w-3 h-2 text-ink-3">
              <path d="M6 7L1 1h10L6 7z" fill="currentColor"/>
            </svg>
          </div>
        </div>

        {/* Expected outcomes */}
        <div className="rounded-xl bg-green-50 dark:bg-green-900/15 border border-green-100 dark:border-green-900/30 p-3">
          <p className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide mb-2">Expected outcomes</p>
          <div className="space-y-1.5">
            {impact.outcomes.map((o, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-ink-2">{o.label}</span>
                <span className={`text-[11px] font-semibold ${o.positive ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{o.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-ink-3 text-center">
        Mock intelligence · Predictions require live AI Brain data
      </p>
    </div>
  )
}

// ── Section 5: Decision History ────────────────────────────────────────────────

const TEAMS    = ['All teams', 'Senior A', 'Senior B', 'Under 20s', 'Under 18s']
const FIXTURES = ['All fixtures', 'vs Naas RFC', 'vs Bective Rangers', 'vs Terenure', 'vs Clontarf RFC']
const PLAYERS  = ['All players', 'Jack O\'Sullivan', 'Ross Dunne', 'Conor Lynch', 'Séan Hennessy']

function DecisionHistory({ history }) {
  const [team,    setTeam]    = useState('All teams')
  const [fixture, setFixture] = useState('All fixtures')
  const [player,  setPlayer]  = useState('All players')
  const [from,    setFrom]    = useState('')

  const events = (history?.events ?? []).filter(e => {
    if (team    !== 'All teams'    && e.teamName    !== team)    return false
    if (player  !== 'All players'  && e.playerName  !== player)  return false
    if (fixture !== 'All fixtures' && e.fixtureSummary && !e.fixtureSummary.includes(fixture.replace('vs ', ''))) return false
    if (from && new Date(e.timestamp) < new Date(from)) return false
    return true
  })

  return (
    <section>
      <div className="mb-3">
        <h2 className="font-semibold text-ink-1 text-sm">Decision History</h2>
        <p className="text-[11px] text-ink-3 mt-0.5">Complete Intelligence Timeline — filter by fixture, team, player, or date</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-3">
        {[
          { value: team,    setter: setTeam,    options: TEAMS,    label: 'Team' },
          { value: fixture, setter: setFixture, options: FIXTURES, label: 'Fixture' },
          { value: player,  setter: setPlayer,  options: PLAYERS,  label: 'Player' },
        ].map(f => (
          <select
            key={f.label}
            value={f.value}
            onChange={e => f.setter(e.target.value)}
            aria-label={`Filter by ${f.label}`}
            className="text-[11px] bg-surface-2 border border-border-subtle rounded-lg px-2.5 py-1.5 text-ink-2 focus:outline-none focus:border-accent"
          >
            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        <input
          type="date"
          value={from}
          onChange={e => setFrom(e.target.value)}
          aria-label="From date"
          className="text-[11px] bg-surface-2 border border-border-subtle rounded-lg px-2.5 py-1.5 text-ink-2 focus:outline-none focus:border-accent"
        />
        {(team !== 'All teams' || fixture !== 'All fixtures' || player !== 'All players' || from) && (
          <button
            type="button"
            onClick={() => { setTeam('All teams'); setFixture('All fixtures'); setPlayer('All players'); setFrom('') }}
            className="text-[11px] text-ink-3 hover:text-ink-2 px-2"
          >
            Clear
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        {events.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-xs text-ink-3">No events match the current filters</p>
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto divide-y divide-border-subtle">
            {events.map(e => (
              <div key={e.id} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2 transition-colors">
                <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${categoryDot(e.category)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-ink-1 leading-snug">{e.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className={`text-[10px] font-medium ${categoryColor(e.category)}`}>{e.category}</span>
                    {e.teamName   && <><span className="text-[10px] text-ink-3">·</span><span className="text-[10px] text-ink-3">{e.teamName}</span></>}
                    {e.playerName && <><span className="text-[10px] text-ink-3">·</span><span className="text-[10px] text-ink-3">{e.playerName}</span></>}
                    <span className="text-[10px] text-ink-3">·</span>
                    <span className="text-[10px] text-ink-3">{relTime(e.timestamp)}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] font-bold ${e.priority === 'HIGH' ? 'text-red-500' : e.priority === 'MEDIUM' ? 'text-amber-500' : 'text-green-500'}`}>
                    {e.priority}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${statusBadge(e.status)}`}>{e.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[10px] text-ink-3 mt-1.5 px-1">
        Showing {events.length} of {history?.total ?? events.length} events
      </p>
    </section>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DecisionCentrePage() {
  const { data, loading, error, reload } = useIntelligenceDecisions()

  // Local action state — persisted for session only
  const [selectedRec,     setSelectedRec]     = useState(null)
  const [dismissed,       setDismissed]       = useState(new Set())
  const [snoozed,         setSnoozed]         = useState(new Set())
  const [approvedPending, setApprovedPending] = useState(new Set())
  const [localCompleted,  setLocalCompleted]  = useState([])
  const [toast,           setToast]           = useState(null)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2800)
  }

  const handleApprove = useCallback(rec => {
    setDismissed(d => { const n = new Set(d); n.delete(rec.id); return n })
    setSnoozed(s => { const n = new Set(s); n.delete(rec.id); return n })
    setLocalCompleted(lc => [{
      id: `local-${rec.id}`, coach: 'Head Coach',
      decision: `Approved: ${rec.title}`,
      timestamp: new Date().toISOString(),
      outcome: 'Awaiting outcome tracking',
      category: rec.category,
    }, ...lc])
    setDismissed(d => new Set([...d, rec.id]))
    if (selectedRec?.id === rec.id) setSelectedRec(null)
    showToast(`Approved: ${rec.title.slice(0, 40)}…`)
    // TODO(intelligence): POST /api/intelligence/decisions/:id/approve
    api.decisionApprove?.(rec.id).catch(() => {})
  }, [selectedRec])

  const handleDismiss = useCallback(rec => {
    setDismissed(d => new Set([...d, rec.id]))
    if (selectedRec?.id === rec.id) setSelectedRec(null)
    showToast(`Dismissed`, 'neutral')
    api.decisionDismiss?.(rec.id).catch(() => {})
  }, [selectedRec])

  const handleSnooze = useCallback(rec => {
    setSnoozed(s => new Set([...s, rec.id]))
    if (selectedRec?.id === rec.id) setSelectedRec(null)
    showToast(`Snoozed 24h`, 'neutral')
    api.decisionSnooze?.(rec.id, 24).catch(() => {})
  }, [selectedRec])

  const handleApprovePending = useCallback(p => {
    setApprovedPending(a => new Set([...a, p.id]))
    setLocalCompleted(lc => [{
      id: `local-pd-${p.id}`, coach: 'Head Coach',
      decision: `Approved: ${p.title}`,
      timestamp: new Date().toISOString(),
      outcome: p.action,
      category: 'Logistics',
    }, ...lc])
    showToast(`Approved: ${p.title.slice(0, 40)}`)
  }, [])

  const handleDeferPending = useCallback(p => {
    setApprovedPending(a => new Set([...a, p.id]))
    showToast(`Deferred: ${p.title.slice(0, 35)}`, 'neutral')
  }, [])

  const recs      = data?.highPriority    ?? []
  const pending   = data?.pending         ?? []
  const completed = data?.recentlyCompleted ?? []
  const history   = data?.history

  const openHigh = recs.filter(r => r.priority === 'HIGH' && !dismissed.has(r.id) && !snoozed.has(r.id)).length

  return (
    <div className="p-5 lg:p-6 max-w-7xl mx-auto relative">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-surface-1 border border-border text-ink-2'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-ink-1">Decision Centre</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-semibold tracking-wide">AI BRAIN</span>
            {data?.isMock && <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-ink-3 font-medium">Preview</span>}
          </div>
          <p className="text-xs text-ink-3">
            AI-proposed actions · Approve, dismiss, or snooze ·
            {data?.generatedAt ? ` Updated ${relTime(data.generatedAt)}` : ' Loading…'}
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink-2 px-3 py-1.5 rounded-lg border border-border-subtle hover:border-border bg-surface-1 transition-colors disabled:opacity-50"
          aria-label="Refresh decisions"
        >
          <svg viewBox="0 0 14 14" fill="none" className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}>
            <path d="M12 7A5 5 0 1 1 7 2M7 2l2 2-2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && !data && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-400 mb-5">
          Intelligence service unavailable — showing preview data. ({error})
        </div>
      )}

      {/* KPI strip */}
      {!loading && data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'High Priority', value: openHigh, sub: 'need decision',     color: openHigh > 0 ? 'text-red-500' : 'text-green-500' },
            { label: 'Waiting',       value: pending.filter(p => !approvedPending.has(p.id)).length, sub: 'pending approval', color: 'text-amber-500' },
            { label: 'Completed',     value: completed.length + localCompleted.length, sub: 'this session', color: 'text-green-500' },
            { label: 'Timeline',      value: history?.total ?? 0, sub: 'total events', color: 'text-ink-2' },
          ].map(k => (
            <div key={k.label} className="card px-4 py-3">
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-[10px] font-medium text-ink-2 mt-0.5">{k.label}</div>
              <div className="text-[10px] text-ink-3">{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">

        {/* Left: main content */}
        <div className="space-y-6">
          {loading ? (
            <div className="space-y-4">
              <Sk h="h-8" /><Sk h="h-64" /><Sk h="h-48" /><Sk h="h-40" /><Sk h="h-64" />
            </div>
          ) : (
            <>
              <HighPriorityActions
                recs={recs}
                dismissed={dismissed}
                snoozed={snoozed}
                onSelect={setSelectedRec}
                selectedId={selectedRec?.id}
                onApprove={handleApprove}
                onDismiss={handleDismiss}
                onSnooze={handleSnooze}
              />
              <DecisionsWaiting
                pending={pending}
                approvedPending={approvedPending}
                onApprovePending={handleApprovePending}
                onDeferPending={handleDeferPending}
              />
              <RecentlyCompleted
                completed={completed}
                localCompleted={localCompleted}
              />
              <DecisionHistory history={history} />
            </>
          )}
        </div>

        {/* Right: Impact Preview — sticky on large screens */}
        <div className="xl:sticky xl:top-6 xl:self-start space-y-4">
          <ImpactPreview rec={selectedRec} />
          {!loading && data?.isMock && (
            <div className="card p-4 border border-purple-200 dark:border-purple-800/40">
              <p className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 mb-1">Preview Mode</p>
              <p className="text-[11px] text-ink-3 leading-relaxed">
                All data is mock intelligence. In production, recommendations are generated live from the AI Brain engines and impact predictions are calculated from your club's historical data.
              </p>
              <p className="text-[10px] text-ink-3 mt-2">
                Feature flag: <code className="font-mono">aiDecisionCentre</code>
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
