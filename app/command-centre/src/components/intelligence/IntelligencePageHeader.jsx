/**
 * IntelligencePageHeader
 *
 * Standard header used by every Intelligence screen.
 * Renders the page title, AI BRAIN badge, optional Preview badge,
 * last-updated timestamp, and a Refresh button.
 */

import { relTime } from '../../utils/intelligence.js'

export default function IntelligencePageHeader({ title, subtitle, generatedAt, isMock, loading, onRefresh }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-xl font-bold text-ink-1">{title}</h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-semibold tracking-wide">
            AI BRAIN
          </span>
          {isMock && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-ink-3 font-medium">
              Preview
            </span>
          )}
        </div>
        <p className="text-xs text-ink-3">
          {subtitle}
          {generatedAt ? ` · Updated ${relTime(generatedAt)}` : ' · Loading…'}
        </p>
      </div>

      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink-2 px-3 py-1.5 rounded-lg border border-border-subtle hover:border-border bg-surface-1 transition-colors disabled:opacity-50 shrink-0"
          aria-label={`Refresh ${title}`}
        >
          <svg viewBox="0 0 14 14" fill="none" className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}>
            <path d="M12 7A5 5 0 1 1 7 2M7 2l2 2-2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Refresh
        </button>
      )}
    </div>
  )
}
