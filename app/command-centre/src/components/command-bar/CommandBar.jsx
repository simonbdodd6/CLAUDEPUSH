import { useState, useEffect, useRef, useMemo } from 'react'
import { api, MOCK } from '../../api/client.js'
import { Spinner } from '../ui/Spinner.jsx'
import { Badge } from '../ui/Badge.jsx'

const QUICK_PROMPTS = [
  { label: "Prepare Thursday's U14 training",    icon: '🏉', category: 'COACHING' },
  { label: 'Show injured players',               icon: '🩺', category: 'PLAYERS' },
  { label: 'Create sponsor update',              icon: '📣', category: 'COMMUNICATIONS' },
  { label: 'Review attendance',                  icon: '📊', category: 'COACHING' },
  { label: "Run this week's club",               icon: '⚙️', category: 'CLUB_OPERATIONS' },
  { label: 'Club health report',                 icon: '🏛',  category: 'COMMITTEE' },
  { label: 'Create the AGM pack',                icon: '📋', category: 'COMMITTEE' },
  { label: 'Build this week\'s newsletter',      icon: '📰', category: 'COMMUNICATIONS' },
  { label: 'Select the Senior squad',            icon: '👥', category: 'COACHING' },
  { label: 'Generate match report',              icon: '📝', category: 'COMMUNICATIONS' },
]

const CATEGORY_COLORS = {
  COACHING: 'accent',
  PLAYERS: 'success',
  COMMUNICATIONS: 'warning',
  COMMITTEE: 'neutral',
  CLUB_OPERATIONS: 'neutral',
  DIRECTOR_OF_RUGBY: 'danger',
}

