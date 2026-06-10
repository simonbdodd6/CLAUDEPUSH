/**
 * RecommendationCard
 *
 * Shared recommendation rendering used by IntelligenceDashboardPage (read-only)
 * and DecisionCentrePage (actionable). The actions prop controls which mode renders.
 *
 * Props:
 *   rec         — recommendation object (new schema)
 *   expanded    — boolean, is the detail panel open?
 *   onToggle    — () => void, toggle expanded state
 *   actions     — optional { onApprove, onDismiss, onSnooze } — if absent, no buttons shown
 *   selected    — boolean, highlighted border (Decision Centre selection)
 */

import { priorityBadge, priorityRing, categoryColor, confidenceLabel } from '../../utils/intelligence.js'

export default function RecommendationCard({ rec, expanded, onToggle, actions, selected }) {
  const ring = selected
    ? 'border-accent/50 ring-1 ring-accent/20 shadow-accent/5'
    : priorityRing(rec.priority)

  return (
    <div
      className={`card border transition-all duration-200 ${ring} ${onToggle ? 'cursor-pointer hover:shadow-md' : ''}`}
      onClick={onToggle}
      role={onToggle ? 'button' : undefined}
      tabIndex={onToggle ? 0 : undefined}
      onKeyDown={onToggle ? e => (e.key === 'Enter' || e.key === ' ') && onToggle() : undefined}
      aria-pressed={selected}
      aria-expanded={expanded}
      aria-label={rec.title}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${priorityBadge(rec.priority)}`}>
              {rec.priority}
            </span>
            <span className="text-[10px] text-ink-3">{rec.confidence}%</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink-1 leading-snug">{rec.title}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-medium ${categoryColor(rec.category)}`}>{rec.category}</span>
              <span className="text-[10px] text-ink-3">·</span>
              <span className="text-[10px] text-ink-3">{confidenceLabel(rec.confidence)} confidence</span>
              {rec.source && rec.source !== 'mock' && (
                <><span className="text-[10px] text-ink-3">·</span>
                <span className="text-[10px] text-ink-3">{rec.source}</span></>
              )}
            </div>
          </div>
          {onToggle && (
            <svg viewBox="0 0 12 12" fill="none" className={`w-3 h-3 text-ink-3 shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}>
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-3 space-y-2.5 border-t border-border-subtle pt-3">
            <p className="text-xs text-ink-2 leading-relaxed">{rec.description}</p>

            <div className="rounded-lg bg-surface-2 px-3 py-2.5">
              <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide mb-1">Suggested action</p>
              <p className="text-xs text-ink-1">{rec.action}</p>
            </div>

            {rec.explainability && (
              <div className="rounded-lg bg-purple-50 dark:bg-purple-900/20 px-3 py-2.5">
                <p className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">
                  Why am I seeing this?
                </p>
                <p className="text-[11px] text-ink-2 leading-relaxed">{rec.explainability}</p>
              </div>
            )}
          </div>
        )}

        {/* Action buttons (Decision Centre mode only) */}
        {actions && (
          <div
            className="flex gap-2 mt-3 pt-3 border-t border-border-subtle"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => actions.onApprove(rec)}
              className="flex-1 text-xs font-semibold py-1.5 px-3 rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors active:scale-95"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => actions.onSnooze(rec)}
              className="flex-1 text-xs font-medium py-1.5 px-3 rounded-lg bg-surface-2 hover:bg-surface-3 text-ink-2 border border-border-subtle transition-colors active:scale-95"
            >
              Remind Later
            </button>
            <button
              type="button"
              onClick={() => actions.onDismiss(rec)}
              className="flex-1 text-xs font-medium py-1.5 px-3 rounded-lg bg-surface-2 hover:bg-surface-3 text-ink-3 border border-border-subtle transition-colors active:scale-95"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
