/**
 * TimelineEventRow
 *
 * Single row in any Intelligence Timeline rendering.
 * Used by IntelligenceDashboardPage (compact) and DecisionCentrePage (history table).
 */

import { categoryDot, categoryColor, priorityColor, statusBadge, relTime } from '../../utils/intelligence.js'

export default function TimelineEventRow({ event: e, compact = false }) {
  return (
    <div className={`flex items-start gap-3 ${compact ? 'py-1.5 border-b border-border-subtle last:border-0' : 'px-4 py-3 hover:bg-surface-2 transition-colors'}`}>
      <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${categoryDot(e.category)}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-ink-1 leading-snug truncate">{e.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className={`text-[10px] font-medium ${categoryColor(e.category)}`}>{e.category}</span>
          {e.teamName    && <><span className="text-[10px] text-ink-3">·</span><span className="text-[10px] text-ink-3">{e.teamName}</span></>}
          {e.playerName  && <><span className="text-[10px] text-ink-3">·</span><span className="text-[10px] text-ink-3">{e.playerName}</span></>}
          <span className="text-[10px] text-ink-3">·</span>
          <span className="text-[10px] text-ink-3">{relTime(e.timestamp)}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={`text-[10px] font-bold ${priorityColor(e.priority)}`}>{e.priority}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${statusBadge(e.status)}`}>{e.status}</span>
      </div>
    </div>
  )
}