export default function CommandBar({ onClose }) {
  const [query, setQuery]   = useState('')
  const [status, setStatus] = useState('idle')   // idle | resolving | running | done | error
  const [result, setResult] = useState(null)
  const [actions, setActions] = useState([])
  const inputRef = useRef(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Esc to close
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Load actions for suggestions
  useEffect(() => {
    api.actions()
      .then(list => setActions(Array.isArray(list) ? list : []))
      .catch(() => {})
  }, [])

  // Filter suggestions from query
  const suggestions = useMemo(() => {
    if (!query.trim()) return QUICK_PROMPTS
    const q = query.toLowerCase()
    const fromActions = actions
      .filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.tags?.some(t => t.includes(q))
      )
      .slice(0, 6)
      .map(a => ({ label: a.name, icon: categoryIcon(a.category), category: a.category, actionId: a.id }))

    const fromPrompts = QUICK_PROMPTS.filter(p => p.label.toLowerCase().includes(q))
    const seen = new Set(fromActions.map(a => a.label))
    const combined = [...fromActions, ...fromPrompts.filter(p => !seen.has(p.label))]
    return combined.slice(0, 8)
  }, [query, actions])

  async function submit(text) {
    const q = (text ?? query).trim()
    if (!q) return

    setStatus('running')
    setResult(null)

    try {
      const res = await api.runNL(q, 'admin')
      setStatus('done')
      setResult(res)
    } catch (e) {
      setStatus('done')
      setResult({ success: false, error: e.message, summary: e.message })
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    submit()
  }

  function reset() {
    setQuery('')
    setResult(null)
    setStatus('idle')
    inputRef.current?.focus()
  }

  const showSuggestions = status === 'idle' && !result

  return (
    <div className="cmd-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cmd-modal mx-4">
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border-subtle">
          <div className="flex-shrink-0 text-ink-3">
            {status === 'running'
              ? <Spinner size={16} />
              : <SearchIcon />
            }
          </div>
          <form className="flex-1" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              className="cmd-input"
              placeholder="What would you like to do?"
              value={query}
              onChange={e => { setQuery(e.target.value); if (result) reset() }}
              disabled={status === 'running'}
            />
          </form>
          {result && (
            <button onClick={reset} className="text-xs text-ink-3 hover:text-ink-2 flex-shrink-0 btn-ghost btn-sm">
              Clear
            </button>
          )}
          <kbd className="flex-shrink-0 text-[10px] text-ink-3 px-1.5 py-0.5 rounded bg-surface-3 font-mono">Esc</kbd>
        </div>

        {/* Suggestions */}
        {showSuggestions && (
          <div className="py-1 max-h-80 overflow-y-auto">
            {!query.trim() && (
              <div className="px-4 pt-2 pb-1">
                <span className="section-title text-[10px]">Quick actions</span>
              </div>
            )}
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => { setQuery(s.label); submit(s.label) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-3 transition-colors duration-100 group"
              >
                <span className="w-7 h-7 rounded-lg bg-surface-3 flex items-center justify-center text-base flex-shrink-0 group-hover:bg-surface-4">
                  {s.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-ink-1 truncate block">{s.label}</span>
                </div>
                <Badge variant={CATEGORY_COLORS[s.category] ?? 'neutral'} className="flex-shrink-0 text-[10px]">
                  {s.category?.replace('_', ' ')}
                </Badge>
              </button>
            ))}
            {query.trim() && suggestions.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-ink-3">
                No matching actions — press Enter to ask the AI
              </div>
            )}
            {/* "Ask AI" row */}
            {query.trim() && (
              <>
                <div className="divider mx-4 my-1" />
                <button
                  onClick={() => submit()}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-3 transition-colors duration-100 group"
                >
                  <span className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center text-accent flex-shrink-0">
                    ✦
                  </span>
                  <span className="text-sm text-ink-1">Ask AI: "<em>{query}</em>"</span>
                  <kbd className="ml-auto text-[10px] text-ink-3 px-1.5 py-0.5 rounded bg-surface-3 font-mono flex-shrink-0">↵</kbd>
                </button>
              </>
            )}
          </div>
        )}

        {/* Running state */}
        {status === 'running' && (
          <div className="flex items-center gap-3 px-4 py-6">
            <Spinner size={14} />
            <span className="text-sm text-ink-2 animate-pulse">Running — "{query}"…</span>
          </div>
        )}

        {/* Result */}
        {status === 'done' && result && (
          <div className="p-4 animate-slide-up">
            {/* Result header */}
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${result.success !== false ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                {result.success !== false ? '✓' : '✕'}
              </span>
              <span className="text-sm font-medium text-ink-1">
                {result.actionName ?? 'Result'}
              </span>
              {result.durationMs > 0 && (
                <span className="text-xs text-ink-3 ml-auto">{result.durationMs}ms</span>
              )}
            </div>

            {/* Summary */}
            {result.summary && (
              <p className="text-sm text-ink-2 leading-relaxed mb-3">{result.summary}</p>
            )}

            {/* Evidence */}
            {result.evidence?.length > 0 && (
              <div className="space-y-1 mb-3">
                {result.evidence.slice(0, 4).map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-ink-3">
                    <span className="mt-0.5 text-accent">›</span>
                    <span>{e}</span>
                  </div>
                ))}
              </div>
            )}

            {result.error && (
              <p className="text-xs text-danger">{result.error}</p>
            )}

            <div className="flex gap-2 mt-3 pt-3 border-t border-border-subtle">
              <button onClick={reset} className="btn-ghost btn btn-sm text-xs">Run another</button>
              <button onClick={onClose} className="btn-ghost btn btn-sm text-xs ml-auto">Close</button>
            </div>
          </div>
        )}

        {/* Footer hint */}
        {status === 'idle' && (
          <div className="px-4 py-2 border-t border-border-subtle flex items-center gap-3 text-[10px] text-ink-3">
            <span><kbd className="font-mono">↵</kbd> run</span>
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">Esc</kbd> close</span>
            <span className="ml-auto">Powered by Coach's Eye AI</span>
          </div>
        )}
      </div>
    </div>
  )
}

function categoryIcon(cat) {
  const icons = {
    COACHING: '🏉', PLAYERS: '👤', COMMUNICATIONS: '📣',
    DIRECTOR_OF_RUGBY: '📊', COMMITTEE: '🏛', CLUB_OPERATIONS: '⚙️',
  }
  return icons[cat] ?? '⚡'
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
